import { EmploymentType, EmployeeStatus } from '@prisma/client';
import { hashPassword } from '../../src/utils/password';
import type { SeedContext, SeedEmployee } from './context';

const DEMO_ACCOUNTS = [
  { email: 'admin@acme.com', role: 'ORG_ADMIN', firstName: 'Priya', lastName: 'Sharma', title: 'HR Director', code: 'EMP-001', dept: 'HR', desig: 'HR_DIR', branch: 'SFO', salary: 145000, join: '2021-03-01', dob: new Date(1984, 4, 12), gender: 'Female', maritalStatus: 'Married' },
  { email: 'hr@acme.com', role: 'HR_MANAGER', firstName: 'Rahul', lastName: 'Verma', title: 'HR Manager', code: 'EMP-002', dept: 'HR', desig: 'HR_MGR', branch: 'NYC', salary: 98000, join: '2021-08-10', dob: new Date(1987, 10, 3), gender: 'Male', maritalStatus: 'Married' },
  { email: 'accountant@acme.com', role: 'ACCOUNTANT', firstName: 'Anita', lastName: 'Mehra', title: 'Payroll Manager', code: 'EMP-003', dept: 'FIN', desig: 'PAY_MGR', branch: 'SFO', salary: 92000, join: '2022-01-17', dob: new Date(1989, 1, 25), gender: 'Female', maritalStatus: 'Single' },
  { email: 'manager@acme.com', role: 'MANAGER', firstName: 'Vikram', lastName: 'Rao', title: 'Engineering Manager', code: 'EMP-004', dept: 'ENG', desig: 'ENG_MGR', branch: 'SFO', salary: 135000, join: '2020-06-01', dob: new Date(1983, 8, 9), gender: 'Male', maritalStatus: 'Married' },
  { email: 'employee@acme.com', role: 'EMPLOYEE', firstName: 'Sneha', lastName: 'Iyer', title: 'Senior Software Engineer', code: 'EMP-005', dept: 'ENG', desig: 'SR_ENG', branch: 'SFO', salary: 115000, join: '2022-04-04', dob: new Date(1991, 6, 17), gender: 'Female', maritalStatus: 'Single' },
  { email: 'employee2@acme.com', role: 'EMPLOYEE', firstName: 'Arjun', lastName: 'Nair', title: 'Software Engineer', code: 'EMP-006', dept: 'ENG', desig: 'SW_ENG', branch: 'BLR', salary: 85000, join: '2023-02-13', dob: new Date(1994, 9, 28), gender: 'Male', maritalStatus: 'Single' },
];

const FIRST_NAMES = ['Alexander', 'Sophia', 'Benjamin', 'Emma', 'Daniel', 'Olivia', 'Ethan', 'Ava', 'Matthew', 'Isabella', 'Lucas', 'Mia', 'Jackson', 'Charlotte', 'Aiden', 'Harper', 'David', 'Evelyn', 'Joseph', 'Abigail', 'James', 'Emily', 'Logan', 'Elizabeth', 'Jayden', 'Camila', 'Gabriel', 'Ella', 'Noah', 'Scarlett', 'Michael', 'Victoria', 'William', 'Grace', 'Oliver', 'Chloe', 'Henry', 'Penelope', 'Sebastian', 'Layla', 'Jack', 'Riley', 'Samuel', 'Zoey', 'Ryan', 'Nora', 'John', 'Lily', 'Luke', 'Eleanor'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'];
const DEPT_CODES = ['ENG', 'HR', 'FIN', 'SALES', 'PROD', 'OPS'];
const BRANCH_CODES = ['SFO', 'NYC', 'LON', 'BLR'];
const DESIG_CODES = ['SR_ENG', 'SW_ENG', 'QA_ENG', 'ACC_EXEC', 'SR_ACCT', 'SR_PM', 'UX_LEAD', 'HR_SPEC', 'OPS_MGR'];
const GENDERS = ['Male', 'Female'];
const MARITAL_STATUSES = ['Single', 'Married'];
const LOCATIONS: Record<string, { city: string; state: string }> = {
  SFO: { city: 'San Francisco', state: 'CA' },
  NYC: { city: 'New York', state: 'NY' },
  LON: { city: 'London', state: 'England' },
  BLR: { city: 'Bangalore', state: 'Karnataka' },
};
const BANK_NAMES = ['Chase Bank', 'Bank of America', 'Wells Fargo', 'HSBC', 'HDFC Bank'];
const PAY_BANKS = ['Silicon Valley Bank', 'Chase Bank', 'Wells Fargo'];

function personalFields(seedValue: number, branchCode: string, lastName: string) {
  const loc = LOCATIONS[branchCode] ?? LOCATIONS.SFO;
  return {
    dateOfBirth: new Date(1978 + (seedValue % 22), (seedValue * 5) % 12, (seedValue * 7) % 27 + 1),
    gender: GENDERS[seedValue % GENDERS.length],
    maritalStatus: MARITAL_STATUSES[seedValue % MARITAL_STATUSES.length],
    address: `${120 + ((seedValue * 37) % 800)} ${loc.city} Avenue, Suite ${(seedValue % 9) + 1}, ${loc.city}, ${loc.state}`,
    emergencyContactName: `Mrs. ${lastName}`,
    emergencyContactPhone: `+1-555-9${(seedValue * 13) % 1000}${(seedValue * 31) % 1000}`,
  };
}

export async function seedEmployees(ctx: SeedContext): Promise<SeedContext> {
  const { prisma, orgId } = ctx;
  const today = new Date();
  const employees: SeedEmployee[] = [];
  const defaultPasswordHash = await hashPassword('Demo@12345');

  for (const [idx, da] of DEMO_ACCOUNTS.entries()) {
    let user = await prisma.user.findUnique({ where: { email: da.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: da.email,
          firstName: da.firstName,
          lastName: da.lastName,
          passwordHash: defaultPasswordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          title: da.title,
          userRoles: ctx.rolesByCode[da.role] ? { create: { roleId: ctx.rolesByCode[da.role] } } : undefined,
        },
      });
    }

    const personal = personalFields(idx + 1, da.branch, da.lastName);
    const emp = await prisma.employee.upsert({
      where: { organizationId_employeeCode: { organizationId: orgId, employeeCode: da.code } },
      create: {
        organizationId: orgId,
        userId: user.id,
        employeeCode: da.code,
        firstName: da.firstName,
        lastName: da.lastName,
        email: da.email,
        phone: `+1-555-01${23 + idx * 9}`,
        dateOfBirth: da.dob,
        gender: da.gender,
        maritalStatus: da.maritalStatus,
        address: personal.address,
        emergencyContactName: personal.emergencyContactName,
        emergencyContactPhone: personal.emergencyContactPhone,
        joiningDate: new Date(da.join),
        employmentType: EmploymentType.FULL_TIME,
        status: EmployeeStatus.ACTIVE,
        departmentId: ctx.departments[da.dept],
        designationId: ctx.designations[da.desig],
        branchId: ctx.branches[da.branch],
        basicSalary: da.salary,
        bankName: PAY_BANKS[idx % PAY_BANKS.length],
        accountNumber: `ACCT-${100000 + 1000 * idx * 7 + idx * 321}`,
        taxId: `TAX-${200000000 + idx * 55123}`,
      },
      update: {},
    });
    employees.push({ id: emp.id, employeeCode: emp.employeeCode, basicSalary: emp.basicSalary });
  }

  const managerEmp = employees.find((e) => e.employeeCode === 'EMP-004') || employees[0];

  for (let i = 7; i <= 55; i++) {
    const fn = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(i - 1) % LAST_NAMES.length];
    const code = `EMP-${String(i).padStart(3, '0')}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}@acme.com`;
    const deptCode = DEPT_CODES[i % DEPT_CODES.length];
    const branchCode = BRANCH_CODES[i % BRANCH_CODES.length];
    const desigCode = DESIG_CODES[i % DESIG_CODES.length];
    const salary = 65000 + (i % 10) * 8000;
    const joinMonthOffset = (i * 7) % 16;
    const joiningDate = new Date(today.getFullYear(), today.getMonth() - joinMonthOffset, 1 + ((i * 3) % 27));
    const employmentType =
      i % 8 === 0 ? EmploymentType.CONTRACT : i % 11 === 0 ? EmploymentType.PART_TIME : EmploymentType.FULL_TIME;
    const status =
      i % 15 === 0
        ? EmployeeStatus.ON_LEAVE
        : i % 13 === 0
          ? EmployeeStatus.TERMINATED
          : i % 17 === 0
            ? EmployeeStatus.RESIGNED
            : EmployeeStatus.ACTIVE;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          organizationId: orgId,
          email,
          firstName: fn,
          lastName: ln,
          passwordHash: defaultPasswordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          title: desigCode.replace('_', ' '),
          userRoles: ctx.rolesByCode.EMPLOYEE ? { create: { roleId: ctx.rolesByCode.EMPLOYEE } } : undefined,
        },
      });
    }

    const personal = personalFields(i, branchCode, ln);
    const emp = await prisma.employee.upsert({
      where: { organizationId_employeeCode: { organizationId: orgId, employeeCode: code } },
      create: {
        organizationId: orgId,
        userId: user.id,
        employeeCode: code,
        firstName: fn,
        lastName: ln,
        email,
        phone: `+1-555-0${100 + ((i * 37) % 899)}`,
        dateOfBirth: personal.dateOfBirth,
        gender: personal.gender,
        maritalStatus: personal.maritalStatus,
        address: personal.address,
        emergencyContactName: personal.emergencyContactName,
        emergencyContactPhone: personal.emergencyContactPhone,
        joiningDate,
        employmentType,
        status,
        departmentId: ctx.departments[deptCode],
        designationId: ctx.designations[desigCode],
        branchId: ctx.branches[branchCode],
        managerId: i % 13 === 0 || i % 17 === 0 ? undefined : managerEmp.id,
        basicSalary: salary,
        bankName: BANK_NAMES[i % BANK_NAMES.length],
        accountNumber: `ACCT-${100000 + ((i * 7919) % 899999)}`,
        taxId: `TAX-${100000000 + ((i * 2654435761) % 899999999)}`,
      },
      update: {
        joiningDate,
        employmentType,
        status,
        departmentId: ctx.departments[deptCode],
        branchId: ctx.branches[branchCode],
      },
    });
    employees.push({ id: emp.id, employeeCode: emp.employeeCode, basicSalary: emp.basicSalary });
  }

  console.log(`[seed] Created ${employees.length} realistic employees`);

  return { ...ctx, employees };
}