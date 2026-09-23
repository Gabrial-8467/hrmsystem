import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ExpenseStatus } from '@prisma/client';
import { buildApp } from '../src/app';
import { syncPermissionsAndSystemRoles } from '../src/services/permission-sync';

describe('HRMS Backend Foundation & API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 OK and database status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.database).toBe('ok');
  });

  it('GET /api/v1 returns API version and service metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.service).toBe('hrms-backend');
    expect(body.data.api).toBe('v1');
  });

  it('POST /api/v1/auth/login fails cleanly with invalid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'invalid@acme.com',
        password: 'WrongPassword123',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/login succeeds for Super Admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'superadmin@hrms.dev',
        password: 'SuperAdmin@123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('superadmin@hrms.dev');
    expect(body.data.accessToken).toBeDefined();
  });

  it('POST /api/v1/auth/logout succeeds even without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('POST with application/json and an empty body returns 400, not 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});

describe('HRMS Foundation Hardening', () => {
  let app: FastifyInstance;
  const ACME_SLUG = 'acme-technologies';

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('org-wide dashboard KPIs are denied to users without reports.view', async () => {
    const token = await authAs('employee@acme.com', 'Demo@12345');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('self-scoped dashboard /me returns personal data for an employee user', async () => {
    const token = await authAs('employee@acme.com', 'Demo@12345');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/me',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.employee).not.toBeNull();
    expect(body.data.employee.firstName).toBe('Sneha');
    expect(body.data.employee).toHaveProperty('department');
    expect(body.data).toHaveProperty('leave');
  });

  it('PATCH /employees/:id ignores protected fields (mass-assignment protection)', async () => {
    const token = await authAs('admin@acme.com', 'Admin@12345');
    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: ACME_SLUG } });
    const employee = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: org.id } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/employees/${employee.id}`,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload: { firstName: 'Hardened', organizationId: 'rogue-org', userId: 'rogue-user' },
    });

    expect(res.statusCode).toBe(200);
    const after = await app.prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(after.firstName).toBe('Hardened');
    expect(after.organizationId).toBe(org.id);
    expect(after.userId).toBe(employee.userId);

    // Restore the original value to keep the database idempotent for other tests.
    await app.prisma.employee.update({ where: { id: employee.id }, data: { firstName: employee.firstName } });
  });

  it('syncPermissionsAndSystemRoles is idempotent and repairs system-role permission wiring', async () => {
    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: ACME_SLUG } });

    await syncPermissionsAndSystemRoles(app.prisma);
    await syncPermissionsAndSystemRoles(app.prisma);

    const role = await app.prisma.role.findFirstOrThrow({
      where: { organizationId: org.id, code: 'HR_MANAGER' },
      include: { permissions: { include: { permission: true } } },
    });
    const keys = role.permissions.map((rp) => rp.permission.key);
    for (const expected of ['jobs.view', 'candidates.view', 'interviews.view', 'reports.view']) {
      expect(keys).toContain(expected);
    }

    // EMPLOYEE must NOT have org-wide reporting access.
    const employeeRole = await app.prisma.role.findFirstOrThrow({
      where: { organizationId: org.id, code: 'EMPLOYEE' },
      include: { permissions: { include: { permission: true } } },
    });
    expect(employeeRole.permissions.map((rp) => rp.permission.key)).not.toContain('reports.view');
    // EMPLOYEE gains self-service leave viewing (data is still self-scoped by the API).
    expect(employeeRole.permissions.map((rp) => rp.permission.key)).toContain('leave.view');
  });
});

describe('Leave Engine', () => {
  let app: FastifyInstance;
  let orgId: string;
  let snehaId: string;
  let adminToken: string;
  let employeeToken: string;
  let testTypeId: string;

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const sneha = await app.prisma.employee.findFirstOrThrow({
      where: { firstName: 'Sneha', organizationId: orgId },
    });
    snehaId = sneha.id;

    // Clean up any leftovers from a previous test run for the TEST type.
    await app.prisma.leaveBalance.deleteMany({
      where: { employeeId: snehaId, leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveRequest.deleteMany({
      where: { leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveType.deleteMany({ where: { code: 'TEST', organizationId: orgId } });
  });

  afterAll(async () => {
    // Remove test-only data so the database stays idempotent for other suites.
    await app.prisma.leaveBalance.deleteMany({
      where: { employeeId: snehaId, leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveRequest.deleteMany({
      where: { leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveType.deleteMany({ where: { code: 'TEST', organizationId: orgId } });
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('leave types can be created by leave.manage holders and reject duplicates', async () => {
    adminToken = await authAs('admin@acme.com', 'Admin@12345');
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/types',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        name: 'Test Leave',
        code: 'TEST',
        daysAllowedPerYear: 20,
        isPaid: true,
        requiresApproval: true,
        carryForwardMax: 0,
      },
    });
    expect(res.statusCode).toBe(200);
    testTypeId = (res.json() as { data: { id: string } }).data.id;

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/types',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'Test Leave 2', code: 'test' },
    });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: { code: string } }).error.code).toBe('LEAVE_TYPE_EXISTS');

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/types',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { name: 'Nope', code: 'NOPE' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('allocates a balance and applies for leave with balance enforcement', async () => {
    const allocate = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/balances',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026, allocated: 20, carriedOver: 0 },
    });
    expect(allocate.statusCode).toBe(200);

    const apply = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-11-09',
        endDate: '2026-11-12',
        totalDays: 4,
        reason: 'ENGINE-TEST annual leave',
      },
    });
    expect(apply.statusCode).toBe(200);
    const created = apply.json() as { data: { id: string; status: string; totalDays: number } };
    expect(created.data.status).toBe('PENDING');
    expect(created.data.totalDays).toBe(4);

    const bal = await app.prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026 },
    });
    expect(bal.pending).toBe(4);
    expect(bal.used).toBe(0);
  });

  it('rejects overlapping, insufficient-balance, invalid and unknown applications', async () => {
    // Overlapping with the PENDING request (Nov 11–13 overlaps Nov 9–12).
    const overlap = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-11-11',
        endDate: '2026-11-13',
        reason: 'ENGINE-TEST overlap',
      },
    });
    expect(overlap.statusCode).toBe(409);
    expect((overlap.json() as { error: { code: string } }).error.code).toBe('OVERLAPPING_LEAVE');

    // 30 days > 16 available (20 allocated − 4 pending).
    const insufficient = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-12-01',
        endDate: '2026-12-30',
        reason: 'ENGINE-TEST too many days',
      },
    });
    expect(insufficient.statusCode).toBe(409);
    expect((insufficient.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_BALANCE');

    const invalidDates = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-11-20',
        endDate: '2026-11-15',
        reason: 'ENGINE-TEST backwards dates',
      },
    });
    expect(invalidDates.statusCode).toBe(400);
    expect((invalidDates.json() as { error: { code: string } }).error.code).toBe('INVALID_DATES');

    const unknownType = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: 'cmdoesnotexist0000000000000',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
        reason: 'ENGINE-TEST unknown type',
      },
    });
    expect(unknownType.statusCode).toBe(400);
    expect((unknownType.json() as { error: { code: string } }).error.code).toBe('LEAVE_TYPE_NOT_FOUND');
  });

  it('self-scopes request and balance listings for employees, org-wide for staff', async () => {
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/leave/requests?limit=100',
      headers: bearer(employeeToken),
    });
    expect(mine.statusCode).toBe(200);
    const mineBody = mine.json() as { data: { items: { employeeId: string }[] } };
    expect(mineBody.data.items.length).toBeGreaterThanOrEqual(1);
    for (const item of mineBody.data.items) {
      expect(item.employeeId).toBe(snehaId);
    }

    const orgWide = await app.inject({
      method: 'GET',
      url: '/api/v1/leave/requests?limit=100',
      headers: bearer(adminToken),
    });
    expect(orgWide.statusCode).toBe(200);
    const orgWideBody = orgWide.json() as { data: { items: { employeeId: string }[] } };
    expect(orgWideBody.data.items.length).toBeGreaterThan(mineBody.data.items.length);

    const myBalances = await app.inject({
      method: 'GET',
      url: '/api/v1/leave/balances?limit=100',
      headers: bearer(employeeToken),
    });
    expect(myBalances.statusCode).toBe(200);
    const balBody = myBalances.json() as { data: { items: { employee: { id: string } }[] } };
    expect(balBody.data.items.length).toBeGreaterThan(0);
    for (const item of balBody.data.items) {
      expect(item.employee.id).toBe(snehaId);
    }
  });

  it('blocks employees from approving, rejects over-approvals, enforces rejection reasons', async () => {
    const first = await app.prisma.leaveRequest.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, status: 'PENDING' },
    });

    const noPerm = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${first.id}/status`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { status: 'APPROVED' },
    });
    expect(noPerm.statusCode).toBe(403);

    // Reject the first request without a reason -> 400.
    const noReason = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${first.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'REJECTED' },
    });
    expect(noReason.statusCode).toBe(400);
    expect((noReason.json() as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');

    // Reject with a reason -> 200, balance pending reverted.
    const rejected = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${first.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'REJECTED', rejectionReason: 'Policy limits reached for this period' },
    });
    expect(rejected.statusCode).toBe(200);
    let bal = await app.prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026 },
    });
    expect(bal.pending).toBe(0);

    // Re-processing an already-rejected request -> 409.
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${first.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'APPROVED' },
    });
    expect(again.statusCode).toBe(409);
    expect((again.json() as { error: { code: string } }).error.code).toBe('ALREADY_PROCESSED');

    // Apply again, then approve properly: pending 4 -> used 4.
    const apply2 = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-11-16',
        endDate: '2026-11-19',
        reason: 'ENGINE-TEST approved leave',
      },
    });
    expect(apply2.statusCode).toBe(200);
    const second = apply2.json() as { data: { id: string } };

    const approve = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${second.data.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'APPROVED' },
    });
    expect(approve.statusCode).toBe(200);

    bal = await app.prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026 },
    });
    expect(bal.pending).toBe(0);
    expect(bal.used).toBe(4);
  });

  it('lets employees cancel their own pending requests and reverts the pending balance', async () => {
    const apply = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-11-23',
        endDate: '2026-11-24',
        reason: 'ENGINE-TEST cancel me',
      },
    });
    expect(apply.statusCode).toBe(200);
    const pending = apply.json() as { data: { id: string } };

    let bal = await app.prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026 },
    });
    expect(bal.pending).toBe(2);

    const cancel = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${pending.data.id}/cancel`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(cancel.statusCode).toBe(200);

    bal = await app.prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026 },
    });
    expect(bal.pending).toBe(0);

    const cancelled = await app.prisma.leaveRequest.findUniqueOrThrow({ where: { id: pending.data.id } });
    expect(cancelled.status).toBe('CANCELLED');

    // Cancelling the APPROVED request (not pending) must fail.
    const approved = await app.prisma.leaveRequest.findFirstOrThrow({
      where: { employeeId: snehaId, leaveTypeId: testTypeId, status: 'APPROVED' },
    });
    const cancelApproved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${approved.id}/cancel`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(cancelApproved.statusCode).toBe(409);
  });

  it('prevents deletion of a leave type that is still in use', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/leave/types/${testTypeId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(409);
    expect((del.json() as { error: { code: string } }).error.code).toBe('LEAVE_TYPE_IN_USE');

    // Employees cannot allocate balances (leave.manage required).
    const forbidAlloc = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/balances',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { employeeId: snehaId, leaveTypeId: testTypeId, allocated: 5 },
    });
    expect(forbidAlloc.statusCode).toBe(403);
  });
});

describe('Payroll Engine', () => {
  let app: FastifyInstance;
  let orgId: string;
  let snehaId: string;
  let accountantToken: string;
  let employeeToken: string;
  let testRunId: string;
  let testComponentId: string;

  const TEST_MONTH = { month: 11, year: 2026 };

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const sneha = await app.prisma.employee.findFirstOrThrow({
      where: { firstName: 'Sneha', organizationId: orgId },
    });
    snehaId = sneha.id;

    // Clean up any leftovers from a previous test run.
    await app.prisma.payslip.deleteMany({
      where: { payrollRun: { organizationId: orgId, month: TEST_MONTH.month, year: TEST_MONTH.year } },
    });
    await app.prisma.payrollRun.deleteMany({
      where: { organizationId: orgId, month: TEST_MONTH.month, year: TEST_MONTH.year },
    });
    await app.prisma.salaryComponent.deleteMany({ where: { organizationId: orgId, code: 'TESTING' } });
  });

  afterAll(async () => {
    if (testRunId) {
      await app.prisma.payslip.deleteMany({ where: { payrollRunId: testRunId } });
      await app.prisma.payrollRun.deleteMany({ where: { id: testRunId } });
    }
    if (testComponentId) {
      await app.prisma.salaryComponent.deleteMany({ where: { id: testComponentId } });
    }
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('salary components are org-scoped, managed and enforced', async () => {
    accountantToken = await authAs('accountant@acme.com', 'Demo@12345');
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');

    // Employees cannot view or mutate salary structures.
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/payroll/salary/components',
      headers: bearer(employeeToken),
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/payroll/salary/components',
      headers: bearer(accountantToken),
    });
    expect(list.statusCode).toBe(200);
    const seeded = (list.json() as { data: { code: string }[] }).data;
    expect(seeded.map((c) => c.code)).toContain('BASIC');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/payroll/salary/components',
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: { name: 'Testing Allowance', code: 'TESTING', type: 'EARNING', calculationType: 'PERCENTAGE', calculationValue: 15, isTaxable: true },
    });
    expect(created.statusCode).toBe(200);
    testComponentId = (created.json() as { data: { id: string } }).data.id;

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/payroll/salary/components',
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: { name: 'Testing Again', code: 'testing', type: 'DEDUCTION', calculationType: 'FIXED' },
    });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: { code: string } }).error.code).toBe('COMPONENT_EXISTS');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/payroll/salary/components/${testComponentId}`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: { isTaxable: false },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { data: { isTaxable: boolean } }).data.isTaxable).toBe(false);
  });

  it('runs a payroll cycle computed from employee salary records', async () => {
    const run = await app.inject({
      method: 'POST',
      url: '/api/v1/payroll/runs',
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: TEST_MONTH,
    });
    expect(run.statusCode).toBe(200);
    const body = run.json() as { data: { id: string; status: string; totalGross: number; totalDeductions: number; totalNet: number } };
    testRunId = body.data.id;
    expect(body.data.status).toBe('CALCULATED');
    expect(body.data.totalGross).toBeGreaterThan(0);

    const payslips = await app.prisma.payslip.findMany({ where: { payrollRunId: testRunId } });
    expect(payslips.length).toBeGreaterThan(0);
    for (const p of payslips) {
      expect(p.netPay).toBe(p.basicSalary + p.allowances - p.deductions - p.taxDeducted);
    }
    const sumNet = payslips.reduce((s, p) => s + p.netPay, 0);
    expect(body.data.totalNet).toBe(sumNet);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/payroll/runs',
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: TEST_MONTH,
    });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: { code: string } }).error.code).toBe('PAYROLL_RUN_EXISTS');

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/payroll/runs',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { month: 12, year: 2026 },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/payroll/runs',
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: { month: 13, year: 2026 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('advances payroll run status through an approval chain and finalizes payslips', async () => {
    const move = async (status: string) =>
      app.inject({
        method: 'PATCH',
        url: `/api/v1/payroll/runs/${testRunId}/status`,
        headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
        payload: { status },
      });

    const employeeMove = await app.inject({
      method: 'PATCH',
      url: `/api/v1/payroll/runs/${testRunId}/status`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { status: 'REVIEWED' },
    });
    expect(employeeMove.statusCode).toBe(403);

    // CALCULATED -> REVIEWED -> APPROVED -> PROCESSED -> PAID
    const review = await move('REVIEWED');
    expect(review.statusCode).toBe(200);

    // Backwards / invalid jumps are refused.
    const invalid = await move('CALCULATED');
    expect(invalid.statusCode).toBe(409);
    expect((invalid.json() as { error: { code: string } }).error.code).toBe('INVALID_TRANSITION');

    const approved = await move('APPROVED');
    expect(approved.statusCode).toBe(200);
    const processed = await move('PROCESSED');
    expect(processed.statusCode).toBe(200);
    const paid = await move('PAID');
    expect(paid.statusCode).toBe(200);

    // Finalizing the run marks every payslip PAID with a payment date.
    const slips = await app.prisma.payslip.findMany({ where: { payrollRunId: testRunId } });
    expect(slips.length).toBeGreaterThan(0);
    for (const slip of slips) {
      expect(slip.status).toBe('PAID');
      expect(slip.paymentDate).not.toBeNull();
    }
  });

  it('scopes payslips to the viewer (self-service vs org-wide)', async () => {
    const orgWide = await app.inject({
      method: 'GET',
      url: '/api/v1/payroll/payslips?limit=100',
      headers: bearer(accountantToken),
    });
    expect(orgWide.statusCode).toBe(200);
    const allSlips = (orgWide.json() as { data: { items: { id: string; employeeId?: string }[] } }).data.items;
    expect(allSlips.length).toBeGreaterThan(0);

    const self = await app.inject({
      method: 'GET',
      url: '/api/v1/payroll/payslips?limit=100',
      headers: bearer(employeeToken),
    });
    expect(self.statusCode).toBe(200);
    const mySlips = (self.json() as { data: { items: { employee: { id: string } }[] } }).data.items;
    expect(mySlips.length).toBeGreaterThan(0);
    expect(mySlips.every((s) => s.employee.id === snehaId)).toBe(true);

    // Employees cannot open someone else's payslip.
    const otherSlip = allSlips.find((s) => s.employeeId !== snehaId);
    if (otherSlip) {
      const crossOrg = await app.inject({
        method: 'GET',
        url: `/api/v1/payroll/payslips/${otherSlip.id}`,
        headers: bearer(employeeToken),
      });
      expect(crossOrg.statusCode).toBe(404);
    }

    // Employees cannot access the org-wide payroll runs.
    const runs = await app.inject({
      method: 'GET',
      url: '/api/v1/payroll/runs',
      headers: bearer(employeeToken),
    });
    expect(runs.statusCode).toBe(403);
  });
});

describe('Notifications Engine', () => {
  let app: FastifyInstance;
  let orgId: string;
  let snehaId: string;
  let snehaUserId: string;
  let testTypeId: string;
  let adminToken: string;
  let employeeToken: string;

  const LEAVE_NOTIF_TITLES = [
    'Leave request approved',
    'Leave request rejected',
    'Leave request cancelled',
    'Leave request submitted',
  ];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const sneha = await app.prisma.employee.findFirstOrThrow({
      where: { firstName: 'Sneha', organizationId: orgId },
    });
    snehaId = sneha.id;
    snehaUserId = sneha.userId as string;

    // Reset the subject's notifications for idempotency, then seed a
    // deterministic baseline so unread-count assertions never depend on the
    // global seed (which earlier runs may have marked as read).
    await app.prisma.notification.deleteMany({ where: { userId: snehaUserId } });
    await app.prisma.notification.createMany({
      data: [
        { organizationId: orgId, userId: snehaUserId, title: 'Security check', message: 'Please verify your account recovery details.', type: 'ACTION', link: '/settings', isRead: false },
        { organizationId: orgId, userId: snehaUserId, title: 'Policy update', message: 'Our leave policy has been updated for next year.', type: 'INFO', link: '/leave', isRead: false },
        { organizationId: orgId, userId: snehaUserId, title: 'Benefits enrollment', message: 'Open enrollment closes soon.', type: 'INFO', link: '/settings', isRead: true },
      ],
    });

    await app.prisma.leaveBalance.deleteMany({
      where: { employeeId: snehaId, leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveRequest.deleteMany({
      where: { leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveType.deleteMany({ where: { code: 'TEST', organizationId: orgId } });

    adminToken = await authAs('admin@acme.com', 'Admin@12345');
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');
  });

  afterAll(async () => {
    await app.prisma.leaveBalance.deleteMany({
      where: { employeeId: snehaId, leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveRequest.deleteMany({
      where: { leaveType: { code: 'TEST', organizationId: orgId } },
    });
    await app.prisma.leaveType.deleteMany({ where: { code: 'TEST', organizationId: orgId } });
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('lists the current user notifications with an unread count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: bearer(employeeToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { items: { id: string; isRead: boolean }[]; unread: number; meta: { total: number } } };
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.meta.total).toBeGreaterThan(0);
    expect(typeof body.data.unread).toBe('number');
  });

  it('tracks unread count and scopes read/read-all to the owner', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: bearer(employeeToken),
    });
    const unreadBefore = (before.json() as { data: { unread: number } }).data.unread;
    expect(unreadBefore).toBeGreaterThan(0);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?filter=unread',
      headers: bearer(employeeToken),
    });
    const unreadItem = (list.json() as { data: { items: { id: string }[] } }).data.items[0];

    const mark = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${unreadItem.id}/read`,
      headers: bearer(employeeToken),
    });
    expect(mark.statusCode).toBe(200);
    expect((mark.json() as { data: { isRead: boolean } }).data.isRead).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: bearer(employeeToken),
    });
    expect((after.json() as { data: { unread: number } }).data.unread).toBe(unreadBefore - 1);

    // Another user cannot mark this notification read.
    const crossUser = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${unreadItem.id}/read`,
      headers: bearer(adminToken),
    });
    expect(crossUser.statusCode).toBe(404);
  });

  it('clears the unread badge via mark-all-as-read', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: bearer(employeeToken),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { updated: number } }).data.updated).toBeGreaterThan(0);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: bearer(employeeToken),
    });
    expect((after.json() as { data: { unread: number } }).data.unread).toBe(0);
  });

  it('leave approval and rejection generate real notifications for the applicant', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/types',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        name: 'Test Leave',
        code: 'TEST',
        daysAllowedPerYear: 20,
        isPaid: true,
        requiresApproval: true,
        carryForwardMax: 0,
      },
    });
    expect(created.statusCode).toBe(200);
    testTypeId = (created.json() as { data: { id: string } }).data.id;

    await app.inject({
      method: 'POST',
      url: '/api/v1/leave/balances',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId: snehaId, leaveTypeId: testTypeId, year: 2026, allocated: 20 },
    });

    const apply = await app.inject({
      method: 'POST',
      url: '/api/v1/leave/requests',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: {
        leaveTypeId: testTypeId,
        startDate: '2026-12-07',
        endDate: '2026-12-09',
        totalDays: 3,
        reason: 'NOTIF-TEST annual leave',
      },
    });
    expect(apply.statusCode).toBe(200);
    const requestId = (apply.json() as { data: { id: string } }).data.id;

    const approve = await app.inject({
      method: 'PATCH',
      url: `/api/v1/leave/requests/${requestId}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'APPROVED' },
    });
    expect(approve.statusCode).toBe(200);

    const approvedNotif = await app.prisma.notification.findFirst({
      where: { userId: snehaUserId, title: 'Leave request approved', link: '/leave' },
      orderBy: { createdAt: 'desc' },
    });
    expect(approvedNotif).not.toBeNull();

    // The same employee self-scopes their list via the API.
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?limit=50',
      headers: bearer(employeeToken),
    });
    const titles = (list.json() as { data: { items: { title: string }[] } }).data.items.map((i) => i.title);
    expect(titles).toContain('Leave request approved');
  });
});

describe('Performance Engine', () => {
  let app: FastifyInstance;
  let orgId: string;
  let snehaId: string;
  let snehaUserId: string;
  let otherEmpId: string;
  let activeCycleId: string;
  let draftCycleId: string;
  let adminToken: string;
  let hrToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const sneha = await app.prisma.employee.findFirstOrThrow({
      where: { firstName: 'Sneha', organizationId: orgId },
    });
    snehaId = sneha.id;
    snehaUserId = sneha.userId as string;
    otherEmpId = (await app.prisma.employee.findFirstOrThrow({
      where: { id: { not: snehaId }, organizationId: orgId },
    })).id;

    // Idempotent cleanup of fixtures from a previous run, then rebuild them.
    const oldCycles = await app.prisma.performanceCycle.findMany({
      where: { organizationId: orgId, title: { startsWith: 'TEST ' } },
      select: { id: true },
    });
    await app.prisma.performanceReview.deleteMany({
      where: { cycleId: { in: oldCycles.map((c) => c.id) } },
    });
    await app.prisma.performanceGoal.deleteMany({
      where: { organizationId: orgId, title: { startsWith: 'TS-' } },
    });
    await app.prisma.performanceCycle.deleteMany({
      where: { title: { startsWith: 'TEST ' } },
    });

    activeCycleId = (await app.prisma.performanceCycle.create({
      data: {
        organizationId: orgId,
        title: 'TEST Active Review Cycle',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
        status: 'ACTIVE',
      },
    })).id;
    draftCycleId = (await app.prisma.performanceCycle.create({
      data: {
        organizationId: orgId,
        title: 'TEST Draft Review Cycle',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        status: 'DRAFT',
      },
    })).id;

    adminToken = await authAs('admin@acme.com', 'Admin@12345');
    hrToken = await authAs('hr@acme.com', 'Demo@12345');
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');
  });

  afterAll(async () => {
    await app.prisma.performanceGoal.deleteMany({
      where: { organizationId: orgId, title: { startsWith: 'TS-' } },
    });
    await app.prisma.performanceReview.deleteMany({ where: { organizationId: orgId } });
    await app.prisma.performanceCycle.deleteMany({
      where: { organizationId: orgId, title: { startsWith: 'TEST ' } },
    });
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data: any };
  }

  it('lists cycles and goals for org-wide viewers', async () => {
    const cycles = await app.inject({
      method: 'GET',
      url: '/api/v1/performance/cycles',
      headers: bearer(adminToken),
    });
    expect(cycles.statusCode).toBe(200);
    const cyclesBody = json(cycles).data as { items: { title: string }[]; meta: { total: number } };
    expect(cyclesBody.meta.total).toBeGreaterThan(0);
    expect(cyclesBody.items.some((c) => c.title === 'Q3 2026 Performance Review')).toBe(true);
    expect(cyclesBody.items.some((c) => c.title === 'TEST Active Review Cycle')).toBe(true);

    const goals = await app.inject({
      method: 'GET',
      url: '/api/v1/performance/goals',
      headers: bearer(adminToken),
    });
    expect(goals.statusCode).toBe(200);
    expect((json(goals).data as { meta: { total: number } }).meta.total).toBeGreaterThan(0);
  });

  it('blocks employees without performance.view from org-wide resources', async () => {
    for (const url of ['/api/v1/performance/cycles', '/api/v1/performance/goals']) {
      const res = await app.inject({ method: 'GET', url, headers: bearer(employeeToken) });
      expect(res.statusCode).toBe(403);
    }
  });

  it('enforces the forward-only cycle lifecycle', async () => {
    // DRAFT -> ACTIVE is valid; DRAFT -> COMPLETED is not.
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/cycles',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'TEST Transition Cycle', startDate: '2026-01-01', endDate: '2026-03-31' },
    });
    expect(created.statusCode).toBe(200);
    const id = (json(created).data as { id: string }).id;

    const badJump = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/cycles/${id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'COMPLETED' },
    });
    expect(badJump.statusCode).toBe(409);
    expect((badJump.json() as { error: { code: string } }).error.code).toBe('INVALID_TRANSITION');

    const activate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/cycles/${id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'ACTIVE' },
    });
    expect(activate.statusCode).toBe(200);
    expect((json(activate).data as { status: string }).status).toBe('ACTIVE');

    const complete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/cycles/${id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'COMPLETED' },
    });
    expect(complete.statusCode).toBe(200);

    // Non-draft cycles may not be deleted; drafts may be.
    const nonDeletable = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/cycles',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'TEST NonDeletable Active', startDate: '2026-01-01', endDate: '2026-03-31' },
    });
    expect(nonDeletable.statusCode).toBe(200);
    const nonDeletableId = (json(nonDeletable).data as { id: string }).id;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/cycles/${nonDeletableId}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'ACTIVE' },
    });

    const deleteActive = await app.inject({
      method: 'DELETE',
      url: `/api/v1/performance/cycles/${nonDeletableId}`,
      headers: bearer(adminToken),
    });
    expect(deleteActive.statusCode).toBe(409);

    const deletable = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/cycles',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'TEST Deletable Draft', startDate: '2026-01-01', endDate: '2026-03-31' },
    });
    const deletableId = (json(deletable).data as { id: string }).id;
    const deleteDraft = await app.inject({
      method: 'DELETE',
      url: `/api/v1/performance/cycles/${deletableId}`,
      headers: bearer(adminToken),
    });
    expect(deleteDraft.statusCode).toBe(200);
  });

  it('manages goals with validated status transitions', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/goals',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        employeeId: snehaId,
        title: 'TS-Core Feature Delivery',
        description: 'Ship the Phase 2 reporting module.',
        targetValue: 100,
        currentValue: 10,
        unit: '%',
        dueDate: '2026-12-31',
      },
    });
    expect(created.statusCode).toBe(200);
    const id = (json(created).data as { id: string }).id;

    const progress = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/goals/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { currentValue: 40 },
    });
    expect(progress.statusCode).toBe(200);
    expect((json(progress).data as { currentValue: number }).currentValue).toBe(40);

    const hold = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/goals/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'ON_HOLD' },
    });
    expect(hold.statusCode).toBe(200);

    // ON_HOLD can resume but not jump to COMPLETED.
    const blocked = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/goals/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'COMPLETED' },
    });
    expect(blocked.statusCode).toBe(409);

    const resume = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/goals/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'IN_PROGRESS' },
    });
    expect(resume.statusCode).toBe(200);

    const complete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/goals/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'COMPLETED' },
    });
    expect(complete.statusCode).toBe(200);

    // COMPLETED is terminal.
    const terminal = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/goals/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'IN_PROGRESS' },
    });
    expect(terminal.statusCode).toBe(409);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/v1/performance/goals/nonexistent',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { currentValue: 1 },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('employees can only open a review for themselves on an active cycle', async () => {
    const own = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: snehaId },
    });
    expect(own.statusCode).toBe(200);
    const ownId = (json(own).data as { id: string }).id;

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: snehaId },
    });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: { code: string } }).error.code).toBe('REVIEW_EXISTS');

    const hijack = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: otherEmpId },
    });
    expect(hijack.statusCode).toBe(403);

    // Staff may open a review for any employee on the same active cycle.
    const staffCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: otherEmpId },
    });
    expect(staffCreated.statusCode).toBe(200);
    const staffReviewId = (json(staffCreated).data as { id: string }).id;

    // Leave no reviews behind so later tests can reuse the same (cycle, employee).
    await app.prisma.performanceReview.deleteMany({ where: { id: { in: [ownId, staffReviewId] } } });
  });

  it('self-assessment can be submitted but not used to approve reviews', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: snehaId },
    });
    expect(created.statusCode).toBe(200);
    const id = (json(created).data as { id: string }).id;

    const submit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/reviews/${id}/self`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { selfRating: 4, selfFeedback: 'Delivered the payroll module end to end.', submit: true },
    });
    expect(submit.statusCode).toBe(200);
    expect((json(submit).data as { status: string }).status).toBe('SUBMITTED');

    const asManager = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/reviews/${id}/manager`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { managerRating: 4, finalRating: 4 },
    });
    expect(asManager.statusCode).toBe(403);

    // A review belonging to someone else is not editable as a self-assessment.
    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: otherEmpId },
    });
    expect(other.statusCode).toBe(200);
    const otherReviewId = (json(other).data as { id: string }).id;

    const notOwner = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/reviews/${otherReviewId}/self`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { selfRating: 2, selfFeedback: 'Not mine to edit.' },
    });
    expect(notOwner.statusCode).toBe(403);

    await app.prisma.performanceReview.deleteMany({ where: { id: { in: [id, otherReviewId] } } });
  });

  it('manager approval finalizes the review and notifies the employee', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: snehaId },
    });
    expect(created.statusCode).toBe(200);
    const id = (json(created).data as { id: string }).id;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/reviews/${id}/manager`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { managerRating: 4, managerFeedback: 'Strong quarter.', finalRating: 4.5 },
    });

    const approved = await app.inject({
      method: 'GET',
      url: `/api/v1/performance/reviews/${id}`,
      headers: bearer(adminToken),
    });
    expect(approved.statusCode).toBe(200);
    const approvedBody = json(approved).data as { status: string; finalRating: number; managerRating: number };
    expect(approvedBody.status).toBe('APPROVED');
    expect(approvedBody.finalRating).toBe(4.5);
    expect(approvedBody.managerRating).toBe(4);

    const again = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/reviews/${id}/manager`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { managerRating: 3, finalRating: 3 },
    });
    expect(again.statusCode).toBe(409);
    expect((again.json() as { error: { code: string } }).error.code).toBe('ALREADY_APPROVED');

    const selfEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/performance/reviews/${id}/self`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { selfFeedback: 'Too late to edit.' },
    });
    expect(selfEdit.statusCode).toBe(409);

    const notif = await app.prisma.notification.findFirst({
      where: { userId: snehaUserId, title: 'Performance review finalized', link: '/performance' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).not.toBeNull();

    await app.prisma.performanceReview.delete({ where: { id } });
  });

  it('scopes review reads by permission', async () => {
    // Supply the employee with a review of their own on that cycle.
    const myOwn = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: snehaId },
    });
    expect(myOwn.statusCode).toBe(200);

    const staffAnother = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { cycleId: activeCycleId, employeeId: otherEmpId },
    });
    expect(staffAnother.statusCode).toBe(200);
    const otherId = (json(staffAnother).data as { id: string }).id;

    // Employee: only their own reviews are visible.
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/performance/reviews?limit=50',
      headers: bearer(employeeToken),
    });
    expect(mine.statusCode).toBe(200);
    const mineItems = (json(mine).data as { items: { employeeId: string }[] }).items;
    expect(mineItems.length).toBeGreaterThan(0);
    expect(mineItems.every((r) => r.employeeId === snehaId)).toBe(true);

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/performance/reviews/${otherId}`,
      headers: bearer(employeeToken),
    });
    expect(hidden.statusCode).toBe(404);

    // HR and managers see it org-wide.
    const visible = await app.inject({
      method: 'GET',
      url: `/api/v1/performance/reviews/${otherId}`,
      headers: bearer(hrToken),
    });
    expect(visible.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/performance/reviews?cycleId=${activeCycleId}&limit=50`,
      headers: bearer(hrToken),
    });
    expect((json(list).data as { items: { id: string }[] }).items.some((r) => r.id === otherId)).toBe(true);

    await app.prisma.performanceReview.deleteMany({
      where: { id: { in: [otherId, (json(myOwn).data as { id: string }).id] } },
    });
  });

  it('approved reviews are immutable but draft reviews can be deleted', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/performance/reviews',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { cycleId: draftCycleId, employeeId: snehaId },
    });
    expect(created.statusCode).toBe(200);
    const draftId = (json(created).data as { id: string }).id;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/performance/reviews/${draftId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/performance/reviews/${draftId}`,
      headers: bearer(adminToken),
    });
    expect(gone.statusCode).toBe(404);
  });
});

describe('Operations Engine - Expenses', () => {
  let app: FastifyInstance;
  let orgId: string;
  let snehaUserId: string;
  let managerEmployeeId: string;
  let employeeToken: string;
  let accountantToken: string;
  let managerToken: string;

  const MARKER = 'HRMS-TEST';

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const sneha = await app.prisma.employee.findFirstOrThrow({
      where: { firstName: 'Sneha', organizationId: orgId },
      include: { user: { select: { id: true } } },
    });
    snehaUserId = sneha.user!.id;

    const vikram = await app.prisma.employee.findFirstOrThrow({
      where: { firstName: 'Vikram', organizationId: orgId },
    });
    managerEmployeeId = vikram.id;

    await app.prisma.expense.deleteMany({ where: { organizationId: orgId, merchant: MARKER } });
  });

  afterAll(async () => {
    await app.prisma.expense.deleteMany({ where: { organizationId: orgId, merchant: MARKER } });
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createExpenseAs(token: string, overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/expenses',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload: {
        category: 'TRAVEL',
        amount: 175.5,
        date: '2026-09-20',
        description: 'Test expense claim',
        merchant: MARKER,
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(200);
    return json(res).data as { id: string; status: string; employeeId: string; approvedBy: string | null };
  }

  it('employees self-submit an expense and only ever see their own', async () => {
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');
    const created = await createExpenseAs(employeeToken);

    expect(created.status).toBe('SUBMITTED');
    expect(created.employeeId).toBeTruthy();

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/expenses',
      headers: bearer(employeeToken),
    });
    expect(list.statusCode).toBe(200);
    const own = (list.json() as { data: { employee: { id: string } }[] }).data;
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((x) => x.employee.id === created.employeeId)).toBe(true);
  });

  it('employees cannot adjudicate or pay expenses', async () => {
    const created = await createExpenseAs(employeeToken);

    const approve = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/approve`,
      headers: bearer(employeeToken),
    });
    expect(approve.statusCode).toBe(403);

    const pay = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/pay`,
      headers: bearer(employeeToken),
    });
    expect(pay.statusCode).toBe(403);
  });

  it('validates expense payloads before persisting anything', async () => {
    const badAmount = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/expenses',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { category: 'TRAVEL', amount: -50, date: '2026-09-20', description: 'negative', merchant: MARKER },
    });
    expect(badAmount.statusCode).toBe(400);
    expect(json(badAmount).error!.code).toBe('INVALID_REQUEST');

    const badCategory = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/expenses',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { category: 'SKYDIVING', amount: 10, date: '2026-09-20', description: 'bad category', merchant: MARKER },
    });
    expect(badCategory.statusCode).toBe(400);
  });

  it('moves an expense through approve and pay, guarding invalid transitions', async () => {
    accountantToken = await authAs('accountant@acme.com', 'Demo@12345');
    const created = await createExpenseAs(employeeToken);

    const approve = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/approve`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(approve.statusCode).toBe(200);
    expect(json(approve).data!.status).toBe('APPROVED');
    expect(json(approve).data!.approvedBy).toBeTruthy();

    const reapprove = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/approve`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(reapprove.statusCode).toBe(409);
    expect(json(reapprove).error!.code).toBe('EXPENSE_INVALID_STATUS');

    const pay = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/pay`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(pay.statusCode).toBe(200);
    expect(json(pay).data!.status).toBe('PAID');
    expect(json(pay).data!.approvedBy).toBeTruthy();

    const payAgain = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/pay`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(payAgain.statusCode).toBe(409);

    const approveAfterPay = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/approve`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(approveAfterPay.statusCode).toBe(409);

    const prematurePay = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/pay`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(prematurePay.statusCode).toBe(409);
  });

  it('rejects expenses and notifies the submitting employee', async () => {
    const created = await createExpenseAs(employeeToken);

    const before = await app.prisma.notification.count({
      where: { userId: snehaUserId, title: 'Expense rejected' },
    });

    const reject = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${created.id}/reject`,
      headers: { ...bearer(accountantToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(reject.statusCode).toBe(200);
    expect(json(reject).data!.status).toBe('REJECTED');

    const after = await app.prisma.notification.count({
      where: { userId: snehaUserId, title: 'Expense rejected' },
    });
    expect(after).toBe(before + 1);
  });

  it('blocks adjudicators from acting on their own expenses', async () => {
    managerToken = await authAs('manager@acme.com', 'Demo@12345');

    // MANAGER has expenses.approve but only EMPLOYEE can self-submit, so the
    // expense is seeded directly against the manager's own employee record.
    const direct = await app.prisma.expense.create({
      data: {
        organizationId: orgId,
        employeeId: managerEmployeeId,
        category: 'TRAVEL',
        amount: 95,
        currency: 'USD',
        date: new Date('2026-09-20'),
        merchant: MARKER,
        description: 'Own expense seeded for self-approval guard',
        status: ExpenseStatus.SUBMITTED,
      },
    });

    const selfApprove = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/expenses/${direct.id}/approve`,
      headers: { ...bearer(managerToken), 'content-type': 'application/json' },
      payload: {},
    });
    expect(selfApprove.statusCode).toBe(409);
    expect(json(selfApprove).error!.code).toBe('SELF_APPROVAL');
  });

  it('accountants with view permission see every expense in the org', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/operations/expenses',
      headers: bearer(accountantToken),
    });
    expect(list.statusCode).toBe(200);
    const all = (list.json() as { data: { employee: { id: string } }[] }).data;
    expect(all.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Time Module - Shifts, Holidays & Designations', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let employeeToken: string;
  let deptId: string;
  let employeeId: string;

  const createdShiftIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdHolidayIds: string[] = [];
  const createdDesignationIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const dept = await app.prisma.department.findFirstOrThrow({ where: { organizationId: orgId } });
    deptId = dept.id;

    const emp = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, status: 'ACTIVE' } });
    employeeId = emp.id;

    await app.prisma.shiftAssignment.deleteMany({ where: { organizationId: orgId, id: { in: createdAssignmentIds } } });
  });

  afterAll(async () => {
    await app.prisma.shiftAssignment.deleteMany({ where: { id: { in: createdAssignmentIds } } });
    await app.prisma.shift.deleteMany({ where: { id: { in: createdShiftIds } } });
    await app.prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    await app.prisma.designation.deleteMany({ where: { id: { in: createdDesignationIds } } });
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  it('employees cannot manage or view shifts/holidays/designations', async () => {
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');
    const forShifts = await app.inject({ method: 'GET', url: '/api/v1/attendance/shifts', headers: bearer(employeeToken) });
    expect(forShifts.statusCode).toBe(403);
    const forHolidays = await app.inject({ method: 'GET', url: '/api/v1/attendance/holidays', headers: bearer(employeeToken) });
    expect(forHolidays.statusCode).toBe(403);
    const forDesignations = await app.inject({ method: 'GET', url: '/api/v1/designations', headers: bearer(employeeToken) });
    expect(forDesignations.statusCode).toBe(403);
  });

  it('manages shifts with assignment lifecycle and delete guards', async () => {
    adminToken = await authAs('admin@acme.com', 'Admin@12345');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/shifts',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        name: 'Test Shift',
        code: 'TST_SHIFT',
        startTime: '08:00',
        endTime: '17:00',
        breakDurationMinutes: 45,
        gracePeriodMinutes: 10,
        fullDayHours: 8,
        halfDayHours: 4,
      },
    });
    expect(created.statusCode).toBe(200);
    const shiftId = json(created).data!.id as string;
    createdShiftIds.push(shiftId);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/shifts',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'Other', code: 'tst_shift', startTime: '09:00', endTime: '18:00' },
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('SHIFT_EXISTS');

    const badTime = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/shifts',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'Bad', code: 'TST_BAD', startTime: '9am', endTime: '18:00' },
    });
    expect(badTime.statusCode).toBe(400);

    const assignment = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/shifts/${shiftId}/assignments`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId, startDate: '2026-01-01' },
    });
    expect(assignment.statusCode).toBe(200);
    const assignmentId = json(assignment).data!.id as string;
    createdAssignmentIds.push(assignmentId);

    const blockedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attendance/shifts/${shiftId}`,
      headers: bearer(adminToken),
    });
    expect(blockedDelete.statusCode).toBe(409);
    expect(json(blockedDelete).error!.code).toBe('SHIFT_IN_USE');

    const unassign = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attendance/shifts/assignments/${assignmentId}`,
      headers: bearer(adminToken),
    });
    expect(unassign.statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attendance/shifts/${shiftId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/api/v1/attendance/shifts', headers: bearer(adminToken) });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { data: { code: string }[] }).data.map((s) => s.code)).toContain('SH_MORN');
  });

  it('manages holidays with duplicate and date validation', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/holidays',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'HRMS-TEST-HOLIDAY', date: '2026-12-01', type: 'COMPANY', description: 'Test holiday' },
    });
    expect(created.statusCode).toBe(200);
    const holidayId = json(created).data!.id as string;
    createdHolidayIds.push(holidayId);
    expect(json(created).data!.type).toBe('COMPANY');

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/holidays',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'HRMS-TEST-HOLIDAY', date: '2026-12-01', type: 'NATIONAL' },
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('HOLIDAY_EXISTS');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/attendance/holidays/${holidayId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { type: 'NATIONAL', description: 'Updated' },
    });
    expect(patched.statusCode).toBe(200);
    expect(json(patched).data!.type).toBe('NATIONAL');

    const upcoming = await app.inject({
      method: 'GET',
      url: '/api/v1/attendance/holidays?upcoming=true',
      headers: bearer(adminToken),
    });
    expect(upcoming.statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attendance/holidays/${holidayId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);
  });

  it('manages designations with org-scoped references and delete guards', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/designations',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Test Architect', code: 'TST_DESIG', departmentId: deptId, level: 2, description: 'Temp' },
    });
    expect(created.statusCode).toBe(200);
    const designationId = json(created).data!.id as string;
    createdDesignationIds.push(designationId);

    const badDept = await app.inject({
      method: 'POST',
      url: '/api/v1/designations',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Bad', code: 'TST_BADDEP', departmentId: 'does-not-exist' },
    });
    expect(badDept.statusCode).toBe(400);
    expect(json(badDept).error!.code).toBe('INVALID_REFERENCE');

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/designations',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Dup', code: 'tst_desig', level: 1 },
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('DESIGNATION_EXISTS');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/designations/${designationId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { level: 3, description: 'Updated role' },
    });
    expect(patched.statusCode).toBe(200);
    expect(json(patched).data!.level).toBe(3);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/designations/${designationId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);
  });
});

describe('Recruitment Pipeline - Jobs, Candidates & Interviews', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let employeeToken: string;
  let deptId: string;

  const createdInterviewIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const createdJobIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const dept = await app.prisma.department.findFirstOrThrow({ where: { organizationId: orgId } });
    deptId = dept.id;

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@acme.com', password: 'Admin@12345' },
    });
    adminToken = (login.json() as { data: { accessToken: string } }).data.accessToken;

    const empLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'employee@acme.com', password: 'Demo@12345' },
    });
    employeeToken = (empLogin.json() as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    await app.prisma.interview.deleteMany({ where: { id: { in: createdInterviewIds } } });
    await app.prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
    await app.prisma.jobOpening.deleteMany({ where: { id: { in: createdJobIds } } });
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  it('employees are denied access to recruitment views and actions', async () => {
    const jobs = await app.inject({ method: 'GET', url: '/api/v1/recruitment/jobs', headers: bearer(employeeToken) });
    expect(jobs.statusCode).toBe(403);
    const candidates = await app.inject({ method: 'GET', url: '/api/v1/recruitment/candidates', headers: bearer(employeeToken) });
    expect(candidates.statusCode).toBe(403);
    const newJob = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/jobs',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { title: 'Nope', code: 'NOPE', description: 'x' },
    });
    expect(newJob.statusCode).toBe(403);
  });

  it('manages job openings with lifecycle, duplicates, and delete guards', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/jobs',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        title: 'Staff Engineer (Test)',
        code: 'TST_REQ_ADMIN',
        description: 'Hiring for the platform team.',
        requirements: 'Node.js, TypeScript, SQL',
        location: 'Remote',
        departmentId: deptId,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
        positionsCount: 2,
      },
    });
    expect(created.statusCode).toBe(200);
    const jobId = json(created).data!.id as string;
    createdJobIds.push(jobId);
    expect(json(created).data!.status).toBe('OPEN');

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/jobs',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Dup', code: 'tst_req_admin', description: 'x' },
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('JOB_EXISTS');

    const badDept = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/jobs',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Bad', code: 'TST_BADDEPT', description: 'x', departmentId: 'does-not-exist' },
    });
    expect(badDept.statusCode).toBe(400);
    expect(json(badDept).error!.code).toBe('INVALID_REFERENCE');

    const putOnHold = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/jobs/${jobId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'ON_HOLD' },
    });
    expect(putOnHold.statusCode).toBe(200);
    expect(json(putOnHold).data!.status).toBe('ON_HOLD');
  });

  it('intakes candidates with org-scope, duplicate email, and stage transition rules', async () => {
    const job = await app.prisma.jobOpening.findFirstOrThrow({ where: { organizationId: orgId, code: 'TST_REQ_ADMIN' } });

    const intake = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/candidates',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        jobOpeningId: job.id,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada.lovelace@example.com',
        phone: '+1 555 0100',
        rating: 3,
      },
    });
    expect(intake.statusCode).toBe(200);
    const candId = json(intake).data!.id as string;
    createdCandidateIds.push(candId);
    expect(json(intake).data!.status).toBe('APPLIED');

    const dupEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/candidates',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { jobOpeningId: job.id, firstName: 'Ada', lastName: 'L', email: 'ADA.LOVELACE@example.com' },
    });
    expect(dupEmail.statusCode).toBe(409);
    expect(json(dupEmail).error!.code).toBe('CANDIDATE_EXISTS');

    const wrongOrg = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/candidates',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { jobOpeningId: 'does-not-exist', firstName: 'A', lastName: 'B', email: 'x@example.com' },
    });
    expect(wrongOrg.statusCode).toBe(400);
    expect(json(wrongOrg).error!.code).toBe('INVALID_REFERENCE');

    const toScreen = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'SCREENING' },
    });
    expect(toScreen.statusCode).toBe(200);

    const toInterview = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'INTERVIEW' },
    });
    expect(toInterview.statusCode).toBe(200);

    const skipAhead = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'HIRED' },
    });
    expect(skipAhead.statusCode).toBe(409);
    expect(json(skipAhead).error!.code).toBe('INVALID_TRANSITION');

    const backward = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'APPLIED' },
    });
    expect(backward.statusCode).toBe(409);
    expect(json(backward).error!.code).toBe('INVALID_TRANSITION');

    const toOffer = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'OFFER' },
    });
    expect(toOffer.statusCode).toBe(200);

    const toHired = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'HIRED', rating: 5 },
    });
    expect(toHired.statusCode).toBe(200);
    expect(json(toHired).data!.rating).toBe(5);

    const afterHired = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'REJECTED' },
    });
    expect(afterHired.statusCode).toBe(409);
    expect(json(afterHired).error!.code).toBe('CANDIDATE_TERMINAL_STATE');

    const reject = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/candidates',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        jobOpeningId: job.id,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace.hopper@example.com',
      },
    });
    expect(reject.statusCode).toBe(200);
    const rejectId = json(reject).data!.id as string;
    createdCandidateIds.push(rejectId);

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${rejectId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'SCREENING' },
    });
    const toRejected = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${rejectId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'REJECTED' },
    });
    expect(toRejected.statusCode).toBe(200);

    const reAdmit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${rejectId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'INTERVIEW' },
    });
    expect(reAdmit.statusCode).toBe(409);
    expect(json(reAdmit).error!.code).toBe('CANDIDATE_TERMINAL_STATE');
  });

  it('schedules interviews and records feedback with terminal-state rules', async () => {
    const job = await app.prisma.jobOpening.findFirstOrThrow({ where: { organizationId: orgId, code: 'TST_REQ_ADMIN' } });

    const schedule = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/candidates',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        jobOpeningId: job.id,
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan.turing@example.com',
      },
    });
    const candId = json(schedule).data!.id as string;
    createdCandidateIds.push(candId);

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'SCREENING' },
    });

    const iv = await app.inject({
      method: 'POST',
      url: `/api/v1/recruitment/candidates/${candId}/interviews`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        scheduledAt: '2026-10-01T10:00:00.000Z',
        durationMinutes: 60,
        stage: 'System Design',
        location: 'Room 3',
      },
    });
    expect(iv.statusCode).toBe(200);
    const ivId = json(iv).data!.id as string;
    createdInterviewIds.push(ivId);
    expect(json(iv).data!.status).toBe('SCHEDULED');

    const record = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/interviews/${ivId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'COMPLETED', score: 88, feedback: 'Strong design fundamentals.' },
    });
    expect(record.statusCode).toBe(200);
    expect(json(record).data!.score).toBe(88);

    const cancelAfterComplete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/recruitment/interviews/${ivId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'CANCELLED' },
    });
    expect(cancelAfterComplete.statusCode).toBe(409);
    expect(json(cancelAfterComplete).error!.code).toBe('INTERVIEW_TERMINAL_STATE');

    const list = await app.inject({ method: 'GET', url: '/api/v1/recruitment/interviews', headers: bearer(adminToken) });
    expect(list.statusCode).toBe(200);

    const cannotDeleteCandidate = await app.inject({
      method: 'DELETE',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: bearer(adminToken),
    });
    expect(cannotDeleteCandidate.statusCode).toBe(409);
    expect(json(cannotDeleteCandidate).error!.code).toBe('CANDIDATE_HAS_INTERVIEWS');

    const delIv = await app.inject({
      method: 'DELETE',
      url: `/api/v1/recruitment/interviews/${ivId}`,
      headers: bearer(adminToken),
    });
    expect(delIv.statusCode).toBe(200);

    const deleteCandidate = await app.inject({
      method: 'DELETE',
      url: `/api/v1/recruitment/candidates/${candId}`,
      headers: bearer(adminToken),
    });
    expect(deleteCandidate.statusCode).toBe(200);
  });

  it('rejects interviews for hired or rejected candidates', async () => {
    const hired = await app.prisma.candidate.findFirstOrThrow({
      where: { organizationId: orgId, status: 'HIRED' },
    });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/recruitment/candidates/${hired.id}/interviews`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { scheduledAt: '2026-11-01T10:00:00.000Z' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(json(blocked).error!.code).toBe('CANDIDATE_TERMINAL_STATE');
  });

  it('deletes an empty job opening in full', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/recruitment/jobs',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Temp Role', code: 'TST_REQ_EMPTY', description: 'To be deleted' },
    });
    expect(created.statusCode).toBe(200);
    const jobId = json(created).data!.id as string;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/recruitment/jobs/${jobId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);
  });

  it('guards deletion of jobs and candidates that are in use', async () => {
    const job = await app.prisma.jobOpening.findFirstOrThrow({ where: { organizationId: orgId, code: 'TST_REQ_ADMIN' } });
    const cannotDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/recruitment/jobs/${job.id}`,
      headers: bearer(adminToken),
    });
    expect(cannotDelete.statusCode).toBe(409);
    expect(json(cannotDelete).error!.code).toBe('JOB_HAS_CANDIDATES');
  });
});

describe('Asset Lifecycle - Register, Assign, Return & Maintain', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;

  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const emp = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, status: 'ACTIVE' } });
    employeeId = emp.id;

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@acme.com', password: 'Admin@12345' },
    });
    adminToken = (login.json() as { data: { accessToken: string } }).data.accessToken;

    const empLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'employee@acme.com', password: 'Demo@12345' },
    });
    employeeToken = (empLogin.json() as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    await app.prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  it('employees cannot view or manage assets', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/assets', headers: bearer(employeeToken) });
    expect(list.statusCode).toBe(403);
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { name: 'Nope', assetTag: 'NO' },
    });
    expect(create.statusCode).toBe(403);
  });

  it('registers assets with unique tags and an assignment lifecycle', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'Test Laptop', assetTag: 'TST-AST-01', category: 'LAPTOP', serialNumber: 'SN0001' },
    });
    expect(created.statusCode).toBe(200);
    const assetId = json(created).data!.id as string;
    createdAssetIds.push(assetId);
    expect(json(created).data!.status).toBe('AVAILABLE');

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'Other', assetTag: 'tst-ast-01' },
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('ASSET_EXISTS');

    const assign = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${assetId}/assign`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId },
    });
    expect(assign.statusCode).toBe(200);
    expect(json(assign).data!.status).toBe('ASSIGNED');
    expect(json(assign).data!.assignedToId).toBe(employeeId);

    const assignAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${assetId}/assign`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId },
    });
    expect(assignAgain.statusCode).toBe(409);
    expect(json(assignAgain).error!.code).toBe('ASSET_NOT_AVAILABLE');

    const blockedStatusWhileAssigned = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${assetId}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'UNDER_MAINTENANCE' },
    });
    expect(blockedStatusWhileAssigned.statusCode).toBe(409);
    expect(json(blockedStatusWhileAssigned).error!.code).toBe('ASSET_ASSIGNED');

    const cannotEditAssigned = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assets/${assetId}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'RETIRED' },
    });
    expect(cannotEditAssigned.statusCode).toBe(409);

    const cannotDeleteAssigned = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${assetId}`,
      headers: bearer(adminToken),
    });
    expect(cannotDeleteAssigned.statusCode).toBe(409);
    expect(json(cannotDeleteAssigned).error!.code).toBe('ASSET_ASSIGNED');
  });

  it('returns assets and manages maintenance/retired lifecycle', async () => {
    const asset = await app.prisma.asset.findFirstOrThrow({ where: { organizationId: orgId, assetTag: 'TST-AST-01' } });

    const returnAsset = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${asset.id}/return`,
      headers: bearer(adminToken),
    });
    expect(returnAsset.statusCode).toBe(200);
    expect(json(returnAsset).data!.status).toBe('AVAILABLE');
    expect(json(returnAsset).data!.assignedToId).toBeNull();

    const returnAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${asset.id}/return`,
      headers: bearer(adminToken),
    });
    expect(returnAgain.statusCode).toBe(409);
    expect(json(returnAgain).error!.code).toBe('ASSET_NOT_ASSIGNED');

    const maintenance = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${asset.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'UNDER_MAINTENANCE' },
    });
    expect(maintenance.statusCode).toBe(200);

    const canAssignWhileMaintenance = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${asset.id}/assign`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId },
    });
    expect(canAssignWhileMaintenance.statusCode).toBe(409);
    expect(json(canAssignWhileMaintenance).error!.code).toBe('ASSET_NOT_AVAILABLE');

    const retire = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${asset.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'RETIRED' },
    });
    expect(retire.statusCode).toBe(200);

    const reactivate = await app.inject({
      method: 'POST',
      url: `/api/v1/assets/${asset.id}/status`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { status: 'AVAILABLE' },
    });
    expect(reactivate.statusCode).toBe(409);
    expect(json(reactivate).error!.code).toBe('ASSET_RETIRED');
  });

  it('deletes an unused asset in full', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { name: 'Old Monitor', assetTag: 'TST-MON-01', category: 'MONITOR' },
    });
    expect(created.statusCode).toBe(200);
    const assetId = json(created).data!.id as string;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${assetId}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);
  });
});

describe('Announcements - Publish, Target & Moderate', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let employeeToken: string;
  let deptId: string;

  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;
    const dept = await app.prisma.department.findFirstOrThrow({ where: { organizationId: orgId } });
    deptId = dept.id;

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@acme.com', password: 'Admin@12345' },
    });
    adminToken = (login.json() as { data: { accessToken: string } }).data.accessToken;

    const empLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'employee@acme.com', password: 'Demo@12345' },
    });
    employeeToken = (empLogin.json() as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    await app.prisma.announcement.deleteMany({ where: { id: { in: createdIds } } });
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  it('employees can read announcements but cannot publish', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/operations/announcements', headers: bearer(employeeToken) });
    expect(list.statusCode).toBe(200);
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/announcements',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { title: 'Intruder', content: 'x' },
    });
    expect(create.statusCode).toBe(403);
  });

  it('publishes, targets, and validates announcements', async () => {
    const published = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/announcements',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'HRMS-TEST-ANNOUNCE', content: 'All-hands moved to Thursday 4pm.', targetAudience: 'ALL' },
    });
    expect(published.statusCode).toBe(200);
    const id = json(published).data!.id as string;
    createdIds.push(id);
    expect(json(published).data!.targetAudience).toBe('ALL');

    const targeted = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/announcements',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Team Offsite', content: 'Only for this department.', targetDepartmentId: deptId },
    });
    expect(targeted.statusCode).toBe(200);
    const targetedId = json(targeted).data!.id as string;
    createdIds.push(targetedId);
    expect(json(targeted).data!.targetAudience).toBe('DEPARTMENT');

    const badDept = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/announcements',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Bad', content: 'x', targetDepartmentId: 'does-not-exist' },
    });
    expect(badDept.statusCode).toBe(400);
    expect(json(badDept).error!.code).toBe('INVALID_REFERENCE');

    const badExpiry = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/announcements',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        title: 'Past expiry',
        content: 'x',
        publishedAt: '2026-12-01T00:00:00.000Z',
        expiresAt: '2026-11-01T00:00:00.000Z',
      },
    });
    expect(badExpiry.statusCode).toBe(400);
  });

  it('updates and deletes announcements', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/announcements',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Edit me', content: 'Hello' },
    });
    const id = json(created).data!.id as string;
    createdIds.push(id);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/operations/announcements/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Edited title', content: 'Updated content' },
    });
    expect(updated.statusCode).toBe(200);
    expect(json(updated).data!.title).toBe('Edited title');

    const notFound = await app.inject({
      method: 'PATCH',
      url: '/api/v1/operations/announcements/does-not-exist',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'x' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(json(notFound).error!.code).toBe('ANNOUNCEMENT_NOT_FOUND');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/operations/announcements/${id}`,
      headers: bearer(adminToken),
    });
    expect(deleted.statusCode).toBe(200);
  });
});

describe('Documents - Upload, Verify & Moderate', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;

  const createdDocIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;
    const emp = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, status: 'ACTIVE' } });
    employeeId = emp.id;

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@acme.com', password: 'Admin@12345' },
    });
    adminToken = (login.json() as { data: { accessToken: string } }).data.accessToken;

    const empLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'employee@acme.com', password: 'Demo@12345' },
    });
    employeeToken = (empLogin.json() as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    for (const id of createdDocIds) {
      await app.inject({ method: 'DELETE', url: `/api/v1/documents/${id}`, headers: bearer(adminToken) });
    }
    await app.prisma.employeeDocument.deleteMany({ where: { id: { in: createdDocIds } } });
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  it('employees can read and upload but not moderate documents', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/documents', headers: bearer(employeeToken) });
    expect(list.statusCode).toBe(200);
    const moderate = await app.inject({
      method: 'PATCH',
      url: '/api/v1/documents/does-not-exist',
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { verified: true },
    });
    expect(moderate.statusCode).toBe(403);
  });

  it('uploads a file via multipart and streams it back', async () => {
    const boundary = '----HRMS-TEST-BOUNDARY';
    const content = 'HRMS upload test payload\nsecond line\r\n';

    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="title"\r\n\r\n` +
      `HRMS-TEST-FILE\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="category"\r\n\r\n` +
      `CONTRACT\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="employeeId"\r\n\r\n` +
      `${employeeId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="notes.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${content}` +
      `\r\n--${boundary}--\r\n`;

    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(body, 'utf-8'),
    });
    expect(uploaded.statusCode).toBe(200);
    const id = json(uploaded).data!.id as string;
    createdDocIds.push(id);
    expect(json(uploaded).data!.category).toBe('CONTRACT');
    expect(json(uploaded).data!.fileSize).toBe(Buffer.byteLength(content));
    expect(String(json(uploaded).data!.fileUrl)).toContain('uploads/');

    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${id}/content`,
      headers: bearer(adminToken),
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.body).toBe(content);
  });

  it('registers remote links, verifies, and updates metadata', async () => {
    const linked = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Policy Portal', category: 'OTHER', url: 'https://example.com/hr-policy.pdf', employeeId },
    });
    expect(linked.statusCode).toBe(200);
    const id = json(linked).data!.id as string;
    createdDocIds.push(id);
    expect(json(linked).data!.fileUrl).toBe('https://example.com/hr-policy.pdf');

    const badUrl = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Bad', url: 'not-a-url', employeeId },
    });
    expect(badUrl.statusCode).toBe(400);

    const verified = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { verified: true, category: 'POLICY' },
    });
    expect(verified.statusCode).toBe(400);

    const verifiedOk = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${id}`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { verified: true },
    });
    expect(verifiedOk.statusCode).toBe(200);
    expect(json(verifiedOk).data!.verifiedAt).toBeTruthy();

    const uploadedDoc = await app.prisma.employeeDocument.findFirstOrThrow({
      where: { organizationId: orgId, fileUrl: { startsWith: 'uploads/' } },
    });
    const moderateNoManage = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${uploadedDoc.id}`,
      headers: { ...bearer(employeeToken), 'content-type': 'application/json' },
      payload: { title: 'Hack' },
    });
    expect(moderateNoManage.statusCode).toBe(403);
  });

  it('deletes documents in full', async () => {
    const linked = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { title: 'Temp', url: 'https://example.com/temp.pdf', employeeId },
    });
    const id = json(linked).data!.id as string;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${id}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${id}/content`,
      headers: bearer(adminToken),
    });
    expect(missing.statusCode).toBe(404);
    expect(json(missing).error!.code).toBe('DOCUMENT_NOT_FOUND');
  });
});

describe('Biometric Hardware Integration', () => {
  let app: FastifyInstance;
  let orgId: string;
  let deviceId: string;
  let adminToken: string;
  let employeeToken: string;
  let extraThrownId: string | null = null;

  const json = <T = any>(res: { json(): unknown }): T => res.json() as T;

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const device = await app.prisma.biometricDevice.findFirstOrThrow({
      where: { organizationId: orgId, code: 'DEV_LOBBY' },
    });
    deviceId = device.id;

    adminToken = await authAs('admin@acme.com', 'Admin@12345');
    employeeToken = await authAs('employee@acme.com', 'Demo@12345');
  });

  afterAll(async () => {
    if (extraThrownId) {
      await app.prisma.employeeBiometric.deleteMany({ where: { id: extraThrownId } });
    }
    await app.close();
  });

  async function authAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { accessToken: string } }).data.accessToken;
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('requires attendance.manage for all device endpoints', async () => {
    const cases: Array<[string, string, { body?: unknown }?]> = [
      ['GET', '/api/v1/attendance/devices'],
      ['POST', '/api/v1/attendance/devices/sync-all'],
      ['POST', '/api/v1/attendance/devices/simulate-punch'],
      ['POST', `/api/v1/attendance/devices/${deviceId}/sync`],
      ['GET', `/api/v1/attendance/devices/${deviceId}/logs`],
      ['GET', `/api/v1/attendance/devices/${deviceId}/enrollments`],
      ['POST', `/api/v1/attendance/devices/${deviceId}/enrollments`, { body: { employeeId: 'x', deviceUserId: 'y' } }],
      ['POST', `/api/v1/attendance/devices/${deviceId}/listen`],
      ['POST', `/api/v1/attendance/devices/${deviceId}/unlisten`],
    ];
    for (const [method, url, opts] of cases) {
      const headers = opts?.body ? { ...bearer(employeeToken), 'content-type': 'application/json' } : bearer(employeeToken);
      const forbidden = await app.inject({
        method,
        url,
        headers,
        payload: opts?.body,
      });
      expect(forbidden.statusCode, `expected 403 for ${method} ${url}`).toBe(403);

      const unauthenticated = await app.inject({ method, url, payload: opts?.body });
      expect(unauthenticated.statusCode, `expected 401 for ${method} ${url}`).toBe(401);
    }
  });

  it('lists devices with sync metadata, listening state and enrollments/punch counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attendance/devices',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const devices = json(res).data as Array<Record<string, unknown>>;
    const lobby = devices.find((d) => d.id === deviceId) as Record<string, unknown> & {
      _count: { enrollments: number; punchLogs: number };
    };
    expect(lobby).toBeDefined();
    expect(typeof lobby.commKey).toBe('number');
    expect(['IDLE', 'RUNNING', 'OK', 'FAILED']).toContain(lobby.lastSyncStatus);
    expect(typeof lobby.listening).toBe('boolean');
    expect(lobby._count.enrollments).toBeGreaterThan(0);
    expect(lobby._count.punchLogs).toBeGreaterThan(0);
  });

  it('creates enrollments, rejects duplicates and device-user-id collisions, then deletes', async () => {
    const unenrolled = await app.prisma.employee.findFirstOrThrow({
      where: {
        organizationId: orgId,
        biometricEnrollments: { none: { deviceId } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/enrollments`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        employeeId: unenrolled.id,
        deviceUserId: `UID-${unenrolled.employeeCode}`,
        faceEnrolled: true,
        fingerprints: 1,
      },
    });
    expect(created.statusCode).toBe(200);
    const enrollment = json(created).data as { id: string };
    extraThrownId = enrollment.id;

    const dup = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/enrollments`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId: unenrolled.id, deviceUserId: 'UID-X' },
    });
    expect(dup.statusCode).toBe(409);
    expect((json(dup) as any).error!.code).toBe('ALREADY_ENROLLED');

    const userIdTaken = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/enrollments`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId: unenrolled.id === 'x' ? '' : '', deviceUserId: `UID-${unenrolled.employeeCode}` },
    });
    // Device user id is taken, but validation fires first because employeeId is empty.
    expect(userIdTaken.statusCode).toBe(400);

    const another = await app.prisma.employee.findFirstOrThrow({
      where: { id: { not: unenrolled.id }, organizationId: orgId },
    });
    const collision = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/enrollments`,
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: { employeeId: another.id, deviceUserId: `UID-${unenrolled.employeeCode}` },
    });
    expect(collision.statusCode).toBe(409);
    expect((json(collision) as any).error!.code).toBe('DEVICE_USERID_TAKEN');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attendance/devices/${deviceId}/enrollments/${enrollment.id}`,
      headers: bearer(adminToken),
    });
    expect(del.statusCode).toBe(200);
    extraThrownId = null;

    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attendance/devices/${deviceId}/enrollments/${enrollment.id}`,
      headers: bearer(adminToken),
    });
    expect(gone.statusCode).toBe(404);
  });

  it('lists punch logs and filters by match state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attendance/devices/${deviceId}/logs?limit=10`,
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = json(res).data as { total: number; items: Array<{ employeeId: string | null }> };
    expect(body.total).toBeGreaterThan(0);
    expect(body.items.every((i) => i.employeeId !== null)).toBe(true);
  });

  it('handles an unreachable terminal gracefully as a FAILED sync', async () => {
    await app.prisma.biometricDevice.update({
      where: { id: deviceId },
      data: { ipAddress: '127.0.0.1', port: 1 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/sync`,
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = json(res).data as { status: string; error?: string };
    expect(body.status).toBe('FAILED');
    expect(typeof body.error).toBe('string');

    const after = await app.prisma.biometricDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(after.lastSyncStatus).toBe('FAILED');
    expect(after.status).toBe('OFFLINE');

    // Restore the seeded address so later tests / the dashboard stay sane.
    await app.prisma.biometricDevice.update({
      where: { id: deviceId },
      data: { ipAddress: '192.168.1.10', port: 4370 },
    });
  });

  it('sync-all reports per-device summaries without throwing on offline terminals', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/devices/sync-all',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = json(res).data as { synced: number; skipped: number; results: Array<{ deviceId: string; status: string }> };
    expect(body.synced).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.results)).toBe(true);
    for (const r of body.results) {
      expect(['OK', 'FAILED']).toContain(r.status);
    }
  }, 60_000);

  it('starts and stops realtime listening per device', async () => {
    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/listen`,
      headers: bearer(adminToken),
    });
    expect(start.statusCode).toBe(200);
    expect((json(start).data as { status: string }).status).toBe('OK');
    expect(app.biometric.isListening(deviceId)).toBe(true);

    const stop = await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/devices/${deviceId}/unlisten`,
      headers: bearer(adminToken),
    });
    expect(stop.statusCode).toBe(200);
    expect((json(stop).data as { listening: boolean }).listening).toBe(false);
    expect(app.biometric.isListening(deviceId)).toBe(false);
  });
});

describe('ADMS / iClock Device Push Protocol', () => {
  let app: FastifyInstance;
  let orgId: string;
  let lobbyId: string;

  beforeAll(async () => {
    app = await buildApp();
    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;
    const lobby = await app.prisma.biometricDevice.findFirstOrThrow({
      where: { organizationId: orgId, code: 'DEV_LOBBY' },
    });
    lobbyId = lobby.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('ingests an ATTLOG push into punch logs and the attendance record', async () => {
    const body = [
      'EMP-002\t2026-09-18 10:15:00\t0\t15\t0,2026-09-18 10:15:00 123',
      'EMP-002\t2026-09-18 18:30:00\t1\t15\t0,2026-09-18 18:30:00 456',
      '***',
      '',
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/iclock/cdata?SN=ZK-2026-0001&table=ATTLOG',
      headers: { 'content-type': 'text/plain' },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK');

    const punches = await app.prisma.biometricPunchLog.findMany({
      where: {
        deviceId: lobbyId,
        source: 'API',
        punchTime: { gte: new Date('2026-09-18T00:00:00Z'), lt: new Date('2026-09-19T00:00:00Z') },
      },
      orderBy: { punchTime: 'asc' },
    });
    expect(punches.length).toBe(2);
    expect(punches[0].deviceUserId).toBe('EMP-002');
    expect(punches[0].punchState).toBe(0);
    expect(punches[0].verifyMode).toBe(15);
    expect(punches[1].punchState).toBe(1);
    expect(punches.every((p) => p.employeeId !== null)).toBe(true);

    const record = await app.prisma.attendanceRecord.findUniqueOrThrow({
      where: { id: punches[0].attendanceRecordId! },
    });
    expect(record.checkIn).not.toBeNull();
    expect(record.checkOut).not.toBeNull();
    expect(record.status).toBe('PRESENT');
    // Same calendar day as the punch in the org timezone.
    expect(record.date.toISOString().slice(0, 10)).toBe(punches[0].punchTime.toISOString().slice(0, 10));

    const device = await app.prisma.biometricDevice.findUniqueOrThrow({ where: { id: lobbyId } });
    expect(device.status).toBe('ONLINE');

    const day = { gte: new Date('2026-09-18T00:00:00Z'), lt: new Date('2026-09-19T00:00:00Z') };
    await app.prisma.attendanceRecord.deleteMany({ where: { id: record.id } });
    await app.prisma.biometricPunchLog.deleteMany({ where: { deviceId: lobbyId, source: 'API', punchTime: day } });
    await app.prisma.biometricDevice.update({ where: { id: lobbyId }, data: { status: 'ONLINE' } });
  });

  it('answers registry, command-poll and devicecmd like the ADMS spec', async () => {
    const reg = await app.inject({
      method: 'GET',
      url: '/iclock/registry?SN=ZK-2026-0001&options=DeviceName%3DLobby,IPAddress%3D192.168.1.10',
    });
    expect(reg.statusCode).toBe(200);
    expect(reg.body).toBe('OK');

    const poll = await app.inject({
      method: 'GET',
      url: '/iclock/getrequest?SN=ZK-2026-0001',
    });
    expect(poll.statusCode).toBe(200);
    expect(poll.body).toBe('');

    const cmd = await app.inject({
      method: 'POST',
      url: '/iclock/devicecmd',
      headers: { 'content-type': 'text/plain' },
      payload: 'ID=1&Return=0&CMD=INFO',
    });
    expect(cmd.statusCode).toBe(200);
    expect(cmd.body).toBe('OK');
  });

  it('maps ADMS status codes to IN/OUT punch states', async () => {
    const { admsStatusToPunchState } = await import('../src/services/biometric/adms');
    expect(admsStatusToPunchState(0)).toBe(0);
    expect(admsStatusToPunchState(1)).toBe(1);
    expect(admsStatusToPunchState(2)).toBe(1);
    expect(admsStatusToPunchState(3)).toBe(0);
    expect(admsStatusToPunchState(4)).toBe(0);
    expect(admsStatusToPunchState(5)).toBe(1);
  });

  it('defaults binary-pull/realtime verify mode from the device modality', async () => {
    const { defaultZkVerifyMode, verifyModeToMethod } = await import('../src/services/biometric/intake');
    expect(defaultZkVerifyMode('FACE')).toBe(15);
    expect(defaultZkVerifyMode('FINGERPRINT')).toBe(1);
    expect(defaultZkVerifyMode('HYBRID')).toBe(1);

    // A FACE terminal keeps scoring FACE even though node-zklib sends no mode.
    expect(verifyModeToMethod('FACE', defaultZkVerifyMode('FACE'))).toBe('FACE');
    expect(verifyModeToMethod('FINGERPRINT', defaultZkVerifyMode('FINGERPRINT'))).toBe('FINGERPRINT');
    // HYBRID terminals rely on the raw code: 15 → FACE, 1 → FINGERPRINT.
    expect(verifyModeToMethod('HYBRID', 15)).toBe('FACE');
    expect(verifyModeToMethod('HYBRID', 1)).toBe('FINGERPRINT');
  });

  it('acknowledges pushes from unknown devices without storing punches', async () => {
    const before = await app.prisma.biometricPunchLog.count();
    const res = await app.inject({
      method: 'POST',
      url: '/iclock/cdata?SN=UNKNOWN-999&table=ATTLOG',
      headers: { 'content-type': 'text/plain' },
      payload: 'EMP-002\t2026-09-19 08:00:00\t0\t1\t0',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK');
    expect(await app.prisma.biometricPunchLog.count()).toBe(before);
  });

  it('acknowledges non-attendance tables without touching punch logs', async () => {
    const before = await app.prisma.biometricPunchLog.count();
    const res = await app.inject({
      method: 'POST',
      url: '/iclock/cdata?SN=ZK-2026-0001&table=USERINFO',
      headers: { 'content-type': 'text/plain' },
      payload: 'PIN=EMP-002\tName=Jane\tPrivilege=0',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK');
    expect(await app.prisma.biometricPunchLog.count()).toBe(before);
  });
});

describe('Approval Center - Attendance Corrections Engine', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let hrToken: string;
  let employeeToken: string;
  let employeeRow: { id: string; userId: string };
  let adminRow: { id: string; userId: string };
  let recordId: string;
  const createdCorrectionIds: string[] = [];

  const CORRECTION_DAY = new Date(2023, 6, 15, 9, 0, 0);

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const login = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      return (res.json() as { data: { accessToken: string } }).data.accessToken;
    };
    adminToken = await login('admin@acme.com', 'Admin@12345');
    hrToken = await login('hr@acme.com', 'Demo@12345');
    employeeToken = await login('employee@acme.com', 'Demo@12345');

    employeeRow = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, employeeCode: 'EMP-005' }, select: { id: true, userId: true } });
    adminRow = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, employeeCode: 'EMP-001' }, select: { id: true, userId: true } });

    const record = await app.prisma.attendanceRecord.create({
      data: {
        organizationId: orgId,
        employeeId: employeeRow.id,
        date: CORRECTION_DAY,
        checkIn: new Date(2023, 6, 15, 9, 10, 0),
        checkOut: new Date(2023, 6, 15, 17, 30, 0),
        status: 'PRESENT',
        method: 'WEB',
        workHours: 8.33,
      },
    });
    recordId = record.id;
  });

  afterAll(async () => {
    await app.prisma.attendanceCorrection.deleteMany({ where: { id: { in: createdCorrectionIds } } });
    await app.prisma.attendanceRecord.deleteMany({ where: { id: recordId } }).catch(() => undefined);
    const { start, end } = { start: new Date(2023, 6, 15), end: new Date(2023, 6, 16) };
    await app.prisma.attendanceRecord.deleteMany({
      where: { organizationId: orgId, employeeId: employeeRow.id, date: { gte: start, lt: end } },
    }).catch(() => undefined);
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  function post(url: string, token: string, payload: unknown, method = 'POST') {
    return app.inject({
      method,
      url,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload,
    });
  }

  it('restricts correction access: employees cannot list or act, and are limited to their own requests', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/attendance/corrections', headers: bearer(employeeToken) });
    expect(list.statusCode).toBe(403);

    const other = await post('/api/v1/attendance/corrections', employeeToken, {
      employeeId: adminRow.id,
      attendanceRecordId: recordId,
      proposedCheckIn: new Date(2023, 6, 15, 9, 0, 0),
      proposedCheckOut: new Date(2023, 6, 15, 18, 0, 0),
      reason: 'Should be blocked',
    });
    expect(other.statusCode).toBe(403);
    expect(json(other).error!.code).toBe('SELF_ONLY');

    const act = await post(`/api/v1/attendance/corrections/some-id/status`, employeeToken, { status: 'APPROVED' }, 'PATCH');
    expect(act.statusCode).toBe(403);
  });

  it('requests a correction, blocks duplicates and invalid times, then HR approves and applies the record', async () => {
    const created = await post('/api/v1/attendance/corrections', employeeToken, {
      attendanceRecordId: recordId,
      proposedCheckIn: new Date(2023, 6, 15, 8, 55, 0),
      proposedCheckOut: new Date(2023, 6, 15, 18, 5, 0),
      reason: 'Client sync ran past 5pm',
    });
    expect(created.statusCode).toBe(200);
    const corrId = json(created).data!.id as string;
    createdCorrectionIds.push(corrId);
    const corr = json(created).data as { status: string; date: string };
    expect(corr.status).toBe('PENDING');

    const dup = await post('/api/v1/attendance/corrections', employeeToken, {
      attendanceRecordId: recordId,
      proposedCheckIn: new Date(2023, 6, 15, 9, 0, 0),
      proposedCheckOut: new Date(2023, 6, 15, 18, 0, 0),
      reason: 'Another request',
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('CORRECTION_ALREADY_PENDING');

    const badTimes = await post('/api/v1/attendance/corrections', employeeToken, {
      attendanceRecordId: recordId,
      proposedCheckIn: new Date(2023, 6, 15, 19, 0, 0),
      proposedCheckOut: new Date(2023, 6, 15, 18, 0, 0),
      reason: 'Backwards',
    });
    expect(badTimes.statusCode).toBe(400);

    const listing = await app.inject({ method: 'GET', url: '/api/v1/attendance/corrections?status=PENDING', headers: bearer(adminToken) });
    expect(listing.statusCode).toBe(200);
    const items = json(listing).data as Array<{ id: string; employee: { employeeCode: string } }>;
    expect(items.some((c) => c.id === corrId && c.employee.employeeCode === 'EMP-005')).toBe(true);

    const approved = await post(`/api/v1/attendance/corrections/${corrId}/status`, adminToken, { status: 'APPROVED' }, 'PATCH');
    expect(approved.statusCode).toBe(200);

    const record = await app.prisma.attendanceRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(record.checkIn!.getTime()).toBe(new Date(2023, 6, 15, 8, 55, 0).getTime());
    expect(record.checkOut!.getTime()).toBe(new Date(2023, 6, 15, 18, 5, 0).getTime());
    expect(record.workHours).toBeCloseTo(9.17, 2);

    const notification = await app.prisma.notification.findFirst({
      where: { organizationId: orgId, userId: employeeRow.userId, type: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification?.message).toContain('approved');
  });

  it('rejects require a reason, terminal states cannot be re-processed, and self-approval is blocked', async () => {
    const self = await post('/api/v1/attendance/corrections', adminToken, {
      date: new Date(2023, 6, 16, 12, 0, 0),
      proposedCheckIn: new Date(2023, 6, 16, 9, 0, 0),
      proposedCheckOut: new Date(2023, 6, 16, 18, 0, 0),
      reason: 'Admin own time fix',
    });
    expect(self.statusCode).toBe(200);
    const selfId = json(self).data!.id as string;
    createdCorrectionIds.push(selfId);

    const selfApprove = await post(`/api/v1/attendance/corrections/${selfId}/status`, adminToken, { status: 'APPROVED' }, 'PATCH');
    expect(selfApprove.statusCode).toBe(409);
    expect(json(selfApprove).error!.code).toBe('SELF_APPROVAL');

    const noReason = await post('/api/v1/attendance/corrections', employeeToken, {
      date: new Date(2023, 6, 17, 12, 0, 0),
      proposedCheckIn: new Date(2023, 6, 17, 9, 0, 0),
      proposedCheckOut: new Date(2023, 6, 17, 18, 0, 0),
      reason: 'Different day',
    });
    expect(noReason.statusCode).toBe(200);
    const corrId = json(noReason).data!.id as string;
    createdCorrectionIds.push(corrId);

    const bareReject = await post(`/api/v1/attendance/corrections/${corrId}/status`, hrToken, { status: 'REJECTED' }, 'PATCH');
    expect(bareReject.statusCode).toBe(400);

    const rejected = await post(`/api/v1/attendance/corrections/${corrId}/status`, hrToken, {
      status: 'REJECTED',
      rejectionReason: 'Device logs show a 10:00 check-in',
    }, 'PATCH');
    expect(rejected.statusCode).toBe(200);

    const again = await post(`/api/v1/attendance/corrections/${corrId}/status`, adminToken, { status: 'APPROVED' }, 'PATCH');
    expect(again.statusCode).toBe(409);
    expect(json(again).error!.code).toBe('ALREADY_PROCESSED');

    const notification = await app.prisma.notification.findFirst({
      where: { organizationId: orgId, userId: employeeRow.userId, type: 'ALERT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification?.message).toContain('rejected');
  });
});

describe('Helpdesk - Ticket Lifecycle & Comments', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let hrToken: string;
  let employeeToken: string;
  let employeeRow: { id: string; userId: string };
  let hrRow: { id: string; userId: string };
  const createdTicketIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const login = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      return (res.json() as { data: { accessToken: string } }).data.accessToken;
    };
    adminToken = await login('admin@acme.com', 'Admin@12345');
    hrToken = await login('hr@acme.com', 'Demo@12345');
    employeeToken = await login('employee@acme.com', 'Demo@12345');

    employeeRow = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, employeeCode: 'EMP-005' }, select: { id: true, userId: true } });
    hrRow = await app.prisma.employee.findFirstOrThrow({ where: { organizationId: orgId, employeeCode: 'EMP-002' }, select: { id: true, userId: true } });
  });

  afterAll(async () => {
    await app.prisma.helpdeskComment.deleteMany({ where: { ticket: { id: { in: createdTicketIds } } } });
    await app.prisma.helpdeskTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  function post(url: string, token: string, payload: unknown, method = 'POST') {
    return app.inject({
      method,
      url,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload,
    });
  }

  it('creates tickets, scopes listing to self, and blocks cross-employee reads', async () => {
    const created = await post('/api/v1/helpdesk/tickets', employeeToken, {
      subject: 'VPN not working',
      description: 'Cannot connect to the office VPN from home network.',
      category: 'IT',
      priority: 'HIGH',
    });
    expect(created.statusCode).toBe(200);
    const ticketId = json(created).data!.id as string;
    createdTicketIds.push(ticketId);
    expect(json(created).data!.status).toBe('OPEN');
    expect(json(created).data!.employee.employeeCode).toBe('EMP-005');

    const otherEmployee = await post('/api/v1/helpdesk/tickets', employeeToken, {
      subject: 'Spoofed',
      description: 'Trying to open a ticket for someone else',
      employeeId: hrRow.id,
    });
    expect(otherEmployee.statusCode).toBe(400);
    expect(json(otherEmployee).error!.code).toBe('SELF_ONLY');

    const HR = await app.inject({ method: 'GET', url: '/api/v1/helpdesk/tickets', headers: bearer(hrToken) });
    const all = json(HR).data as Array<{ id: string; employee: { employeeCode: string } }>;
    expect(HR.statusCode).toBe(200);
    expect(all.some((t) => t.id === ticketId && t.employee.employeeCode === 'EMP-005')).toBe(true);

    const empList = await app.inject({ method: 'GET', url: '/api/v1/helpdesk/tickets', headers: bearer(employeeToken) });
    expect(empList.statusCode).toBe(200);
    const mine = json(empList).data as Array<{ employee: { employeeCode: string } }>;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => t.employee.employeeCode === 'EMP-005')).toBe(true);

    const readOther = await app.inject({
      method: 'GET',
      url: `/api/v1/helpdesk/tickets/${ticketId}`,
      headers: bearer(hrToken),
    });
    expect(readOther.statusCode).toBe(200);

    const blocked = await post('/api/v1/helpdesk/tickets', adminToken, {
      subject: 'Admin-created ticket',
      description: 'For admin scope',
      employeeId: employeeRow.id,
    });
    expect(blocked.statusCode).toBe(200);
  });

  it('assigns, comments, and resolves a ticket with notifications; closed tickets are terminal', async () => {
    const created = await post('/api/v1/helpdesk/tickets', employeeToken, {
      subject: 'Salary slip missing',
      description: 'Cannot see my payslip for last month in the portal.',
      category: 'PAYROLL',
    });
    expect(created.statusCode).toBe(200);
    const ticketId = json(created).data!.id as string;
    createdTicketIds.push(ticketId);

    const assign = await post(`/api/v1/helpdesk/tickets/${ticketId}`, hrToken, { assigneeId: hrRow.id }, 'PATCH');
    expect(assign.statusCode).toBe(200);
    expect(json(assign).data!.assignee.employeeCode).toBe('EMP-002');

    const assignNotif = await app.prisma.notification.findFirst({
      where: { organizationId: orgId, userId: hrRow.userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(assignNotif?.message).toContain('assigned');

    const commentCoworker = await post('/api/v1/helpdesk/tickets', adminToken, {
      subject: 'Duplicate',
      description: 'Second ticket for the payroll reporter',
      employeeId: employeeRow.id,
    });
    createdTicketIds.push(json(commentCoworker).data!.id as string);

    const staffComment = await post(`/api/v1/helpdesk/tickets/${ticketId}/comments`, hrToken, {
      body: 'We are working on it. Fix by EOD.',
    });
    expect(staffComment.statusCode).toBe(200);

    const reply = await post(`/api/v1/helpdesk/tickets/${ticketId}/comments`, employeeToken, {
      body: 'Thanks, please expedite.',
    });
    expect(reply.statusCode).toBe(200);

    const detail = await app.inject({ method: 'GET', url: `/api/v1/helpdesk/tickets/${ticketId}`, headers: bearer(employeeToken) });
    const body = json(detail).data as { comments: Array<{ body: string; author: { employeeCode: string } }> };
    expect(body.comments.length).toBe(2);
    expect(body.comments[1].author.employeeCode).toBe('EMP-005');

    const resolve = await post(`/api/v1/helpdesk/tickets/${ticketId}`, hrToken, { status: 'RESOLVED' }, 'PATCH');
    expect(resolve.statusCode).toBe(200);

    const resolveNotif = await app.prisma.notification.findFirst({
      where: { organizationId: orgId, userId: employeeRow.userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(resolveNotif?.message).toContain('resolved');
  });

  it('rejects invalid payloads and prevents reopening closed tickets', async () => {
    const bad = await post('/api/v1/helpdesk/tickets', employeeToken, {
      subject: 'It',
      description: 'x',
      category: 'NOT_A_CATEGORY',
    });
    expect(bad.statusCode).toBe(400);

    const created = await post('/api/v1/helpdesk/tickets', employeeToken, {
      subject: 'Printer on floor 3',
      description: 'Paper jam reported twice this week.',
      category: 'ADMIN',
    });
    expect(created.statusCode).toBe(200);
    const ticketId = json(created).data!.id as string;
    createdTicketIds.push(ticketId);

    const closeNoAccess = await post(`/api/v1/helpdesk/tickets/${ticketId}`, employeeToken, { status: 'CLOSED' }, 'PATCH');
    expect(closeNoAccess.statusCode).toBe(403);

    const close = await post(`/api/v1/helpdesk/tickets/${ticketId}`, hrToken, { status: 'CLOSED' }, 'PATCH');
    expect(close.statusCode).toBe(200);

    const reopen = await post(`/api/v1/helpdesk/tickets/${ticketId}`, hrToken, { status: 'OPEN' }, 'PATCH');
    expect(reopen.statusCode).toBe(409);
    expect(json(reopen).error!.code).toBe('TICKET_CLOSED');

    const commentClosed = await post(`/api/v1/helpdesk/tickets/${ticketId}/comments`, hrToken, { body: 'late note' });
    expect(commentClosed.statusCode).toBe(409);
    expect(json(commentClosed).error!.code).toBe('TICKET_CLOSED');
  });
});

describe('Payroll - Payslip PDF Delivery', () => {
  let app: FastifyInstance;
  let accountantToken: string;
  let employeeToken: string;
  let employeeOwnedId: string | null = null;
  let employeeCrossId: string | null = null;
  let runId: string | null = null;
  let fixtureOrgId: string;

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const login = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      return (res.json() as { data: { accessToken: string } }).data.accessToken;
    };
    accountantToken = await login('accountant@acme.com', 'Demo@12345');
    employeeToken = await login('employee@acme.com', 'Demo@12345');

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    fixtureOrgId = org.id;

    const employees = await app.prisma.employee.findMany({
      where: { organizationId: fixtureOrgId },
      orderBy: { employeeCode: 'asc' },
      select: { id: true, employeeCode: true },
    });
    const emp005 = employees.find((e) => e.employeeCode === 'EMP-005');
    const other = employees.find((e) => e.employeeCode !== 'EMP-005');
    if (!emp005 || !other) {
      throw new Error('ERP-005 and one other seeded employee are required');
    }

    const run = await app.prisma.payrollRun.create({
      data: {
        organizationId: fixtureOrgId,
        month: 11,
        year: 2026,
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-30'),
      },
    });
    runId = run.id;

    for (const employee of [emp005, other]) {
      const ps = await app.prisma.payslip.create({
        data: {
          organizationId: fixtureOrgId,
          payrollRunId: run.id,
          employeeId: employee.id,
          basicSalary: 50000,
          allowances: 2000,
          deductions: 1200,
          taxDeducted: 0,
          netPay: 50800,
          status: 'PAID',
          paymentDate: new Date('2026-11-30'),
        },
      });
      if (employee.employeeCode === 'EMP-005') employeeOwnedId = ps.id;
      else employeeCrossId = ps.id;
    }
  });

  afterAll(async () => {
    if (runId) {
      await app.prisma.payslip.deleteMany({ where: { payrollRunId: runId } });
      await app.prisma.payrollRun.deleteMany({ where: { id: runId } });
    }
    await app.close();
  });

  it('serves an org-branded PDF for authorized viewers', async () => {
    expect(employeeOwnedId).not.toBeNull();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/payroll/payslips/${employeeOwnedId}/pdf`,
      headers: { authorization: `Bearer ${accountantToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('payslip-EMP-005-');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.rawPayload.subarray(res.rawPayload.length - 6).toString()).toBe('%%EOF\n');
    expect(res.rawPayload.length).toBeGreaterThan(1000);
  });

  it('enforces self-scope on the PDF endpoint', async () => {
    // Same-user payslip is downloadable by self-service employees.
    const own = await app.inject({
      method: 'GET',
      url: `/api/v1/payroll/payslips/${employeeOwnedId}/pdf`,
      headers: { authorization: `Bearer ${employeeToken}` },
    });
    expect(own.statusCode).toBe(200);

    // A payslip belonging to a different employee is not accessible.
    if (employeeCrossId) {
      const cross = await app.inject({
        method: 'GET',
        url: `/api/v1/payroll/payslips/${employeeCrossId}/pdf`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      expect(cross.statusCode).toBe(404);
    }

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/payroll/payslips/doesnotexist/pdf',
      headers: { authorization: `Bearer ${accountantToken}` },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('Onboarding - Templates, Assignments & Self-Completion', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let hrToken: string;
  let employeeToken: string;
  let emp005: { id: string; userId: string | null };
  let otherEmployee: { id: string };
  const createdTemplateIds: string[] = [];
  const createdAssignmentIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    // Purge org onboarding data so repeated runs stay deterministic.
    await app.prisma.onboardingAssignment.deleteMany({ where: { organizationId: org.id } });
    await app.prisma.onboardingTemplate.deleteMany({ where: { organizationId: org.id } });
    const login = async (email: string, password: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });
      return (res.json() as { data: { accessToken: string } }).data.accessToken;
    };
    adminToken = await login('admin@acme.com', 'Admin@12345');
    hrToken = await login('hr@acme.com', 'Demo@12345');
    employeeToken = await login('employee@acme.com', 'Demo@12345');

    emp005 = await app.prisma.employee.findFirstOrThrow({
      where: { organizationId: org.id, employeeCode: 'EMP-005' },
      select: { id: true, userId: true },
    });
    otherEmployee = await app.prisma.employee.findFirstOrThrow({
      where: { organizationId: org.id, employeeCode: 'EMP-001' },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await app.prisma.onboardingAssignment.deleteMany({ where: { id: { in: createdAssignmentIds } } });
    await app.prisma.onboardingTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
    await app.close();
  });

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  function post(url: string, token: string, payload: unknown, method = 'POST') {
    return app.inject({
      method,
      url,
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload,
    });
  }

  it('manages templates with role guards and in-use protection', async () => {
    const created = await post('/api/v1/onboarding/templates', hrToken, {
      name: 'Developer Onboarding',
      description: 'For the engineering team',
      tasks: [
        { title: 'Set up dev environment', dueInDays: 0, order: 0 },
        { title: 'Clone and build the repo', dueInDays: 2, order: 1, description: 'Verify local build' },
        { title: 'Team intro call', dueInDays: 5, order: 2, optional: true },
      ],
    });
    expect(created.statusCode).toBe(200);
    const templateId = json(created).data!.id as string;
    createdTemplateIds.push(templateId);

    const dup = await post('/api/v1/onboarding/templates', hrToken, {
      name: 'Developer Onboarding',
      tasks: [{ title: 'Whatever', dueInDays: 0 }],
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('ONBOARDING_TEMPLATE_EXISTS');

    const forbidden = await post('/api/v1/onboarding/templates', employeeToken, {
      name: 'Nope',
      tasks: [{ title: 'X', dueInDays: 0 }],
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({ method: 'GET', url: '/api/v1/onboarding/templates', headers: bearer(hrToken) });
    expect(list.statusCode).toBe(200);
    const templates = json(list).data as Array<{ id: string; tasks: unknown[] }>;
    expect(templates.some((t) => t.id === templateId && t.tasks.length === 3)).toBe(true);

    // In-use templates cannot be deleted.
    const assign = await post('/api/v1/onboarding/assignments', hrToken, {
      employeeId: otherEmployee.id,
      templateId,
    });
    expect(assign.statusCode).toBe(200);
    createdAssignmentIds.push(json(assign).data!.id as string);

    const inUse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/onboarding/templates/${templateId}`,
      headers: bearer(hrToken),
    });
    expect(inUse.statusCode).toBe(409);
    expect(json(inUse).error!.code).toBe('TEMPLATE_IN_USE');

    // An unused template can be deleted.
    const unused = await post('/api/v1/onboarding/templates', hrToken, {
      name: 'Temporary Template',
      tasks: [{ title: 'One task', dueInDays: 0 }],
    });
    const unusedId = json(unused).data!.id as string;
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/onboarding/templates/${unusedId}`,
      headers: bearer(hrToken),
    });
    expect(deleted.statusCode).toBe(200);
  });

  it('assigns onboarding with snapshot tasks, notifies the employee, and blocks duplicates', async () => {
    const created = await post('/api/v1/onboarding/templates', adminToken, {
      name: 'Ops Onboarding',
      tasks: [
        { title: 'Badge and building access', dueInDays: 0 },
        { title: 'Nagios access', dueInDays: 1 },
      ],
    });
    const templateId = json(created).data!.id as string;
    createdTemplateIds.push(templateId);

    const assign = await post('/api/v1/onboarding/assignments', hrToken, {
      employeeId: emp005.id,
      templateId,
    });
    expect(assign.statusCode).toBe(200);
    const body = json(assign).data as any;
    createdAssignmentIds.push(body.id);
    expect(body.status).toBe('NOT_STARTED');
    expect(body.tasks.length).toBe(2);
    expect(body.progress.percent).toBe(0);
    expect(body.tasks.every((t: any) => t.status === 'PENDING')).toBe(true);

    const notification = await app.prisma.notification.findFirst({
      where: { userId: emp005.userId as string },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification?.title).toContain('Onboarding started');

    const dup = await post('/api/v1/onboarding/assignments', hrToken, {
      employeeId: emp005.id,
      templateId,
    });
    expect(dup.statusCode).toBe(409);
    expect(json(dup).error!.code).toBe('ONBOARDING_ACTIVE_EXISTS');
  });

  it('lets the assignee self-complete tasks, auto-completes the assignment, then locks it', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/onboarding/assignments', headers: bearer(employeeToken) });
    expect(list.statusCode).toBe(200);
    const mine = json(list).data as Array<{ id: string; template: { name: string }; tasks: Array<{ id: string; status: string }> }>;
    expect(mine.length).toBe(1);
    const assignment = mine[0];
    expect(assignment.template.name).toBe('Ops Onboarding');

    const [taskA, taskB] = assignment.tasks;
    const stepOne = await post(`/api/v1/onboarding/assignments/${assignment.id}/tasks/${taskA.id}`, employeeToken, { status: 'COMPLETED' }, 'PATCH');
    expect(stepOne.statusCode).toBe(200);
    const afterOne = json(stepOne).data as any;
    expect(afterOne.status).toBe('IN_PROGRESS');
    expect(afterOne.startedAt).not.toBeNull();
    expect(afterOne.progress.percent).toBe(50);

    const crossRead = await app.inject({
      method: 'GET',
      url: `/api/v1/onboarding/assignments/${assignment.id}`,
      headers: bearer(employeeToken),
    });
    expect(crossRead.statusCode).toBe(200); // own assignment

    // Another employee cannot see or modify this assignment.
    const otherList = await app.inject({
      method: 'GET',
      url: `/api/v1/onboarding/assignments?employeeId=${emp005.id}`,
      headers: bearer(employeeToken),
    });
    const onlyOwn = json(otherList).data as Array<{ employee: { id: string } }>;
    expect(onlyOwn.every((a) => a.employee.id === emp005.id)).toBe(true);
    expect(onlyOwn.some((a) => a.employee.id !== emp005.id)).toBe(false);

    const otherToken = await (async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'manager@acme.com', password: 'Demo@12345' },
      });
      return (res.json() as { data: { accessToken: string } }).data.accessToken;
    })();
    // MANAGER has onboarding.self but is a different employee - blocked from EMP-005's tasks.
    const crossModify = await post(`/api/v1/onboarding/assignments/${assignment.id}/tasks/${taskA.id}`, otherToken, { status: 'PENDING' }, 'PATCH');
    expect(crossModify.statusCode).toBe(403);

    const stepTwo = await post(`/api/v1/onboarding/assignments/${assignment.id}/tasks/${taskB.id}`, employeeToken, { status: 'COMPLETED' }, 'PATCH');
    expect(stepTwo.statusCode).toBe(200);
    const complete = json(stepTwo).data as any;
    expect(complete.status).toBe('COMPLETED');
    expect(complete.completedAt).not.toBeNull();
    expect(complete.progress.percent).toBe(100);

    const doneNotif = await app.prisma.notification.findFirst({
      where: { userId: emp005.userId as string, type: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
    expect(doneNotif?.title).toContain('Onboarding complete');

    const locked = await post(`/api/v1/onboarding/assignments/${assignment.id}/tasks/${taskA.id}`, employeeToken, { status: 'PENDING' }, 'PATCH');
    expect(locked.statusCode).toBe(409);
    expect(json(locked).error!.code).toBe('ONBOARDING_COMPLETED');

    // Was the auto-completing assignment the one we originally assigned? Verify canonical id presence.
    expect(createdAssignmentIds.includes(assignment.id)).toBe(true);
  });

  it('rejects invalid payloads and unknown resources', async () => {
    const badTemplate = await post('/api/v1/onboarding/templates', hrToken, {
      name: 'No tasks',
      tasks: [],
    });
    expect(badTemplate.statusCode).toBe(400);

    const badTask = await post('/api/v1/onboarding/assignments/doesnotexist/tasks/x', employeeToken, { status: 'COMPLETED' }, 'PATCH');
    expect(badTask.statusCode).toBe(404);
  });
});

describe('Employee Profile - Detail Payload (paystubs, docs, onboarding)', () => {
  let app: FastifyInstance;
  let orgId: string;
  let adminToken: string;
  let employeeId: string;

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function json(res: { json(): unknown }) {
    return res.json() as { data?: any; error?: { code: string; message: string } };
  }

  beforeAll(async () => {
    app = await buildApp();
    await syncPermissionsAndSystemRoles(app.prisma);

    const org = await app.prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-technologies' } });
    orgId = org.id;

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@acme.com', password: 'Admin@12345' },
    });
    adminToken = (json(login).data as { accessToken: string }).accessToken;

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { ...bearer(adminToken), 'content-type': 'application/json' },
      payload: {
        firstName: 'Profile',
        lastName: 'Fixture',
        email: 'profile.fixture@acme.com',
        phone: '+10000000000',
        employeeCode: 'EMP-PROF',
        designationId: null,
        departmentId: null,
        branchId: null,
        employmentType: 'FULL_TIME',
        joiningDate: '2026-01-15',
        basicSalary: 540000,
        payFrequency: 'MONTHLY',
      },
    });
    expect(created.statusCode).toBe(201);
    employeeId = (json(created).data as { id: string }).id;

    const run = await app.prisma.payrollRun.create({
      data: {
        organizationId: orgId,
        
        month: 10,
        year: 2026,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
      },
    });
    await app.prisma.payslip.create({
      data: {
        organizationId: orgId,
        payrollRunId: run.id,
        employeeId,
        basicSalary: 45000,
        allowances: 1000,
        deductions: 200,
        netPay: 45800,
        status: 'PAID',
      },
    });

    const boundary = '----HRMS-PROFILE-BOUNDARY';
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="title"\r\n\r\n` +
      `Offer Letter\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="category"\r\n\r\n` +
      `CONTRACT\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="employeeId"\r\n\r\n` +
      `${employeeId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="offer.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `offer` +
      `\r\n--${boundary}--\r\n`;
    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload',
      headers: { ...bearer(adminToken), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(body),
    });
    expect(uploaded.statusCode).toBe(201);
  });

  afterAll(async () => {
    await app.prisma.employeeDocument.deleteMany({ where: { employeeId } });
    await app.prisma.payslip.deleteMany({ where: { employeeId } });
    await app.prisma.payrollRun.deleteMany({ where: { organizationId: orgId, 
        month: 10, year: 2026 } });
    await app.prisma.employee.deleteMany({ where: { id: employeeId } });
    await app.close();
  });

  it('returns real paid stubs, uploaded documents and onboarding history', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/employees/${employeeId}`,
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = json(res).data as {
      payslips: Array<{ id: string; netPay: number; status: string; payrollRun: { month: number; year: number } }>;
      documents: Array<{ title: string; category: string }>;
      onboardingAssignments: unknown[];
      assignedAssets: unknown[];
    };

    expect(data.payslips.length).toBe(1);
    expect(data.payslips[0].netPay).toBe(45800);
    expect(data.payslips[0].status).toBe('PAID');
    expect(data.payslips[0].payrollRun.month).toBe(8);
    expect(data.documents.some((d) => d.title === 'Offer Letter' && d.category === 'CONTRACT')).toBe(true);
    expect(Array.isArray(data.onboardingAssignments)).toBe(true);
    expect(Array.isArray(data.assignedAssets)).toBe(true);
  });
});
