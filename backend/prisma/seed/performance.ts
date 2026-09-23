import type { SeedContext } from './context';

export async function seedPerformance(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  let cycle = await prisma.performanceCycle.findFirst({
    where: { organizationId: orgId, title: 'Q3 2026 Performance Review' },
  });
  if (!cycle) {
    cycle = await prisma.performanceCycle.create({
      data: {
        organizationId: orgId,
        title: 'Q3 2026 Performance Review',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-09-30'),
        status: 'ACTIVE',
      },
    });
  }

  if (employees.length > 4 && !(await prisma.performanceGoal.findFirst({
    where: { organizationId: orgId, employeeId: employees[4].id, title: 'Deliver Core HRMS Dashboard & Analytics' },
  }))) {
    await prisma.performanceGoal.create({
      data: {
        organizationId: orgId,
        employeeId: employees[4].id,
        title: 'Deliver Core HRMS Dashboard & Analytics',
        description: 'Complete Phase 1 - 10 implementation of enterprise SaaS platform with zero lint errors.',
        targetValue: 100,
        currentValue: 85,
        unit: '%',
        dueDate: new Date('2026-09-30'),
        status: 'IN_PROGRESS',
      },
    });
  }
}