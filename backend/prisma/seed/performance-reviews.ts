import type { SeedContext } from './context';

const REVIEW_TEMPLATES = [
  {
    selfRating: 4.5,
    selfFeedback: 'Met all major objectives this quarter and supported the team through the Q3 release.',
    managerRating: 4,
    managerFeedback: 'Delivered consistently with strong technical ownership and cross-team collaboration.',
    status: 'APPROVED',
  },
  {
    selfRating: 4,
    selfFeedback: 'Completed planned goals; would like more ownership of complex initiatives next quarter.',
    managerRating: 3.5,
    managerFeedback: 'Good progress overall. Continue pushing for clarity in ambiguous requirements.',
    status: 'DRAFT',
  },
  {
    selfRating: 3.5,
    selfFeedback: 'Shipped several fixes and improved test coverage across the module.',
    managerRating: 4,
    managerFeedback: 'Reliable and detail oriented; keep up the quality focus.',
    status: 'SUBMITTED',
  },
  {
    selfRating: 5,
    selfFeedback: 'Led the rollout and mentoring of two junior engineers.',
    managerRating: 4.5,
    managerFeedback: 'Outstanding quarter. Strong mentorship and delivery.',
    status: 'APPROVED',
  },
];

export async function seedPerformanceReviews(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;
  const cycle = await prisma.performanceCycle.findFirst({
    where: { organizationId: orgId, status: 'ACTIVE' },
  });
  if (!cycle) {
    console.warn('[seed] Skipping performance reviews: no active cycle found');
    return;
  }

  let created = 0;
  for (let i = 0; i < REVIEW_TEMPLATES.length; i++) {
    const emp = employees[4 + i];
    if (!emp) continue;
    const t = REVIEW_TEMPLATES[i];

    const existing = await prisma.performanceReview.findFirst({
      where: { organizationId: orgId, cycleId: cycle.id, employeeId: emp.id },
    });
    if (existing) continue;

    await prisma.performanceReview.create({
      data: {
        organizationId: orgId,
        cycleId: cycle.id,
        employeeId: emp.id,
        reviewerId: employees[0]?.id,
        selfRating: t.selfRating,
        selfFeedback: t.selfFeedback,
        managerRating: t.managerRating,
        managerFeedback: t.managerFeedback,
        finalRating: t.managerRating,
        status: t.status,
      },
    });
    created++;
  }

  console.log(`[seed] Created ${created} performance reviews`);
}