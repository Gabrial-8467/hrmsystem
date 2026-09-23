-- CreateEnum
CREATE TYPE "DeviceSyncStatus" AS ENUM ('IDLE', 'RUNNING', 'OK', 'FAILED');

-- CreateEnum
CREATE TYPE "BiometricPunchSource" AS ENUM ('PULL', 'REALTIME', 'API');

-- AlterTable
ALTER TABLE "BiometricDevice" ADD COLUMN     "commKey" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncStatus" "DeviceSyncStatus" NOT NULL DEFAULT 'IDLE';

-- CreateTable
CREATE TABLE "EmployeeBiometric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "nameOnDevice" TEXT,
    "faceEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "fingerprints" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBiometric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricPunchLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "employeeId" TEXT,
    "deviceUserId" TEXT NOT NULL,
    "punchTime" TIMESTAMP(3) NOT NULL,
    "punchState" INTEGER NOT NULL DEFAULT 0,
    "verifyMode" INTEGER NOT NULL DEFAULT 0,
    "source" "BiometricPunchSource" NOT NULL DEFAULT 'PULL',
    "attendanceRecordId" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricPunchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeBiometric_organizationId_idx" ON "EmployeeBiometric"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBiometric_deviceId_deviceUserId_key" ON "EmployeeBiometric"("deviceId", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBiometric_employeeId_deviceId_key" ON "EmployeeBiometric"("employeeId", "deviceId");

-- CreateIndex
CREATE INDEX "BiometricPunchLog_deviceId_punchTime_idx" ON "BiometricPunchLog"("deviceId", "punchTime");

-- CreateIndex
CREATE INDEX "BiometricPunchLog_employeeId_punchTime_idx" ON "BiometricPunchLog"("employeeId", "punchTime");

-- CreateIndex
CREATE INDEX "BiometricPunchLog_organizationId_idx" ON "BiometricPunchLog"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricPunchLog_deviceId_deviceUserId_punchTime_punchStat_key" ON "BiometricPunchLog"("deviceId", "deviceUserId", "punchTime", "punchState");

-- AddForeignKey
ALTER TABLE "EmployeeBiometric" ADD CONSTRAINT "EmployeeBiometric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBiometric" ADD CONSTRAINT "EmployeeBiometric_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBiometric" ADD CONSTRAINT "EmployeeBiometric_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunchLog" ADD CONSTRAINT "BiometricPunchLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunchLog" ADD CONSTRAINT "BiometricPunchLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunchLog" ADD CONSTRAINT "BiometricPunchLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricPunchLog" ADD CONSTRAINT "BiometricPunchLog_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
