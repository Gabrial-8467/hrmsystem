import type { PrismaClient } from '@prisma/client';

export interface SeedEmployee {
  id: string;
  employeeCode: string;
  basicSalary: number;
}

export interface SeedContext {
  prisma: PrismaClient;
  orgId: string;
  departments: Record<string, string>;
  branches: Record<string, string>;
  designations: Record<string, string>;
  rolesByCode: Record<string, string>;
  employees: SeedEmployee[];
}