import type { SeedContext } from './context';

const NOTIFICATION_TEMPLATES = [
  { title: 'Welcome to HRMS', message: 'Your employee self-service account is ready.', type: 'INFO', link: '/', isRead: true },
  { title: 'Leave request approved', message: 'Your annual leave has been approved.', type: 'SUCCESS', link: '/leave', isRead: false },
  { title: 'Payslip available', message: 'Your latest payslip is now available.', type: 'INFO', link: '/payroll/payslips', isRead: false },
  { title: 'Expense awaiting approval', message: 'Your submitted expense is awaiting approval.', type: 'ALERT', link: '/expenses', isRead: false },
  { title: 'Complete your profile', message: 'Please verify your emergency contact details.', type: 'ACTION', link: '/me', isRead: false },
];

export async function seedNotifications(ctx: SeedContext): Promise<void> {
  const { prisma, orgId } = ctx;
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'asc' },
    take: 6,
  });

  let created = 0;
  for (let i = 0; i < users.length; i++) {
    for (let n = 0; n < NOTIFICATION_TEMPLATES.length; n++) {
      const user = users[i];
      const notif = NOTIFICATION_TEMPLATES[(i + n) % NOTIFICATION_TEMPLATES.length];

      const existing = await prisma.notification.findFirst({
        where: { organizationId: orgId, userId: user.id, title: notif.title },
      });
      if (existing) continue;

      await prisma.notification.create({
        data: { organizationId: orgId, userId: user.id, ...notif },
      });
      created++;
    }
  }

  console.log(`[seed] Created ${created} notifications`);
}