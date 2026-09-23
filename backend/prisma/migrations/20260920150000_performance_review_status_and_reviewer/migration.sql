-- CreateEnum
CREATE TYPE "PerformanceGoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- AlterTable (preserves existing values via typed casts)
ALTER TABLE "PerformanceGoal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PerformanceGoal" ALTER COLUMN "status" SET DATA TYPE "PerformanceGoalStatus" USING ("status"::"PerformanceGoalStatus");
ALTER TABLE "PerformanceGoal" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

ALTER TABLE "PerformanceReview" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PerformanceReview" ALTER COLUMN "status" SET DATA TYPE "PerformanceReviewStatus" USING ("status"::"PerformanceReviewStatus");
ALTER TABLE "PerformanceReview" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "PerformanceReview_reviewerId_idx" ON "PerformanceReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_cycleId_employeeId_key" ON "PerformanceReview"("cycleId", "employeeId");

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;