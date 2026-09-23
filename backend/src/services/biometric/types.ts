import type { BiometricDevice } from '@prisma/client';

/**
 * The slice of a BiometricDevice that the hardware pipeline needs, plus the
 * organization timezone used to interpret the terminal's naive wall clock.
 */
export interface BiometricDeviceRow {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  mode: 'FACE' | 'FINGERPRINT' | 'HYBRID';
  ipAddress: string | null;
  port: number;
  commKey: number;
  serialNumber: string | null;
  timeZone: string;
}

type DeviceWithOrg = BiometricDevice & { organization: { timezone: string } };

export function toDeviceRow(device: DeviceWithOrg): BiometricDeviceRow {
  return {
    id: device.id,
    organizationId: device.organizationId,
    name: device.name,
    code: device.code,
    mode: device.mode,
    ipAddress: device.ipAddress,
    port: device.port,
    commKey: device.commKey,
    serialNumber: device.serialNumber,
    timeZone: device.organization.timezone || 'UTC',
  };
}

export async function loadDeviceRow(
  prisma: {
    biometricDevice: {
      findFirst(args: unknown): Promise<DeviceWithOrg | null>;
    };
  },
  organizationId: string,
  deviceId: string,
): Promise<BiometricDeviceRow | null> {
  const device = await prisma.biometricDevice.findFirst({
    where: { id: deviceId, organizationId },
    include: { organization: { select: { timezone: true } } },
  });
  return device ? toDeviceRow(device) : null;
}