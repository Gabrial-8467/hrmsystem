import { DocumentCategory } from '@prisma/client';
import type { SeedContext } from './context';

const DOCUMENT_TEMPLATES = [
  { empIdx: 4, title: 'Employment Offer Letter', category: DocumentCategory.CONTRACT, size: 245760, mime: 'application/pdf', verified: true },
  { empIdx: 4, title: 'Signed Employment Contract', category: DocumentCategory.CONTRACT, size: 334895, mime: 'application/pdf', verified: true },
  { empIdx: 5, title: 'Government Issued ID', category: DocumentCategory.IDENTIFICATION, size: 512000, mime: 'image/png', verified: false },
  { empIdx: 5, title: 'Updated Resume', category: DocumentCategory.RESUME, size: 189434, mime: 'application/pdf', verified: true },
  { empIdx: 3, title: 'Degree Certificate', category: DocumentCategory.CERTIFICATE, size: 420000, mime: 'application/pdf', verified: false },
  { empIdx: 6, title: 'Tax Withholding Declaration', category: DocumentCategory.TAX, size: 98764, mime: 'application/pdf', verified: true },
];

export async function seedEmployeeDocuments(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  let created = 0;
  for (const d of DOCUMENT_TEMPLATES) {
    const emp = employees[d.empIdx];
    if (!emp) continue;

    const fileName = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existing = await prisma.employeeDocument.findFirst({
      where: { organizationId: orgId, employeeId: emp.id, title: d.title },
    });
    if (existing) continue;

    await prisma.employeeDocument.create({
      data: {
        organizationId: orgId,
        employeeId: emp.id,
        title: d.title,
        category: d.category,
        fileUrl: `https://files.acme.dev/org/${orgId}/employees/${emp.employeeCode}/${fileName}.pdf`,
        fileSize: d.size,
        mimeType: d.mime,
        expiryDate: d.category === DocumentCategory.CONTRACT ? new Date('2028-01-15') : null,
        verifiedAt: d.verified ? new Date() : null,
        uploadedBy: employees[0]?.id,
      },
    });
    created++;
  }

  console.log(`[seed] Created ${created} employee documents`);
}