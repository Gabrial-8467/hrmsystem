import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/guard';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summary', {
    preHandler: [authenticate, requirePermission('reports.view')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = request.user!.organizationId;

    const [employeesByDept, employeesByBranch, payrollSummary, leaveStats] = await Promise.all([
      app.prisma.department.findMany({
        where: { organizationId: orgId },
        select: { name: true, _count: { select: { employees: true } } },
      }),
      app.prisma.branch.findMany({
        where: { organizationId: orgId },
        select: { name: true, _count: { select: { employees: true } } },
      }),
      app.prisma.payrollRun.aggregate({
        where: { organizationId: orgId, status: { in: ['PROCESSED', 'PAID'] } },
        _sum: { totalGross: true, totalNet: true, totalDeductions: true },
      }),
      app.prisma.leaveRequest.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { id: true },
      }),
    ]);

    return sendSuccess(reply, {
      departments: employeesByDept.map((d) => ({ name: d.name, count: d._count.employees })),
      branches: employeesByBranch.map((b) => ({ name: b.name, count: b._count.employees })),
      payroll: {
        totalGrossPaid: payrollSummary._sum.totalGross ?? 0,
        totalNetPaid: payrollSummary._sum.totalNet ?? 0,
        totalDeductions: payrollSummary._sum.totalDeductions ?? 0,
      },
      leave: leaveStats.map((l) => ({ status: l.status, count: l._count.id })),
    });
  });
}
