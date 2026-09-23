-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('IT', 'COMPLAINT', 'HR', 'PAYROLL', 'ADMIN', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "HelpdeskTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpdeskComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpdeskComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpdeskTicket_organizationId_status_idx" ON "HelpdeskTicket"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_organizationId_assigneeId_idx" ON "HelpdeskTicket"("organizationId", "assigneeId");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_employeeId_idx" ON "HelpdeskTicket"("employeeId");

-- CreateIndex
CREATE INDEX "HelpdeskComment_ticketId_idx" ON "HelpdeskComment"("ticketId");

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskComment" ADD CONSTRAINT "HelpdeskComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskComment" ADD CONSTRAINT "HelpdeskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
