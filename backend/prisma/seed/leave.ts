import { LeaveStatus } from '@prisma/client';
import type { SeedContext } from './context';

const LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'AL', daysAllowedPerYear: 18, isPaid: true },
  { name: 'Sick Leave', code: 'SL', daysAllowedPerYear: 10, isPaid: true },
  { name: 'Casual Leave', code: 'CL', daysAllowedPerYear: 6, isPaid: true },
  { name: 'Maternity Leave', code: 'ML', daysAllowedPerYear: 90, isPaid: true },
  { name: 'Paternity Leave', code: 'PL', daysAllowedPerYear: 10, isPaid: true },
];

export async function seedLeave(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  const leaveTypeMap: Record<string, string> = {};
  for (const lt of LEAVE_TYPES) {
    const leaveType = await prisma.leaveType.upsert({
      where: { organizationId_code: { organizationId: orgId, code: lt.code } },
      create: { organizationId: orgId, ...lt },
      update: {},
    });
    leaveTypeMap[lt.code] = leaveType.id;
  }

  for (const emp of employees.slice(0, 15)) {
    for (const [code, ltId] of Object.entries(leaveTypeMap)) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: ltId, year: 2026 } },
        create: {
          organizationId: orgId,
          employeeId: emp.id,
          leaveTypeId: ltId,
          year: 2026,
          allocated: code === 'AL' ? 18 : 10,
          used: Math.floor(Math.random() * 4),
          pending: 0,
        },
        update: {},
      });
    }
  }

  if (employees.length >= 12) {
    const requests = [
      {
        organizationId: orgId,
        employeeId: employees[4].id,
        leaveTypeId: leaveTypeMap['AL'],
        startDate: new Date('2026-10-05'),
        endDate: new Date('2026-10-08'),
        totalDays: 4,
        reason: 'Family vacation and personal travel',
        status: LeaveStatus.PENDING,
      },
      {
        organizationId: orgId,
        employeeId: employees[5].id,
        leaveTypeId: leaveTypeMap['SL'],
        startDate: new Date('2026-09-10'),
        endDate: new Date('2026-09-11'),
        totalDays: 2,
        reason: 'Medical treatment and rest',
        status: LeaveStatus.APPROVED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[6].id,
        leaveTypeId: leaveTypeMap['CL'],
        startDate: new Date('2026-09-02'),
        endDate: new Date('2026-09-03'),
        totalDays: 2,
        reason: 'Personal errands',
        status: LeaveStatus.APPROVED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[7].id,
        leaveTypeId: leaveTypeMap['SL'],
        startDate: new Date('2026-09-18'),
        endDate: new Date('2026-09-18'),
        totalDays: 1,
        reason: 'Doctor appointment',
        status: LeaveStatus.REJECTED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[8].id,
        leaveTypeId: leaveTypeMap['AL'],
        startDate: new Date('2026-08-03'),
        endDate: new Date('2026-08-07'),
        totalDays: 5,
        reason: 'Annual summer break',
        status: LeaveStatus.APPROVED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[9].id,
        leaveTypeId: leaveTypeMap['CL'],
        startDate: new Date('2026-07-13'),
        endDate: new Date('2026-07-14'),
        totalDays: 2,
        reason: 'Home move',
        status: LeaveStatus.APPROVED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[10].id,
        leaveTypeId: leaveTypeMap['PL'],
        startDate: new Date('2026-06-22'),
        endDate: new Date('2026-06-26'),
        totalDays: 5,
        reason: 'Paternity leave for newborn',
        status: LeaveStatus.APPROVED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[11].id,
        leaveTypeId: leaveTypeMap['SL'],
        startDate: new Date('2026-05-11'),
        endDate: new Date('2026-05-12'),
        totalDays: 2,
        reason: 'Recovery following minor surgery',
        status: LeaveStatus.APPROVED,
        approvedBy: employees[0].id,
      },
      {
        organizationId: orgId,
        employeeId: employees[2].id,
        leaveTypeId: leaveTypeMap['AL'],
        startDate: new Date('2026-11-16'),
        endDate: new Date('2026-11-20'),
        totalDays: 5,
        reason: 'Year-end holiday break',
        status: LeaveStatus.PENDING,
      },
      {
        organizationId: orgId,
        employeeId: employees[3].id,
        leaveTypeId: leaveTypeMap['CL'],
        startDate: new Date('2026-08-14'),
        endDate: new Date('2026-08-14'),
        totalDays: 1,
        reason: 'Out of town',
        status: LeaveStatus.CANCELLED,
      },
    ];

    for (const req of requests) {
      const existing = await prisma.leaveRequest.findFirst({
        where: { organizationId: orgId, employeeId: req.employeeId, startDate: req.startDate },
      });
      if (!existing) {
        await prisma.leaveRequest.create({ data: req });
      }
    }
  }
}