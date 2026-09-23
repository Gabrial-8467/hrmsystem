import { AttendanceStatus } from '@prisma/client';
import type { SeedContext } from './context';

export async function seedAttendance(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;
  const today = new Date();

  const roll = () => Math.random();

  // Spread attendance across the last 25 weeks (~6 months) so time-series
  // charts like monthly work-hours trends have a full shape.
  for (let week = 0; week < 25; week++) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - week * 7);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    for (let dow = 0; dow < 5; dow++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + dow);

      const wave = Math.sin((week / 25) * Math.PI * 2);
      const dayTone = dow < 3 ? wave * 0.05 : -wave * 0.05;

      for (const emp of employees.slice(0, 30)) {
        const r = roll();
        const isLate = r < 0.12 + dayTone;
        const isWfh = r >= 0.12 + dayTone && r < 0.24 + dayTone * 0.5;
        const isAbsent = r >= 0.93;

        if (isAbsent) {
          await prisma.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId: emp.id, date: d } },
            create: {
              organizationId: orgId,
              employeeId: emp.id,
              date: d,
              status: AttendanceStatus.ABSENT,
              workHours: 0,
            },
            update: { status: AttendanceStatus.ABSENT, workHours: 0 },
          });
          continue;
        }

        const isLateStatus = isLate && !isWfh;
        const checkInHour = isLateStatus ? 9 : 8;
        const checkInMin = isLateStatus ? 35 : Math.floor(45 + Math.random() * 14);

        const checkIn = new Date(d);
        checkIn.setHours(checkInHour, checkInMin, 0);

        const checkOut = new Date(d);
        checkOut.setHours(17, Math.floor(45 + Math.random() * 30), 0);

        const status = isWfh
          ? AttendanceStatus.WORK_FROM_HOME
          : isLateStatus
            ? AttendanceStatus.LATE
            : AttendanceStatus.PRESENT;

        await prisma.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: emp.id, date: d } },
          create: {
            organizationId: orgId,
            employeeId: emp.id,
            date: d,
            checkIn,
            checkOut,
            status,
            workHours: isWfh ? 7.5 : 8.5,
            lateMinutes: isLateStatus ? 35 : 0,
          },
          update: {
            status,
            workHours: isWfh ? 7.5 : 8.5,
            lateMinutes: isLateStatus ? 35 : 0,
          },
        });
      }
    }
  }
}