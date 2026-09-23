import type { SeedContext } from './context';

export async function seedShiftAssignments(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  const shifts = await prisma.shift.findMany({ where: { organizationId: orgId } });
  const morning = shifts.find((s) => s.code === 'SH_MORN');
  const evening = shifts.find((s) => s.code === 'SH_EVE');
  const night = shifts.find((s) => s.code === 'SH_NIGHT');
  if (!morning) {
    console.warn('[seed] Skipping shift assignments: SH_MORN shift not found');
    return;
  }

  let created = 0;
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const shift =
      i % 12 === 0 ? (night ?? morning) : i % 5 === 0 ? (evening ?? morning) : morning;

    const existing = await prisma.shiftAssignment.findFirst({
      where: { organizationId: orgId, employeeId: emp.id, shiftId: shift.id },
    });
    if (existing) continue;

    await prisma.shiftAssignment.create({
      data: {
        organizationId: orgId,
        employeeId: emp.id,
        shiftId: shift.id,
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
    });
    created++;
  }

  console.log(`[seed] Assigned ${created} shift assignments`);
}