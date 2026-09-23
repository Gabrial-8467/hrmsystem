import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AttendanceStatus } from '@prisma/client';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

const ACTIVITY_LABELS: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'users.create': 'created a user',
  'users.update': 'updated a user',
  'users.delete': 'deactivated a user',
  'employees.create': 'added a new employee',
  'employees.update': 'updated employee details',
  'leave.apply': 'submitted a leave request',
  'leave.approve': 'approved leave request',
  'leave.reject': 'rejected leave request',
  'leave.cancel': 'cancelled a leave request',
  'leave.balance_allocate': 'allocated leave balance',
  'leave.type_create': 'created a leave type',
  'leave.type_update': 'updated a leave type',
  'payroll.process': 'processed payroll run',
  'payroll.approve': 'approved payroll run',
  'salary.component_create': 'created a salary component',
  'salary.component_update': 'updated a salary component',
  'salary.component_delete': 'deleted a salary component',
};

const ABSENT_STATUSES: AttendanceStatus[] = ['ABSENT', 'HALF_DAY'];
const PRESENT_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'WORK_FROM_HOME'];

function attendanceMap(rows: { status: AttendanceStatus; _count: { _all: number } }[]) {
  const map = { PRESENT: 0, LATE: 0, WORK_FROM_HOME: 0, ABSENT: 0 };
  for (const row of rows) {
    const key = row.status as keyof typeof map;
    if (key in map) map[key] = row._count._all;
    else if (ABSENT_STATUSES.includes(row.status)) map.ABSENT += row._count._all;
    else if (!PRESENT_STATUSES.includes(row.status)) map.ABSENT += row._count._all;
  }
  return map;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summary', { preHandler: [authenticate, requirePermission('reports.view')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const [
      totalEmployees,
      activeEmployees,
      newEmployeesThisMonth,
      presentToday,
      lateToday,
      pendingLeaves,
      departments,
      payrollDraft,
      recentLogs,
      designationCount,
      branchCount,
      shiftCount,
      holidayCount,
      leaveTypeCount,
      approvedLeaves,
      onLeaveToday,
      todayAttendance,
      monthAttendance,
      payrollRunCount,
      payslipCount,
      openJobs,
      candidateCount,
      performanceCycleCount,
      reviewCount,
      goalCount,
      assetTotal,
      assetAllocated,
      expenseTotal,
      pendingExpenses,
      announcementCount,
      documentCount,
      upcomingHolidays,
      upcomingInterviews,
    ] = await Promise.all([
      app.prisma.employee.count({ where: { organizationId: orgId } }),
      app.prisma.employee.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      app.prisma.employee.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: monthStart },
        },
      }),
      app.prisma.attendanceRecord.count({
        where: { organizationId: orgId, date: { gte: today }, status: { in: PRESENT_STATUSES } },
      }),
      app.prisma.attendanceRecord.count({
        where: { organizationId: orgId, date: { gte: today }, status: 'LATE' },
      }),
      app.prisma.leaveRequest.count({
        where: { organizationId: orgId, status: 'PENDING' },
      }),
      app.prisma.department.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, _count: { select: { employees: true } } },
      }),
      app.prisma.payrollRun.findFirst({ where: { organizationId: orgId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
      app.prisma.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      app.prisma.designation.count({ where: { organizationId: orgId } }),
      app.prisma.branch.count({ where: { organizationId: orgId } }),
      app.prisma.shift.count({ where: { organizationId: orgId } }),
      app.prisma.holiday.count({ where: { organizationId: orgId } }),
      app.prisma.leaveType.count({ where: { organizationId: orgId } }),
      app.prisma.leaveRequest.count({ where: { organizationId: orgId, status: 'APPROVED' } }),
      app.prisma.leaveRequest.count({
        where: { organizationId: orgId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
      }),
      app.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { organizationId: orgId, date: { gte: today } },
        _count: { _all: true },
      }),
      app.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { organizationId: orgId, date: { gte: monthStart, lt: nextMonthStart } },
        _count: { _all: true },
      }),
      app.prisma.payrollRun.count({ where: { organizationId: orgId } }),
      app.prisma.payslip.count({ where: { organizationId: orgId } }),
      app.prisma.jobOpening.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      app.prisma.candidate.count({ where: { organizationId: orgId, status: { not: 'REJECTED' } } }),
      app.prisma.performanceCycle.count({ where: { organizationId: orgId } }),
      app.prisma.performanceReview.count({ where: { organizationId: orgId } }),
      app.prisma.performanceGoal.count({ where: { organizationId: orgId } }),
      app.prisma.asset.count({ where: { organizationId: orgId } }),
      app.prisma.asset.count({ where: { organizationId: orgId, status: 'ASSIGNED' } }),
      app.prisma.expense.count({ where: { organizationId: orgId } }),
      app.prisma.expense.aggregate({
        where: { organizationId: orgId, status: 'SUBMITTED' },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      app.prisma.announcement.count({ where: { organizationId: orgId } }),
      app.prisma.employeeDocument.count({ where: { organizationId: orgId } }),
      app.prisma.holiday.findMany({
        where: { organizationId: orgId, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 3,
        select: { id: true, name: true, date: true, type: true },
      }),
      app.prisma.interview.findMany({
        where: { organizationId: orgId, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 3,
        include: {
          candidate: {
            select: {
              firstName: true,
              lastName: true,
              jobOpening: { select: { title: true } },
            },
          },
        },
      }),
    ]);

    // --- Time-series analytics for the executive dashboard charts ---
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      weeklyAttendance,
      payrollTrendRuns,
      candidateByStatus,
      leaveByStatus,
      assetByStatus,
      expenseByStatus,
      employmentByType,
      joiningSinceSixMonths,
      expenseByCategory,
      leaveByType,
      workHoursByDate,
      weeklyByEmployee,
      employeeDepts,
    ] = await Promise.all([
      app.prisma.attendanceRecord.groupBy({
        by: ['date', 'status'],
        where: { organizationId: orgId, date: { gte: weekStart } },
        _count: { _all: true },
      }),
      app.prisma.payrollRun.findMany({
        where: { organizationId: orgId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 6,
        select: {
          month: true,
          year: true,
          status: true,
          totalGross: true,
          totalDeductions: true,
          totalNet: true,
          createdAt: true,
        },
      }),
      app.prisma.candidate.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      app.prisma.leaveRequest.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      app.prisma.asset.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      app.prisma.expense.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      app.prisma.employee.groupBy({
        by: ['employmentType'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      app.prisma.employee.findMany({
        where: { organizationId: orgId, joiningDate: { gte: sixMonthsAgo } },
        select: { joiningDate: true },
      }),
      app.prisma.expense.groupBy({
        by: ['category'],
        where: { organizationId: orgId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      app.prisma.leaveRequest.findMany({
        where: { organizationId: orgId, status: 'APPROVED' },
        select: { totalDays: true, leaveType: { select: { name: true } } },
      }),
      app.prisma.attendanceRecord.groupBy({
        by: ['date'],
        where: { organizationId: orgId, date: { gte: sixMonthsAgo } },
        _sum: { workHours: true },
      }),
      app.prisma.attendanceRecord.groupBy({
        by: ['employeeId'],
        where: { organizationId: orgId, date: { gte: weekStart } },
        _count: { _all: true },
      }),
      app.prisma.employee.findMany({
        where: { organizationId: orgId },
        select: { id: true, departmentId: true },
      }),
    ]);

    const attendanceTrend: { date: string; present: number; late: number; workFromHome: number; absent: number }[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + offset);
      day.setHours(0, 0, 0, 0);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);

      const dayRows = weeklyAttendance.filter((row) => {
        const rDate = new Date(row.date);
        rDate.setHours(0, 0, 0, 0);
        return rDate.getTime() === day.getTime();
      });

      const count = (statuses: AttendanceStatus[]) =>
        dayRows.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);

      attendanceTrend.push({
        date: day.toISOString(),
        present: count(PRESENT_STATUSES),
        late: count(['LATE']),
        workFromHome: count(['WORK_FROM_HOME']),
        absent: count(ABSENT_STATUSES),
      });
    }

    const toStatusMap = <T extends string>(rows: { status: T; _count: { _all: number } }[]) => {
      const map: Record<string, number> = {};
      for (const row of rows) map[row.status] = row._count._all;
      return map;
    };

    const hiringTrend: { month: string; count: number }[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const start = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - offset + 1, 1);
      hiringTrend.push({
        month: start.toLocaleString('default', { month: 'short' }),
        count: joiningSinceSixMonths.filter((e) => e.joiningDate >= start && e.joiningDate < end).length,
      });
    }

    const employmentMix = [
      'FULL_TIME',
      'PART_TIME',
      'CONTRACT',
      'INTERN',
    ]
      .map((type) => ({
        type,
        label: type.replaceAll('_', ' '),
        count: employmentByType.find((r) => r.employmentType === type)?._count._all ?? 0,
      }))
      .filter((r) => r.count > 0);

    const expenseCategories = expenseByCategory.map((r) => ({
      category: r.category.replaceAll('_', ' '),
      count: r._count._all,
      amount: Math.round(r._sum.amount ?? 0),
    }));

    const leaveUsageByType: { name: string; days: number; requests: number }[] = [];
    const leaveTypeAgg: Record<string, { days: number; requests: number }> = {};
    for (const row of leaveByType) {
      const key = row.leaveType?.name ?? 'Other';
      if (!leaveTypeAgg[key]) leaveTypeAgg[key] = { days: 0, requests: 0 };
      leaveTypeAgg[key].days += row.totalDays;
      leaveTypeAgg[key].requests += 1;
    }
    for (const [name, agg] of Object.entries(leaveTypeAgg)) {
      leaveUsageByType.push({ name, days: agg.days, requests: agg.requests });
    }

    const todayAttendanceMap = attendanceMap(todayAttendance);
    const monthAttendanceMap = attendanceMap(monthAttendance);
    const deptDistribution = departments.map((d) => ({ name: d.name, count: d._count.employees }));

    const workHoursTrend: { month: string; hours: number }[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const start = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - offset + 1, 1);
      workHoursTrend.push({
        month: start.toLocaleString('default', { month: 'short' }),
        hours: Math.round(
          workHoursByDate
            .filter((r) => r.date >= start && r.date < end)
            .reduce((sum, r) => sum + (r._sum.workHours ?? 0), 0),
        ),
      });
    }

    const empDept = new Map(employeeDepts.map((e) => [e.id, e.departmentId]));
    const deptEmpCount = new Map<string, number>();
    const deptRecords = new Map<string, number>();
    for (const e of employeeDepts) {
      if (e.departmentId) deptEmpCount.set(e.departmentId, (deptEmpCount.get(e.departmentId) ?? 0) + 1);
    }
    for (const r of weeklyByEmployee) {
      const deptId = empDept.get(r.employeeId);
      if (deptId) deptRecords.set(deptId, (deptRecords.get(deptId) ?? 0) + r._count._all);
    }

    let weekdays = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + offset);
      if (day.getDay() !== 0 && day.getDay() !== 6) weekdays += 1;
    }

    const attendanceRateByDept = departments.map((d) => {
      const employees = deptEmpCount.get(d.id) ?? 0;
      const records = deptRecords.get(d.id) ?? 0;
      const daily = weekdays > 0 ? records / weekdays : 0;
      return {
        name: d.name,
        rate: Math.round(employees > 0 ? Math.min(1, daily / employees) * 100 : 0),
      };
    });

    return sendSuccess(reply, {
      generatedAt: new Date().toISOString(),
      kpi: {
        totalEmployees,
        activeEmployees,
        newEmployees: newEmployeesThisMonth,
        presentToday,
        lateToday,
        pendingLeaves,
        payrollDue: payrollDraft?.totalNet ?? 0,
      },
      departmentDistribution: deptDistribution,
      attendanceTrend,
      payrollTrend: payrollTrendRuns.map((r) => ({
        period: new Date(r.year, r.month - 1).toLocaleString('default', { month: 'short' }),
        year: r.year,
        status: r.status,
        totalGross: r.totalGross,
        totalDeductions: r.totalDeductions,
        totalNet: r.totalNet,
      })),
      recruitmentFunnel: toStatusMap(candidateByStatus),
      leaveStatus: toStatusMap(leaveByStatus),
      assetBreakdown: toStatusMap(assetByStatus),
      expenseBreakdown: expenseByStatus.reduce<Record<string, { count: number; amount: number }>>(
        (acc, row) => {
          acc[row.status] = { count: row._count._all, amount: row._sum.amount ?? 0 };
          return acc;
        },
        {},
      ),
      hiringTrend,
      employmentMix,
      expenseCategories,
      leaveUsageByType,
      workHoursTrend,
      attendanceRateByDept,
      activity: recentLogs.map((a) => ({
        id: a.id,
        actor: a.user ? `${a.user.firstName} ${a.user.lastName}` : 'System Admin',
        action: a.action,
        label: ACTIVITY_LABELS[a.action] ?? a.action,
        entity: a.entity,
        entityId: a.entityId,
        createdAt: a.createdAt.toISOString(),
      })),
      overview: {
        headcount: {
          total: totalEmployees,
          active: activeEmployees,
          newThisMonth: newEmployeesThisMonth,
        },
        designationCount,
        branchCount,
        shiftCount,
        holidays: {
          total: holidayCount,
          upcoming: upcomingHolidays.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString(), type: h.type })),
        },
        leave: {
          leaveTypes: leaveTypeCount,
          pending: pendingLeaves,
          approved: approvedLeaves,
          onLeaveToday,
        },
        attendance: {
          today: todayAttendanceMap,
          month: monthAttendanceMap,
        },
        payroll: {
          runs: payrollRunCount,
          payslips: payslipCount,
          latest: payrollDraft
            ? {
                month: payrollDraft.month,
                year: payrollDraft.year,
                status: payrollDraft.status,
                totalNet: payrollDraft.totalNet,
              }
            : null,
        },
        recruitment: {
          openJobs,
          candidates: candidateCount,
          upcomingInterviews: upcomingInterviews.map((i) => ({
            id: i.id,
            candidate: `${i.candidate.firstName} ${i.candidate.lastName}`,
            job: i.candidate.jobOpening.title,
            scheduledAt: i.scheduledAt.toISOString(),
            stage: i.stage,
          })),
        },
        performance: {
          cycles: performanceCycleCount,
          reviews: reviewCount,
          goals: goalCount,
        },
        assets: {
          total: assetTotal,
          allocated: assetAllocated,
          available: assetTotal - assetAllocated,
        },
        expenses: {
          total: expenseTotal,
          pending: pendingExpenses._count._all,
          pendingAmount: pendingExpenses._sum.amount ?? 0,
        },
        announcements: announcementCount,
        documents: documentCount,
      },
    });
  });

  // Self-scoped dashboard for the signed-in user's own employee profile. Returns
  // personal data only — no org-wide KPIs. Usable by role EMPLOYEE.
  app.get('/me', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const year = today.getFullYear();

    const employee = await app.prisma.employee.findFirst({
      where: { userId: request.user!.id, organizationId: orgId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        joiningDate: true,
        employmentType: true,
        status: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { email: true } },
      },
    });

    if (!employee) {
      return sendSuccess(reply, {
        generatedAt: new Date().toISOString(),
        employee: null,
        attendance: null,
        leave: null,
        payslip: null,
        holidays: [],
        announcements: [],
        pendingRequests: 0,
        pendingExpenses: 0,
        assetCount: 0,
      });
    }

    const [todayAttendance, monthAttendance, monthWorkHoursAgg, leaveBalances, pendingRequests, latestPayslip, upcomingHolidays, announcements, pendingExpenses, assetCount] =
      await Promise.all([
        app.prisma.attendanceRecord.findUnique({
          where: { employeeId_date: { employeeId: employee.id, date: today } },
        }),
        app.prisma.attendanceRecord.groupBy({
          by: ['status'],
          where: { employeeId: employee.id, date: { gte: monthStart, lt: nextMonthStart } },
          _count: { _all: true },
        }),
        app.prisma.attendanceRecord.aggregate({
          where: { employeeId: employee.id, date: { gte: monthStart, lt: nextMonthStart } },
          _sum: { workHours: true },
        }),
        app.prisma.leaveBalance.findMany({
          where: { employeeId: employee.id, year },
          include: { leaveType: { select: { id: true, name: true, code: true } } },
          orderBy: { leaveType: { name: 'asc' } },
        }),
        app.prisma.leaveRequest.count({
          where: { employeeId: employee.id, status: 'PENDING' },
        }),
        app.prisma.payslip.findFirst({
          where: { employeeId: employee.id },
          orderBy: [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }],
          include: { payrollRun: { select: { month: true, year: true, status: true } } },
        }),
        app.prisma.holiday.findMany({
          where: { organizationId: orgId, date: { gte: today } },
          orderBy: { date: 'asc' },
          take: 5,
          select: { id: true, name: true, date: true, type: true },
        }),
        app.prisma.announcement.findMany({
          where: {
            organizationId: orgId,
            publishedAt: { lte: new Date() },
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
          },
          orderBy: { publishedAt: 'desc' },
          take: 5,
          select: { id: true, title: true, content: true, publishedAt: true },
        }),
        app.prisma.expense.count({
          where: { employeeId: employee.id, status: { in: ['SUBMITTED', 'APPROVED'] } },
        }),
        app.prisma.asset.count({ where: { assignedToId: employee.id } }),
      ]);

    const monthMap = { PRESENT: 0, LATE: 0, WORK_FROM_HOME: 0, ABSENT: 0, ON_LEAVE: 0 };
    for (const row of monthAttendance) {
      const key = row.status as keyof typeof monthMap;
      if (key in monthMap) monthMap[key] = row._count._all;
      else monthMap.ABSENT += row._count._all;
    }

    return sendSuccess(reply, {
      generatedAt: new Date().toISOString(),
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        avatarUrl: employee.avatarUrl,
        joiningDate: employee.joiningDate.toISOString(),
        employmentType: employee.employmentType,
        status: employee.status,
        email: employee.user?.email ?? null,
        department: employee.department?.name ?? null,
        designation: employee.designation?.title ?? null,
        manager: employee.manager
          ? { id: employee.manager.id, name: `${employee.manager.firstName} ${employee.manager.lastName}` }
          : null,
      },
      attendance: {
        today: todayAttendance
          ? {
              status: todayAttendance.status,
              checkIn: todayAttendance.checkIn?.toISOString() ?? null,
              checkOut: todayAttendance.checkOut?.toISOString() ?? null,
              workHours: todayAttendance.workHours,
            }
          : null,
        month: monthMap,
        monthWorkHours: Math.round((monthWorkHoursAgg._sum.workHours ?? 0) * 100) / 100,
      },
      leave: {
        balances: leaveBalances.map((b) => ({
          id: b.id,
          name: b.leaveType.name,
          code: b.leaveType.code,
          allocated: b.allocated,
          used: b.used,
          pending: b.pending,
          carriedOver: b.carriedOver,
          available: Math.max(0, b.allocated + b.carriedOver - b.used - b.pending),
        })),
      },
      payslip: latestPayslip
        ? {
            id: latestPayslip.id,
            month: latestPayslip.payrollRun.month,
            year: latestPayslip.payrollRun.year,
            status: latestPayslip.payrollRun.status,
            payslipStatus: latestPayslip.status,
            basicSalary: latestPayslip.basicSalary,
            allowances: latestPayslip.allowances,
            deductions: latestPayslip.deductions,
            netPay: latestPayslip.netPay,
          }
        : null,
      holidays: upcomingHolidays.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString(), type: h.type })),
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        publishedAt: a.publishedAt.toISOString(),
      })),
      pendingRequests,
      pendingExpenses,
      assetCount,
    });
  });
}