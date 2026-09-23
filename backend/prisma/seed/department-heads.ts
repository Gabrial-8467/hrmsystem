import type { SeedContext } from './context';

const HEAD_PREFERENCES: Record<string, string[]> = {
  ENG: ['EMP-004', 'VP_ENG', 'ENG_MGR'],
  HR: ['EMP-001', 'HR_DIR', 'HR_MGR'],
  FIN: ['EMP-003', 'FIN_CTRL', 'PAY_MGR'],
  SALES: ['VP_SALES', 'ACC_EXEC'],
  PROD: ['PROD_DIR', 'SR_PM', 'UX_LEAD'],
  OPS: ['OPS_MGR'],
};

export async function seedDepartmentHeads(ctx: SeedContext): Promise<SeedContext> {
  const { prisma, orgId } = ctx;

  const existing = await prisma.employee.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      employeeCode: true,
      departmentId: true,
      designation: { select: { code: true, level: true } },
    },
  });

  for (const [deptCode, deptId] of Object.entries(ctx.departments)) {
    const deptEmps = existing.filter((e) => e.departmentId === deptId);
    if (deptEmps.length === 0) continue;

    const prefs = HEAD_PREFERENCES[deptCode] ?? [];
    let head = deptEmps.find((e) => {
      const lc = e.employeeCode;
      const dCode = e.designation?.code ?? '';
      return prefs.includes(lc) || prefs.includes(dCode);
    });
    if (!head) {
      head = [...deptEmps].sort((a, b) => (b.designation?.level ?? 0) - (a.designation?.level ?? 0))[0];
    }

    await prisma.department.update({
      where: { id: deptId },
      data: { managerId: head.id },
    });
  }

  console.log('[seed] Department heads assigned');

  return ctx;
}