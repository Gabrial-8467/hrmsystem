import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';
import { contextFromReq } from '../../services/audit';

const createJobSchema = z.object({
  title: z.string().min(1).max(160),
  code: z.string().min(1).max(40),
  description: z.string().min(1),
  requirements: z.string().max(4000).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  departmentId: z.string().optional().nullable(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ON_HOLD']).optional(),
  positionsCount: z.number().int().min(1).max(1000).optional(),
});

const jobUpdateSchema = createJobSchema.partial();

const candidateBodySchema = z.object({
  jobOpeningId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable(),
  resumeUrl: z.string().url().max(500).optional().nullable(),
  rating: z.number().int().min(0).max(5).optional(),
});

const candidateUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional().nullable(),
  resumeUrl: z.string().url().max(500).optional().nullable(),
  rating: z.number().int().min(0).max(5).optional(),
  status: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']).optional(),
});

const interviewBodySchema = z.object({
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().max(200).optional().nullable(),
  stage: z.string().min(1).max(80).optional(),
  interviewerId: z.string().optional().nullable(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
});

const interviewUpdateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().max(200).optional().nullable(),
  stage: z.string().min(1).max(80).optional(),
  interviewerId: z.string().optional().nullable(),
  feedback: z.string().max(2000).optional().nullable(),
  score: z.number().int().min(0).max(100).optional().nullable(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
});

const STAGE_ORDER: Record<string, number> = { APPLIED: 0, SCREENING: 1, INTERVIEW: 2, OFFER: 3, HIRED: 4 };

export async function recruitmentRoutes(app: FastifyInstance): Promise<void> {
  // --- Jobs ---
  app.get('/jobs', {
    preHandler: [authenticate, requirePermission('jobs.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.jobOpening.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { candidates: true } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.get('/jobs/:id', {
    preHandler: [authenticate, requirePermission('jobs.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const job = await app.prisma.jobOpening.findFirst({
      where: { id, organizationId: orgId },
      include: {
        department: { select: { id: true, name: true } },
        candidates: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!job) return sendError(reply, 'JOB_NOT_FOUND', 'Job opening not found', 404);
    return sendSuccess(reply, job);
  });

  app.post('/jobs', {
    preHandler: [authenticate, requirePermission('jobs.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid job payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    if (body.departmentId) {
      const belongs = await app.prisma.department.count({ where: { id: body.departmentId, organizationId: orgId } });
      if (!belongs) return sendError(reply, 'INVALID_REFERENCE', 'Department does not belong to this organization', 400);
    }

    const code = body.code.toUpperCase();
    const dup = await app.prisma.jobOpening.findFirst({ where: { organizationId: orgId, code } });
    if (dup) return sendError(reply, 'JOB_EXISTS', `A job opening with code ${code} already exists`, 409);

    const job = await app.prisma.jobOpening.create({
      data: {
        organizationId: orgId,
        title: body.title,
        code,
        description: body.description,
        requirements: body.requirements ?? null,
        location: body.location ?? null,
        departmentId: body.departmentId ?? null,
        employmentType: body.employmentType ?? 'FULL_TIME',
        status: body.status ?? 'OPEN',
        positionsCount: body.positionsCount ?? 1,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.job_create',
      entity: 'jobOpening',
      entityId: job.id,
      oldValue: null,
      newValue: { title: job.title, code: job.code, status: job.status },
    });
    return sendSuccess(reply, job, 'Job opening created successfully');
  });

  app.patch('/jobs/:id', {
    preHandler: [authenticate, requirePermission('jobs.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = jobUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid job payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.jobOpening.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'JOB_NOT_FOUND', 'Job opening not found', 404);

    if (parsed.data.departmentId) {
      const belongs = await app.prisma.department.count({
        where: { id: parsed.data.departmentId, organizationId: orgId },
      });
      if (!belongs) return sendError(reply, 'INVALID_REFERENCE', 'Department does not belong to this organization', 400);
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (typeof data.code === 'string') {
      data.code = (data.code as string).toUpperCase();
      if (data.code !== existing.code) {
        const dup = await app.prisma.jobOpening.findFirst({ where: { organizationId: orgId, code: data.code as string } });
        if (dup) return sendError(reply, 'JOB_EXISTS', `A job opening with code ${data.code} already exists`, 409);
      }
    }

    const job = await app.prisma.jobOpening.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.job_update',
      entity: 'jobOpening',
      entityId: job.id,
      oldValue: { title: existing.title, status: existing.status },
      newValue: { title: job.title, status: job.status },
    });
    return sendSuccess(reply, job, 'Job opening updated successfully');
  });

  app.delete('/jobs/:id', {
    preHandler: [authenticate, requirePermission('jobs.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const job = await app.prisma.jobOpening.findFirst({ where: { id, organizationId: orgId } });
    if (!job) return sendError(reply, 'JOB_NOT_FOUND', 'Job opening not found', 404);

    const candidatesCount = await app.prisma.candidate.count({ where: { jobOpeningId: id, organizationId: orgId } });
    if (candidatesCount > 0) {
      return sendError(reply, 'JOB_HAS_CANDIDATES', 'Job opening has candidates and cannot be deleted', 409);
    }

    await app.prisma.jobOpening.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.job_delete',
      entity: 'jobOpening',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Job opening deleted successfully');
  });

  // --- Candidates ---
  app.get('/candidates', {
    preHandler: [authenticate, requirePermission('candidates.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.candidate.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        jobOpening: { select: { id: true, title: true, code: true } },
        interviews: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    return sendSuccess(reply, items);
  });

  app.post('/candidates', {
    preHandler: [authenticate, requirePermission('candidates.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const parsed = candidateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid candidate payload', 400, parsed.error.flatten().fieldErrors);
    }
    const body = parsed.data;

    const job = await app.prisma.jobOpening.findFirst({ where: { id: body.jobOpeningId, organizationId: orgId } });
    if (!job) return sendError(reply, 'INVALID_REFERENCE', 'Job opening does not belong to this organization', 400);

    const email = body.email.toLowerCase().trim();
    const dup = await app.prisma.candidate.findFirst({
      where: { organizationId: orgId, jobOpeningId: job.id, email },
    });
    if (dup) return sendError(reply, 'CANDIDATE_EXISTS', 'A candidate with this email already applied to this job', 409);

    const candidate = await app.prisma.candidate.create({
      data: {
        organizationId: orgId,
        jobOpeningId: job.id,
        firstName: body.firstName,
        lastName: body.lastName,
        email,
        phone: body.phone ?? null,
        resumeUrl: body.resumeUrl ?? null,
        rating: body.rating ?? 0,
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.candidate_create',
      entity: 'candidate',
      entityId: candidate.id,
      oldValue: null,
      newValue: { name: `${candidate.firstName} ${candidate.lastName}`, jobOpeningId: candidate.jobOpeningId, status: candidate.status },
    });
    return sendSuccess(reply, candidate, 'Candidate added to pipeline');
  });

  app.patch('/candidates/:id', {
    preHandler: [authenticate, requirePermission('candidates.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = candidateUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid candidate payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.candidate.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'CANDIDATE_NOT_FOUND', 'Candidate not found', 404);

    if (parsed.data.status) {
      if (existing.status === 'HIRED' && parsed.data.status !== 'HIRED') {
        return sendError(reply, 'CANDIDATE_TERMINAL_STATE', 'Hired candidates cannot be moved to another stage', 409);
      }
      if (existing.status === 'REJECTED' && parsed.data.status !== 'REJECTED') {
        return sendError(reply, 'CANDIDATE_TERMINAL_STATE', 'Rejected candidates cannot be moved back into the pipeline', 409);
      }
      const from = STAGE_ORDER[existing.status];
      const to = STAGE_ORDER[parsed.data.status];
      if (to !== undefined) {
        if (to > from + 1) {
          return sendError(reply, 'INVALID_TRANSITION', `Cannot jump from ${existing.status} to ${parsed.data.status}`, 409);
        }
        if (existing.status !== 'HIRED' && parsed.data.status !== 'REJECTED' && to < from) {
          return sendError(reply, 'INVALID_TRANSITION', `Cannot move a candidate backward from ${existing.status} to ${parsed.data.status}`, 409);
        }
      }
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (typeof data.email === 'string') data.email = (data.email as string).toLowerCase().trim();

    const candidate = await app.prisma.candidate.update({ where: { id: existing.id }, data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.candidate_update',
      entity: 'candidate',
      entityId: candidate.id,
      oldValue: { status: existing.status, rating: existing.rating },
      newValue: { status: candidate.status, rating: candidate.rating },
    });
    return sendSuccess(reply, candidate, `Candidate moved to ${candidate.status}`);
  });

  app.delete('/candidates/:id', {
    preHandler: [authenticate, requirePermission('candidates.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const candidate = await app.prisma.candidate.findFirst({ where: { id, organizationId: orgId } });
    if (!candidate) return sendError(reply, 'CANDIDATE_NOT_FOUND', 'Candidate not found', 404);

    const interviewsCount = await app.prisma.interview.count({ where: { candidateId: id, organizationId: orgId } });
    if (interviewsCount > 0) {
      return sendError(reply, 'CANDIDATE_HAS_INTERVIEWS', 'Candidate has interviews and cannot be deleted', 409);
    }

    await app.prisma.candidate.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.candidate_delete',
      entity: 'candidate',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Candidate removed from pipeline');
  });

  // --- Interviews ---
  app.get('/interviews', {
    preHandler: [authenticate, requirePermission('interviews.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const items = await app.prisma.interview.findMany({
      where: {
        organizationId: orgId,
        ...(request.query as { upcoming?: string }).upcoming === 'true'
          ? { scheduledAt: { gte: new Date() } }
          : {},
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            jobOpening: { select: { id: true, title: true } },
          },
        },
      },
    });
    return sendSuccess(reply, items);
  });

  app.post('/candidates/:candidateId/interviews', {
    preHandler: [authenticate, requirePermission('interviews.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { candidateId } = request.params as { candidateId: string };
    const parsed = interviewBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid interview payload', 400, parsed.error.flatten().fieldErrors);
    }
    const candidate = await app.prisma.candidate.findFirst({ where: { id: candidateId, organizationId: orgId } });
    if (!candidate) return sendError(reply, 'CANDIDATE_NOT_FOUND', 'Candidate not found', 404);
    if (candidate.status === 'HIRED' || candidate.status === 'REJECTED') {
      return sendError(reply, 'CANDIDATE_TERMINAL_STATE', 'Interviews cannot be scheduled for hired or rejected candidates', 409);
    }

    const interview = await app.prisma.interview.create({
      data: {
        organizationId: orgId,
        candidateId: candidate.id,
        interviewerId: parsed.data.interviewerId ?? null,
        scheduledAt: parsed.data.scheduledAt,
        durationMinutes: parsed.data.durationMinutes ?? 45,
        location: parsed.data.location ?? null,
        stage: parsed.data.stage ?? 'Technical Interview',
        status: parsed.data.status ?? 'SCHEDULED',
      },
    });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.interview_create',
      entity: 'interview',
      entityId: interview.id,
      oldValue: null,
      newValue: { candidateId: candidate.id, scheduledAt: interview.scheduledAt.toISOString(), stage: interview.stage },
    });
    return sendSuccess(reply, interview, 'Interview scheduled');
  });

  app.patch('/interviews/:id', {
    preHandler: [authenticate, requirePermission('interviews.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = interviewUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 'INVALID_REQUEST', 'Invalid interview payload', 400, parsed.error.flatten().fieldErrors);
    }
    const existing = await app.prisma.interview.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return sendError(reply, 'INTERVIEW_NOT_FOUND', 'Interview not found', 404);

    if (parsed.data.status && existing.status === 'COMPLETED' && parsed.data.status !== 'COMPLETED') {
      return sendError(reply, 'INTERVIEW_TERMINAL_STATE', 'Completed interviews cannot change status', 409);
    }
    if (parsed.data.status === 'CANCELLED' && existing.status === 'COMPLETED') {
      return sendError(reply, 'INTERVIEW_TERMINAL_STATE', 'Completed interviews cannot be cancelled', 409);
    }

    const interview = await app.prisma.interview.update({ where: { id: existing.id }, data: parsed.data });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.interview_update',
      entity: 'interview',
      entityId: interview.id,
      oldValue: { status: existing.status, score: existing.score },
      newValue: { status: interview.status, score: interview.score },
    });
    return sendSuccess(reply, interview, 'Interview updated');
  });

  app.delete('/interviews/:id', {
    preHandler: [authenticate, requirePermission('interviews.manage')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const { id } = request.params as { id: string };
    const interview = await app.prisma.interview.findFirst({ where: { id, organizationId: orgId } });
    if (!interview) return sendError(reply, 'INTERVIEW_NOT_FOUND', 'Interview not found', 404);
    await app.prisma.interview.delete({ where: { id } });
    await app.audit.record({
      ...contextFromReq(request),
      action: 'recruitment.interview_delete',
      entity: 'interview',
      entityId: id,
    });
    return sendSuccess(reply, null, 'Interview deleted successfully');
  });
}