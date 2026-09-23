import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { sendError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';
import { env } from '../../config/env';

const DOCUMENT_CATEGORIES = ['IDENTIFICATION', 'CONTRACT', 'RESUME', 'CERTIFICATE', 'TAX', 'OTHER'] as const;

const documentLinkSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  url: z.string().url(),
  employeeId: z.string().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
});

const documentUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  expiryDate: z.coerce.date().optional().nullable(),
  verified: z.boolean().optional(),
});

// Extensions we are willing to store and serve back verbatim.
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg', '.gif',
]);

function uploadRoot(): string {
  return resolve(env.UPLOAD_DIR);
}

async function storeFile(buffer: Buffer, originalName: string): Promise<string> {
  const dir = uploadRoot();
  await mkdir(dir, { recursive: true });
  const ext = ALLOWED_EXTENSIONS.has(extname(basename(originalName)).toLowerCase())
    ? extname(basename(originalName)).toLowerCase()
    : '';
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(dir, filename), buffer);
  return `uploads/${filename}`;
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', {
    preHandler: [authenticate, requirePermission('documents.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.employeeDocument.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.get('/:id/content', {
    preHandler: [authenticate, requirePermission('documents.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const doc = await app.prisma.employeeDocument.findFirst({ where: { id, organizationId: orgId } });
    if (!doc) return sendError(reply, 'DOCUMENT_NOT_FOUND', 'Document not found', 404);

    // Remote documents redirect to their source URL.
    if (/^https?:\/\//i.test(doc.fileUrl)) {
      return reply.redirect(doc.fileUrl, 302);
    }

    const filePath = resolve(uploadRoot(), doc.fileUrl.replace(/^uploads\//, ''));
    if (!filePath.startsWith(uploadRoot())) {
      return sendError(reply, 'DOCUMENT_ACCESS_DENIED', 'Invalid document path', 403);
    }
    if (!existsSync(filePath)) {
      return sendError(reply, 'DOCUMENT_MISSING', 'File is missing from storage', 404);
    }

    reply.header('content-type', doc.mimeType || 'application/octet-stream');
    reply.header('content-disposition', `inline; filename="${doc.title.replace(/"/g, '')}"`);
    await pipeline(createReadStream(filePath), reply.raw);
    return reply;
  });

  // Multipart file upload.
  app.post('/upload', {
    preHandler: [authenticate, requirePermission('documents.upload')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const data = await request.file();
    if (!data) return sendError(reply, 'INVALID_REQUEST', 'No file was provided', 400);

    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.fields ?? {})) {
      const raw = Array.isArray(value) ? value[0] : value;
      fields[key] = typeof raw === 'object' && raw && 'value' in raw ? String((raw as { value: string }).value) : String(raw ?? '');
    }
    const title = fields.title?.trim() || data.filename?.trim() || 'Untitled document';
    const category = (fields.category as (typeof DOCUMENT_CATEGORIES)[number] | undefined) ?? 'OTHER';
    if (!DOCUMENT_CATEGORIES.includes(category as (typeof DOCUMENT_CATEGORIES)[number])) {
      await data.file.resume();
      return sendError(reply, 'INVALID_REQUEST', 'Invalid document category', 400);
    }

    let employeeId: string | null = fields.employeeId || null;
    if (employeeId) {
      const belongs = await app.prisma.employee.findFirst({ where: { id: employeeId, organizationId: orgId } });
      if (!belongs) {
        await data.file.resume();
        return sendError(reply, 'INVALID_REFERENCE', 'Employee does not belong to this organization', 400);
      }
    } else {
      const self = await app.prisma.employee.findFirst({ where: { userId: request.user!.id, organizationId: orgId } });
      employeeId = self?.id ?? null;
    }
    if (!employeeId) {
      await data.file.resume();
      return sendError(reply, 'EMPLOYEE_REQUIRED', 'A target employee is required to save a document', 400);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) return sendError(reply, 'INVALID_REQUEST', 'Uploaded file is empty', 400);
    if (buffer.length > 25 * 1024 * 1024) return sendError(reply, 'INVALID_REQUEST', 'File exceeds the 25MB limit', 413);

    const fileUrl = await storeFile(buffer, data.filename || 'document');

    const doc = await app.prisma.employeeDocument.create({
      data: {
        organizationId: orgId,
        employeeId,
        title,
        category,
        fileUrl,
        fileSize: buffer.length,
        mimeType: data.mimetype || 'application/octet-stream',
        uploadedBy: request.user!.id,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'documents.document_create',
      entity: 'document',
      entityId: doc.id,
      oldValue: null,
      newValue: { title: doc.title, category: doc.category, fileSize: doc.fileSize },
    });
    return sendSuccess(reply, doc, 'Document uploaded successfully');
  });

  // Register a remote/linked document.
  app.post('/', {
    preHandler: [authenticate, requirePermission('documents.upload')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = documentLinkSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid document payload', 400, parsed.error.flatten().fieldErrors);
    }
    let employeeId: string | null = parsed.data.employeeId ?? null;
    if (employeeId) {
      const belongs = await app.prisma.employee.findFirst({ where: { id: employeeId, organizationId: orgId } });
      if (!belongs) return sendError(reply, 'INVALID_REFERENCE', 'Employee does not belong to this organization', 400);
    } else {
      const self = await app.prisma.employee.findFirst({ where: { userId: request.user!.id, organizationId: orgId } });
      employeeId = self?.id ?? null;
    }
    if (!employeeId) {
      return sendError(reply, 'EMPLOYEE_REQUIRED', 'A target employee is required to save a document', 400);
    }

    const doc = await app.prisma.employeeDocument.create({
      data: {
        organizationId: orgId,
        employeeId,
        title: parsed.data.title,
        category: parsed.data.category ?? 'OTHER',
        fileUrl: parsed.data.url,
        expiryDate: parsed.data.expiryDate ?? null,
        uploadedBy: request.user!.id,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'documents.document_create',
      entity: 'document',
      entityId: doc.id,
      oldValue: null,
      newValue: { title: doc.title, category: doc.category, fileUrl: doc.fileUrl },
    });
    return sendSuccess(reply, doc, 'Document registered');
  });

  app.patch('/:id', {
    preHandler: [authenticate, requirePermission('documents.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = documentUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid document payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.employeeDocument.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'DOCUMENT_NOT_FOUND', 'Document not found', 404);

    const data: Record<string, unknown> = { ...parsed.data };
    delete data.verified;
    if (parsed.data.verified === true) data.verifiedAt = new Date();
    if (parsed.data.expiryDate === null) data.expiryDate = null;

    const doc = await app.prisma.employeeDocument.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'documents.document_update',
      entity: 'document',
      entityId: doc.id,
      oldValue: { title: existing.title, verified: Boolean(existing.verifiedAt) },
      newValue: { title: doc.title, verified: Boolean(doc.verifiedAt) },
    });
    return sendSuccess(reply, doc, 'Document updated successfully');
  });

  app.delete('/:id', {
    preHandler: [authenticate, requirePermission('documents.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const doc = await app.prisma.employeeDocument.findFirst({ where: { id, organizationId: orgId } });
    if (!doc) return sendError(reply, 'DOCUMENT_NOT_FOUND', 'Document not found', 404);

    if (!/^https?:\/\//i.test(doc.fileUrl)) {
      const filePath = resolve(uploadRoot(), doc.fileUrl.replace(/^uploads\//, ''));
      try {
        if (existsSync(filePath)) await unlink(filePath);
      } catch {
        // Best-effort cleanup; the record is removed regardless.
      }
    }

    await app.prisma.employeeDocument.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'documents.document_delete',
      entity: 'document',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Document deleted successfully');
  });
}