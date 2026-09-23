import { LeaveStatus } from '@prisma/client';
import type { SeedContext } from './context';

export async function seedAttendanceCorrections(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;
  const actor = employees[0];

  const corrections = [
    {
      empIdx: 4,
      reason: 'Forgot to check in on arrival, was physically present the whole day',
      status: LeaveStatus.PENDING,
      checkInHr: 9, checkInMin: 2,
      checkOutHr: 18, checkOutMin: 5,
    },
    {
      empIdx: 5,
      reason: 'App sync flagged a late entry but I clocked in on time',
      status: LeaveStatus.APPROVED,
      checkInHr: 8, checkInMin: 51,
      checkOutHr: 17, checkOutMin: 32,
    },
  ];

  let created = 0;
  for (const c of corrections) {
    const emp = employees[c.empIdx];
    if (!emp) continue;

    const record = await prisma.attendanceRecord.findFirst({
      where: { organizationId: orgId, employeeId: emp.id },
      orderBy: { date: 'desc' },
    });
    if (!record) continue;

    const existing = await prisma.attendanceCorrection.findFirst({
      where: { organizationId: orgId, employeeId: emp.id, date: record.date },
    });
    if (existing) continue;

    const checkIn = new Date(record.date);
    checkIn.setHours(c.checkInHr, c.checkInMin, 0);
    const checkOut = new Date(record.date);
    checkOut.setHours(c.checkOutHr, c.checkOutMin, 0);

    await prisma.attendanceCorrection.create({
      data: {
        organizationId: orgId,
        employeeId: emp.id,
        attendanceRecordId: record.id,
        date: record.date,
        proposedCheckIn: checkIn,
        proposedCheckOut: checkOut,
        reason: c.reason,
        status: c.status,
        approvedBy: c.status === LeaveStatus.APPROVED ? actor?.id : null,
      },
    });
    created++;
  }

  console.log(`[seed] Created ${created} attendance corrections`);
}