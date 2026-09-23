import type { SeedContext } from './context';

const AUDIT_EVENTS = [
  {
    action: 'auth.login',
    entity: 'user',
    newValue: { status: 'ACTIVE' },
    metadata: { ip: '192.168.1.10', userAgent: 'Chrome/126.0' },
    hoursAgo: 2,
  },
  {
    action: 'users.create',
    entity: 'user',
    newValue: { role: 'EMPLOYEE' },
    metadata: { ip: '192.168.1.10', userAgent: 'Chrome/126.0' },
    hoursAgo: 26,
  },
  {
    action: 'employees.create',
    entity: 'employee',
    newValue: { department: 'Engineering', employmentType: 'FULL_TIME' },
    metadata: { ip: '192.168.1.10' },
    hoursAgo: 26,
  },
  {
    action: 'employees.update',
    entity: 'employee',
    oldValue: { salary: 100000 },
    newValue: { salary: 115000 },
    metadata: { ip: '192.168.1.10', userAgent: 'Chrome/126.0' },
    hoursAgo: 50,
  },
  {
    action: 'leave.approve',
    entity: 'leave',
    newValue: { status: 'APPROVED' },
    metadata: { ip: '192.168.1.20' },
    hoursAgo: 74,
  },
  {
    action: 'payroll.process',
    entity: 'payroll',
    newValue: { month: 8, year: 2026, status: 'PAID' },
    metadata: { ip: '192.168.1.20', userAgent: 'Chrome/126.0' },
    hoursAgo: 96,
  },
];

export async function seedAuditLogs(ctx: SeedContext): Promise<void> {
  const { prisma, orgId } = ctx;
  const actor = await prisma.user.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  const base = new Date('2026-09-19T08:00:00Z');
  for (const e of AUDIT_EVENTS) {
    const createdAt = new Date(base.getTime() - e.hoursAgo * 3600_000);

    const existing = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgId,
        userId: actor?.id ?? null,
        action: e.action,
        entity: e.entity,
        createdAt,
      },
    });
    if (existing) continue;

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: actor?.id ?? null,
        action: e.action,
        entity: e.entity,
        entityId: actor?.id ?? null,
        oldValue: e.oldValue,
        newValue: e.newValue,
        metadata: e.metadata,
        ipAddress: '192.168.1.10',
        userAgent: e.metadata?.userAgent ?? 'Mozilla/5.0 (compatible; HRMS)',
        createdAt,
      },
    });
    created++;
  }

  console.log(`[seed] Created ${created} audit logs`);
}