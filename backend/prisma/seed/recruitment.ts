import { EmploymentType, JobStatus, CandidateStatus, InterviewStatus } from '@prisma/client';
import type { SeedContext } from './context';

export async function seedRecruitment(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, departments } = ctx;

  const job = await prisma.jobOpening.upsert({
    where: { organizationId_code: { organizationId: orgId, code: 'JOB-SR-REACT' } },
    create: {
      organizationId: orgId,
      title: 'Senior React / Next.js Engineer',
      code: 'JOB-SR-REACT',
      departmentId: departments['ENG'],
      description: 'Looking for an experienced Frontend Architect proficient in React 19, Turbopack, and Next.js App Router.',
      requirements: '5+ years frontend engineering experience, TypeScript expert, Tailwind CSS, TanStack Query.',
      location: 'San Francisco, CA (Hybrid)',
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.OPEN,
      positionsCount: 2,
    },
    update: {},
  });

  const existingCandidate = await prisma.candidate.findFirst({
    where: { organizationId: orgId, email: 'david.chen@example.com' },
  });
  let cand = existingCandidate;
  if (!cand) {
    cand = await prisma.candidate.create({
      data: {
        organizationId: orgId,
        jobOpeningId: job.id,
        firstName: 'David',
        lastName: 'Chen',
        email: 'david.chen@example.com',
        phone: '+1-555-0199',
        status: CandidateStatus.INTERVIEW,
        rating: 4,
      },
    });
  }

  if (cand && !(await prisma.interview.findFirst({ where: { candidateId: cand.id } }))) {
    await prisma.interview.create({
      data: {
        organizationId: orgId,
        candidateId: cand.id,
        scheduledAt: new Date(Date.now() + 86400000 * 2),
        stage: 'Technical Deep Dive',
        status: InterviewStatus.SCHEDULED,
      },
    });
  }
}