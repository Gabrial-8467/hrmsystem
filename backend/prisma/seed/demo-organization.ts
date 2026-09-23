import { provisionOrganization } from '../../src/services/provisioning';
import type { SeedContext } from './context';

export const DEMO_SLUG = 'acme-technologies';

const DEPARTMENTS = [
  { name: 'Engineering', code: 'ENG', description: 'Software Development & Architecture' },
  { name: 'Human Resources', code: 'HR', description: 'People Operations & Culture' },
  { name: 'Finance', code: 'FIN', description: 'Accounting, Budgeting & Payroll' },
  { name: 'Sales & Marketing', code: 'SALES', description: 'Revenue Generation & Growth' },
  { name: 'Product & Design', code: 'PROD', description: 'Product Management & User Experience' },
  { name: 'Operations', code: 'OPS', description: 'Facilities, Infrastructure & Support' },
];

const BRANCHES = [
  { name: 'San Francisco HQ', code: 'SFO', address: '525 Market Street, Suite 2200', city: 'San Francisco', state: 'CA', zipCode: '94105', country: 'USA', timezone: 'America/Los_Angeles' },
  { name: 'New York Hub', code: 'NYC', address: '1 Broadway, 30th Floor', city: 'New York', state: 'NY', zipCode: '10007', country: 'USA', timezone: 'America/New_York' },
  { name: 'London Office', code: 'LON', address: '30 St Mary Axe, Level 12', city: 'London', state: 'England', zipCode: 'EC3A 8BF', country: 'UK', timezone: 'Europe/London' },
  { name: 'Bangalore R&D Center', code: 'BLR', address: 'Embassy Tech Village, Outer Ring Road', city: 'Bangalore', state: 'Karnataka', zipCode: '560103', country: 'India', timezone: 'Asia/Kolkata' },
];

const DESIGNATIONS = [
  { title: 'VP of Engineering', code: 'VP_ENG', departmentCode: 'ENG', level: 5, description: 'Owns the engineering org, platform architecture and delivery.' },
  { title: 'Engineering Manager', code: 'ENG_MGR', departmentCode: 'ENG', level: 4, description: 'Leads a squad of engineers and drives technical delivery.' },
  { title: 'Senior Software Engineer', code: 'SR_ENG', departmentCode: 'ENG', level: 3, description: 'Builds complex systems and mentors junior engineers.' },
  { title: 'Software Engineer', code: 'SW_ENG', departmentCode: 'ENG', level: 2, description: 'Implements features across the product codebase.' },
  { title: 'QA Engineer', code: 'QA_ENG', departmentCode: 'ENG', level: 2, description: "Ensures quality through automated and manual testing." },
  { title: 'HR Director', code: 'HR_DIR', departmentCode: 'HR', level: 5, description: 'Leads people strategy, culture and talent programs.' },
  { title: 'HR Manager', code: 'HR_MGR', departmentCode: 'HR', level: 4, description: 'Runs HR operations, onboarding and employee relations.' },
  { title: 'Talent Specialist', code: 'HR_SPEC', departmentCode: 'HR', level: 2, description: 'Owns recruiting pipelines and employer branding.' },
  { title: 'Financial Controller', code: 'FIN_CTRL', departmentCode: 'FIN', level: 4, description: 'Oversees accounting, reporting and compliance.' },
  { title: 'Payroll Manager', code: 'PAY_MGR', departmentCode: 'FIN', level: 3, description: 'Manages payroll runs, taxes and statutory filings.' },
  { title: 'Senior Accountant', code: 'SR_ACCT', departmentCode: 'FIN', level: 2, description: 'Handles day-to-day accounting and reconciliations.' },
  { title: 'Director of Product', code: 'PROD_DIR', departmentCode: 'PROD', level: 5, description: 'Sets product vision, roadmap and strategy.' },
  { title: 'Senior Product Manager', code: 'SR_PM', departmentCode: 'PROD', level: 3, description: 'Owns discovery and delivery of key product areas.' },
  { title: 'Lead UX Designer', code: 'UX_LEAD', departmentCode: 'PROD', level: 3, description: 'Leads design systems and end-to-end user experience.' },
  { title: 'VP of Sales', code: 'VP_SALES', departmentCode: 'SALES', level: 5, description: 'Leads revenue, sales strategy and pipeline growth.' },
  { title: 'Account Executive', code: 'ACC_EXEC', departmentCode: 'SALES', level: 2, description: 'Closes enterprise deals and manages key accounts.' },
  { title: 'Operations Manager', code: 'OPS_MGR', departmentCode: 'OPS', level: 4, description: 'Runs facilities, infrastructure and vendor operations.' },
];

export async function seedOrgStructure(prisma: SeedContext['prisma']): Promise<SeedContext> {
  let org = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } });
  if (!org) {
    await provisionOrganization(prisma, {
      name: 'Acme Technologies',
      slug: DEMO_SLUG,
      adminEmail: 'admin@acme.com',
      adminFirstName: 'Priya',
      adminPassword: 'Admin@12345',
      plan: 'ENTERPRISE',
      timezone: 'America/New_York',
      currency: 'USD',
    });
    org = await prisma.organization.findUniqueOrThrow({ where: { slug: DEMO_SLUG } });
    console.log('[seed] Organization "Acme Technologies" provisioned (admin@acme.com / Admin@12345)');
  }
  const orgId = org.id;

  const departments: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { organizationId_code: { organizationId: orgId, code: d.code } },
      create: { organizationId: orgId, ...d },
      update: {},
    });
    departments[d.code] = dept.id;
  }

  const branches: Record<string, string> = {};
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId: orgId, code: b.code } },
      create: { organizationId: orgId, ...b },
      update: {},
    });
    branches[b.code] = branch.id;
  }

  const designations: Record<string, string> = {};
  for (const des of DESIGNATIONS) {
    const desig = await prisma.designation.upsert({
      where: { organizationId_code: { organizationId: orgId, code: des.code } },
      create: {
        organizationId: orgId,
        title: des.title,
        code: des.code,
        level: des.level,
        description: des.description,
        departmentId: departments[des.departmentCode],
      },
      update: {},
    });
    designations[des.code] = desig.id;
  }

  const rolesByCode: Record<string, string> = {};
  const dbRoles = await prisma.role.findMany({ where: { organizationId: orgId } });
  for (const r of dbRoles) {
    rolesByCode[r.code] = r.id;
  }

  return {
    prisma,
    orgId,
    departments,
    branches,
    designations,
    rolesByCode,
    employees: [],
  };
}