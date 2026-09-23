import type { SeedContext } from './context';

const SHIFTS = [
  { name: 'Regular Morning Shift', code: 'SH_MORN', startTime: '09:00', endTime: '18:00', fullDayHours: 8, halfDayHours: 4 },
  { name: 'Evening Shift', code: 'SH_EVE', startTime: '14:00', endTime: '23:00', fullDayHours: 8, halfDayHours: 4 },
  { name: 'Night Shift', code: 'SH_NIGHT', startTime: '22:00', endTime: '07:00', fullDayHours: 8, halfDayHours: 4 },
];

const HOLIDAYS = [
  { name: "New Year's Day", date: new Date('2026-01-01'), type: 'NATIONAL' },
  { name: 'Memorial Day', date: new Date('2026-05-25'), type: 'NATIONAL' },
  { name: 'Independence Day', date: new Date('2026-07-04'), type: 'NATIONAL' },
  { name: 'Labor Day', date: new Date('2026-09-07'), type: 'NATIONAL' },
  { name: 'Thanksgiving Day', date: new Date('2026-11-26'), type: 'NATIONAL' },
  { name: 'Christmas Day', date: new Date('2026-12-25'), type: 'NATIONAL' },
];

export async function seedWorkSchedule(ctx: SeedContext): Promise<void> {
  const { prisma, orgId } = ctx;

  for (const s of SHIFTS) {
    await prisma.shift.upsert({
      where: { organizationId_code: { organizationId: orgId, code: s.code } },
      create: { organizationId: orgId, ...s },
      update: {},
    });
  }

  for (const h of HOLIDAYS) {
    const existing = await prisma.holiday.findFirst({
      where: { organizationId: orgId, name: h.name },
    });
    if (!existing) {
      await prisma.holiday.create({
        data: { organizationId: orgId, ...h },
      });
    }
  }
}