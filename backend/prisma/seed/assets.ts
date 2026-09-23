import { AssetStatus } from '@prisma/client';
import type { SeedContext } from './context';

const ASSETS: {
  name: string;
  tag: string;
  category: string;
  serial: string;
  status: AssetStatus;
}[] = [
  { name: 'MacBook Pro 16" M3 Max', tag: 'AST-LAP-001', category: 'LAPTOP', serial: 'C02G1234MD6R', status: AssetStatus.ASSIGNED },
  { name: 'Dell UltraSharp 32" 4K Monitor', tag: 'AST-MON-002', category: 'MONITOR', serial: 'CN-098765', status: AssetStatus.AVAILABLE },
  { name: 'iPhone 15 Pro Enterprise', tag: 'AST-PHN-003', category: 'PHONE', serial: 'FK12345678', status: AssetStatus.ASSIGNED },
  { name: 'HP EliteBook 840', tag: 'AST-LAP-004', category: 'LAPTOP', serial: 'X0K8F1G2H3', status: AssetStatus.UNDER_MAINTENANCE },
  { name: 'Corporate Kia EV6', tag: 'AST-CAR-005', category: 'OTHER', serial: 'VIN-KEV6-2026', status: AssetStatus.AVAILABLE },
];

export async function seedAssets(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  for (const a of ASSETS) {
    await prisma.asset.upsert({
      where: { organizationId_assetTag: { organizationId: orgId, assetTag: a.tag } },
      create: {
        organizationId: orgId,
        name: a.name,
        assetTag: a.tag,
        category: a.category,
        serialNumber: a.serial,
        status: a.status,
        assignedToId:
          a.status === AssetStatus.ASSIGNED
            ? employees[4]?.id
            : a.tag === 'AST-PHN-003'
              ? employees[6]?.id
              : null,
        assignedAt: a.status === AssetStatus.ASSIGNED ? new Date('2023-02-01') : null,
      },
      update: {
        name: a.name,
        status: a.status,
        assignedToId:
          a.status === AssetStatus.ASSIGNED
            ? employees[4]?.id
            : a.tag === 'AST-PHN-003'
              ? employees[6]?.id
              : null,
        assignedAt: a.status === AssetStatus.ASSIGNED ? new Date('2023-02-01') : null,
      },
    });
  }
}