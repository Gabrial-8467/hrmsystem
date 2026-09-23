import type { SeedContext } from './context';

export async function seedAnnouncements(ctx: SeedContext): Promise<void> {
  const { prisma, orgId } = ctx;

  const announcements = [
  {
    organizationId: orgId,
    title: 'Welcome to HRMS Platform!',
    content: 'We have successfully launched our multi-tenant SaaS HR platform. Explore the new employee self-service, leave, attendance, and payroll features.',
    targetAudience: 'ALL',
    publishedAt: new Date(),
  },
  {
    organizationId: orgId,
    title: 'Q4 All-Hands Meeting',
    content: 'Join us for the upcoming quarterly company sync on October 1st at 10:00 AM EST.',
    targetAudience: 'ALL',
    publishedAt: new Date(),
  },
];

for (const announcement of announcements) {
  const existing = await prisma.announcement.findFirst({
    where: { organizationId: orgId, title: announcement.title },
  });
  if (!existing) {
    await prisma.announcement.create({ data: announcement });
  }
}
}