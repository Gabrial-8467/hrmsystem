import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedPlatform } from './platform';
import { seedOrgStructure } from './demo-organization';
import { seedEmployees } from './employees';
import { seedDepartmentHeads } from './department-heads';
import { seedWorkSchedule } from './work-schedule';
import { seedShiftAssignments } from './shift-assignments';
import { seedEmployeeDocuments } from './documents';
import { seedLeave } from './leave';
import { seedAttendance } from './attendance';
import { seedAttendanceCorrections } from './attendance-corrections';
import { seedPayroll } from './payroll';
import { seedEmployeeSalaries } from './employee-salaries';
import { seedRecruitment } from './recruitment';
import { seedPerformance } from './performance';
import { seedPerformanceReviews } from './performance-reviews';
import { seedAssets } from './assets';
import { seedExpenses } from './expenses';
import { seedNotifications } from './notifications';
import { seedAnnouncements } from './announcements';
import { seedBiometricDevices } from './biometric-devices';
import { seedOnboarding } from './onboarding';
import { seedAuditLogs } from './audit-log';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await seedPlatform(prisma);

    let ctx = await seedOrgStructure(prisma);
    ctx = await seedEmployees(ctx);
    ctx = await seedDepartmentHeads(ctx);

    await seedWorkSchedule(ctx);
    await seedShiftAssignments(ctx);
    await seedEmployeeDocuments(ctx);
    await seedLeave(ctx);
    await seedAttendance(ctx);
    await seedAttendanceCorrections(ctx);
    await seedPayroll(ctx);
    await seedEmployeeSalaries(ctx);
    await seedRecruitment(ctx);
    await seedPerformance(ctx);
    await seedPerformanceReviews(ctx);
    await seedAssets(ctx);
    await seedExpenses(ctx);
    await seedNotifications(ctx);
    await seedAnnouncements(ctx);
    await seedBiometricDevices(ctx);
    await seedOnboarding(ctx);
    await seedAuditLogs(ctx);

    console.log('[seed] Complete Demo Seeding Finished.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});