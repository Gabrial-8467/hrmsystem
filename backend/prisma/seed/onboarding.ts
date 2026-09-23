import type { Prisma } from '@prisma/client';
import type { SeedContext } from './context';

const DEFAULT_TEMPLATE = {
  name: 'Standard Onboarding',
  description: 'Default onboarding workflow for new joiners.',
  tasks: [
    { title: 'Laptop and access provisioning', description: 'Issue hardware and grant system access accounts.', dueInDays: 0, optional: false },
    { title: 'Company email and Slack accounts', description: 'Create email and communication accounts.', dueInDays: 1, optional: false },
    { title: 'Submit personal documents', description: 'Collect tax, ID, and bank account documents.', dueInDays: 3, optional: false },
    { title: 'HR induction session', description: 'Company policies, code of conduct, and benefits walkthrough.', dueInDays: 5, optional: false },
    { title: 'Buddy assignment', description: 'Assign a mentor for the first month.', dueInDays: 7, optional: true },
    { title: 'First week progress review', description: 'Manager check-in on ramp-up progress.', dueInDays: 10, optional: false },
  ],
};

export async function seedOnboarding(ctx: SeedContext): Promise<SeedContext> {
  const { prisma, orgId } = ctx;

  const template = await prisma.onboardingTemplate.upsert({
    where: { organizationId_name: { organizationId: orgId, name: DEFAULT_TEMPLATE.name } },
    create: {
      organizationId: orgId,
      name: DEFAULT_TEMPLATE.name,
      description: DEFAULT_TEMPLATE.description,
      isDefault: true,
    },
    update: {},
  });

  await prisma.onboardingTemplateTask.deleteMany({ where: { templateId: template.id } });
  await prisma.onboardingTemplateTask.createMany({
    data: DEFAULT_TEMPLATE.tasks.map((t, index) => ({
      templateId: template.id,
      title: t.title,
      description: t.description,
      dueInDays: t.dueInDays,
      optional: t.optional,
      order: index,
    })),
  });

  const existingAssignment = await prisma.onboardingAssignment.findFirst({ where: { organizationId: orgId } });
  if (!existingAssignment && ctx.employees.length > 0) {
    const target = ctx.employees[ctx.employees.length - 1];
    const templateTasks = await prisma.onboardingTemplateTask.findMany({
      where: { templateId: template.id },
      orderBy: { order: 'asc' },
    });
    const active = await prisma.onboardingAssignment.findFirst({
      where: { organizationId: orgId, employeeId: target.id },
    });
    if (!active) {
      await prisma.onboardingAssignment.create({
        data: {
          organizationId: orgId,
          employeeId: target.id,
          templateId: template.id,
          createdBy: 'seed',
          tasks: {
            create: templateTasks.map((t) => ({
              title: t.title,
              description: t.description,
              order: t.order,
              status: 'PENDING' as Prisma.OnboardingTaskStatus,
            })),
          },
        },
      });
    }
  }

  return ctx;
}