import { ExpenseStatus } from '@prisma/client';
import type { SeedContext } from './context';

export async function seedExpenses(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  const expenses = [
    {
      organizationId: orgId,
      employeeId: employees[4].id,
      category: 'TRAVEL',
      amount: 450.0,
      currency: 'USD',
      date: new Date('2026-09-12'),
      merchant: 'Delta Air Lines',
      description: 'Flight to London Office for engineering sync',
      status: ExpenseStatus.APPROVED,
      approvedBy: employees[0].id,
    },
    {
      organizationId: orgId,
      employeeId: employees[5].id,
      category: 'OFFICE',
      amount: 120.5,
      currency: 'USD',
      date: new Date('2026-09-15'),
      merchant: 'Amazon',
      description: 'Ergonomic keyboard and desk setup accessories',
      status: ExpenseStatus.SUBMITTED,
    },
    {
      organizationId: orgId,
      employeeId: employees[6].id,
      category: 'MEALS',
      amount: 38.75,
      currency: 'USD',
      date: new Date('2026-09-08'),
      merchant: 'The Halal Guys',
      description: 'Client lunch reimbursement',
      status: ExpenseStatus.PAID,
      approvedBy: employees[0].id,
    },
    {
      organizationId: orgId,
      employeeId: employees[7].id,
      category: 'OFFICE',
      amount: 89.99,
      currency: 'USD',
      date: new Date('2026-09-05'),
      merchant: 'Staples',
      description: 'Standing desk converter',
      status: ExpenseStatus.DRAFT,
    },
    {
      organizationId: orgId,
      employeeId: employees[1].id,
      category: 'TRAVEL',
      amount: 210.0,
      currency: 'USD',
      date: new Date('2026-09-18'),
      merchant: 'Uber',
      description: 'Airport transfers for candidate travel',
      status: ExpenseStatus.REJECTED,
      approvedBy: employees[0].id,
    },
  ];

  for (const expense of expenses) {
    const existing = await prisma.expense.findFirst({
      where: { organizationId: orgId, employeeId: expense.employeeId, amount: expense.amount, date: expense.date },
    });
    if (!existing) {
      await prisma.expense.create({ data: expense });
    }
  }
}