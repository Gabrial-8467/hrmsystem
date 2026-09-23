-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('WEB', 'FACE', 'FINGERPRINT', 'DEVICE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'PAUSED');

-- CreateEnum
CREATE TYPE "DeviceMode" AS ENUM ('FACE', 'FINGERPRINT', 'HYBRID');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "method" "AttendanceMethod" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "BiometricDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mode" "DeviceMode" NOT NULL DEFAULT 'HYBRID',
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "serialNumber" TEXT,
    "ipAddress" TEXT,
    "port" INTEGER NOT NULL DEFAULT 4370,
    "location" TEXT,
    "lastPingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BiometricDevice_organizationId_idx" ON "BiometricDevice"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_organizationId_code_key" ON "BiometricDevice"("organizationId", "code");

-- CreateIndex
CREATE INDEX "AttendanceRecord_deviceId_idx" ON "AttendanceRecord"("deviceId");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
