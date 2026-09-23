import { PayrollStatus, PayslipStatus } from '@prisma/client';
import type { SeedContext } from './context';

const SALARY_COMPONENTS = [
  { name: 'Basic Salary', code: 'BASIC', type: 'EARNING', calculationType: 'FIXED', calculationValue: 0 },
  { name: 'House Rent Allowance (HRA)', code: 'HRA', type: 'EARNING', calculationType: 'PERCENTAGE', calculationValue: 40 },
  { name: 'Special Allowance', code: 'SPECIAL', type: 'EARNING', calculationType: 'FIXED', calculationValue: 0 },
  { name: 'Provident Fund (PF)', code: 'PF', type: 'DEDUCTION', calculationType: 'PERCENTAGE', calculationValue: 12 },
  { name: 'Income Tax (TDS)', code: 'TAX', type: 'DEDUCTION', calculationType: 'PERCENTAGE', calculationValue: 8 },
];

const TAX_PERCENT = 8;

const PAST_MONTHS: { month: number; year: number; status: PayrollStatus; factor: number }[] = [
  { month: 4, year: 2026, status: PayrollStatus.PROCESSED, factor: 0.96 },
  { month: 5, year: 2026, status: PayrollStatus.PROCESSED, factor: 0.97 },
  { month: 6, year: 2026, status: PayrollStatus.PROCESSED, factor: 0.98 },
  { month: 7, year: 2026, status: PayrollStatus.PROCESSED, factor: 1.0 },
  { month: 8, year: 2026, status: PayrollStatus.PAID, factor: 1.02 },
  { month: 9, year: 2026, status: PayrollStatus.DRAFT, factor: 1.04 },
];

export async function seedPayroll(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  for (const sc of SALARY_COMPONENTS) {
    await prisma.salaryComponent.upsert({
      where: { organizationId_code: { organizationId: orgId, code: sc.code } },
      create: { organizationId: orgId, ...sc },
      update: { name: sc.name, type: sc.type, calculationType: sc.calculationType, calculationValue: sc.calculationValue },
    });
  }

  for (const pm of PAST_MONTHS) {
    const run = await prisma.payrollRun.upsert({
      where: { organizationId_month_year: { organizationId: orgId, month: pm.month, year: pm.year } },
      create: {
        organizationId: orgId,
        month: pm.month,
        year: pm.year,
        startDate: new Date(2026, pm.month - 1, 1),
        endDate: new Date(2026, pm.month, 0),
        status: pm.status,
        processedBy: employees[0]?.id,
      },
      update: {},
    });

    for (const emp of employees.slice(0, 20)) {
      const basic = Math.round((emp.basicSalary / 12) * pm.factor);
      const allowances = Math.round(basic * 0.4);
      const deductions = Math.round(basic * 0.12);
      const taxDeducted = Math.round((basic + allowances) * (TAX_PERCENT / 100));
      const net = basic + allowances - deductions - taxDeducted;

      const existing = await prisma.payslip.findFirst({
        where: { payrollRunId: run.id, employeeId: emp.id },
      });
      if (existing) {
        await prisma.payslip.update({
          where: { id: existing.id },
          data: {
            basicSalary: basic,
            allowances,
            deductions,
            netPay: net,
            taxDeducted,
            status: pm.status === PayrollStatus.PAID ? PayslipStatus.PAID : PayslipStatus.GENERATED,
            paymentDate: pm.status === PayrollStatus.PAID ? new Date(2026, pm.month, 1) : null,
          },
        });
        continue;
      }

      await prisma.payslip.create({
        data: {
          organizationId: orgId,
          payrollRunId: run.id,
          employeeId: emp.id,
          basicSalary: basic,
          allowances,
          deductions,
          netPay: net,
          taxDeducted,
          status: pm.status === PayrollStatus.PAID ? PayslipStatus.PAID : PayslipStatus.GENERATED,
          paymentDate: pm.status === PayrollStatus.PAID ? new Date(2026, pm.month, 1) : null,
        },
      });
    }

    const totals = await prisma.payslip.aggregate({
      where: { payrollRunId: run.id },
      _sum: { basicSalary: true, allowances: true, deductions: true, netPay: true },
    });
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        totalGross: Math.round((totals._sum.basicSalary ?? 0) + (totals._sum.allowances ?? 0)),
        totalDeductions: Math.round(totals._sum.deductions ?? 0),
        totalNet: Math.round(totals._sum.netPay ?? 0),
      },
    });
  }
}