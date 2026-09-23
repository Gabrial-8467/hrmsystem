import type { SeedContext } from './context';

export async function seedEmployeeSalaries(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;
  const effectiveDate = new Date('2026-01-01');

  let created = 0;
  for (const emp of employees) {
    const basic = Math.round(emp.basicSalary / 12);
    const allowances = Math.round(basic * 0.4);
    const deductions = Math.round(basic * 0.12);
    const net = basic + allowances - deductions;

    const existing = await prisma.employeeSalary.findFirst({
      where: { organizationId: orgId, employeeId: emp.id, effectiveDate },
    });
    if (existing) continue;

    await prisma.employeeSalary.create({
      data: {
        organizationId: orgId,
        employeeId: emp.id,
        basicSalary: basic,
        allowances,
        deductions,
        netSalary: net,
        effectiveDate,
      },
    });
    created++;
  }

  console.log(`[seed] Created ${created} employee salary records`);
}