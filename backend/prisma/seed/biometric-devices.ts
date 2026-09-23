import type { SeedContext } from './context';

const DEVICES = [
  {
    name: 'Main Lobby Terminal',
    code: 'DEV_LOBBY',
    mode: 'HYBRID',
    status: 'ONLINE',
    commKey: 0,
    serialNumber: 'ZK-2026-0001',
    ipAddress: '192.168.1.10',
    port: 4370,
    location: 'Ground Floor Lobby',
  },
  {
    name: 'HR Entrance Biometric',
    code: 'DEV_HRENT',
    mode: 'FINGERPRINT',
    status: 'ONLINE',
    commKey: 0,
    serialNumber: 'ZK-2026-0002',
    ipAddress: '192.168.1.11',
    port: 4370,
    location: 'HR Wing Entrance',
  },
  {
    name: 'Security Gate Face Reader',
    code: 'DEV_SECURITY',
    mode: 'FACE',
    status: 'OFFLINE',
    commKey: 0,
    serialNumber: 'ZK-2026-0003',
    ipAddress: '192.168.1.12',
    port: 4370,
    location: 'Main Security Gate',
  },
];

// Enroll a spread of employees onto the terminals. deviceUserId mirrors the
// ZK printed id, which in this demo equals the employee code.
const ENROLLMENTS: Record<string, string[]> = {
  DEV_LOBBY: ['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', 'EMP-005'],
  DEV_HRENT: ['EMP-001', 'EMP-002', 'EMP-006'],
  DEV_SECURITY: ['EMP-001', 'EMP-003', 'EMP-005'],
};

export async function seedBiometricDevices(ctx: SeedContext): Promise<void> {
  const { prisma, orgId, employees } = ctx;

  const devices = new Map<string, string>();
  for (const d of DEVICES) {
    const device = await prisma.biometricDevice.upsert({
      where: { organizationId_code: { organizationId: orgId, code: d.code } },
      create: { organizationId: orgId, ...d, lastSyncAt: new Date(), lastSyncStatus: 'OK' },
      update: { commKey: d.commKey },
    });
    devices.set(d.code, device.id);
  }

  let enrolled = 0;
  for (const [code, empCodes] of Object.entries(ENROLLMENTS)) {
    const deviceId = devices.get(code);
    if (!deviceId) continue;
    for (const empCode of empCodes) {
      const emp = employees.find((e) => e.employeeCode === empCode);
      if (!emp) continue;
      const exists = await prisma.employeeBiometric.findUnique({
        where: { employeeId_deviceId: { employeeId: emp.id, deviceId } },
      });
      if (exists) continue;
      await prisma.employeeBiometric.create({
        data: {
          organizationId: orgId,
          employeeId: emp.id,
          deviceId,
          deviceUserId: empCode,
          nameOnDevice: empCode,
          faceEnrolled: code === 'DEV_SECURITY' || code === 'DEV_LOBBY',
          fingerprints: code === 'DEV_HRENT' || code === 'DEV_LOBBY' ? 2 : 0,
        },
      });
      enrolled += 1;
    }
  }

  // A few fresh raw punch logs for the online devices today — evidence that
  // the terminal → punch-log → attendance pipeline is live.
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const punchSeeds: Array<{ empCode: string; deviceCode: string; minutesAgo: number; state: number; verify: number }> = [
    { empCode: 'EMP-001', deviceCode: 'DEV_LOBBY', minutesAgo: 8 * 60 + 12, state: 0, verify: 15 },
    { empCode: 'EMP-002', deviceCode: 'DEV_LOBBY', minutesAgo: 8 * 60 + 41, state: 0, verify: 1 },
    { empCode: 'EMP-003', deviceCode: 'DEV_HRENT', minutesAgo: 9 * 60 + 5, state: 0, verify: 1 },
    { empCode: 'EMP-001', deviceCode: 'DEV_LOBBY', minutesAgo: 30, state: 1, verify: 15 },
  ];

  let logs = 0;
  for (const p of punchSeeds) {
    const deviceId = devices.get(p.deviceCode);
    const emp = employees.find((e) => e.employeeCode === p.empCode);
    if (!deviceId || !emp) continue;
    const punchTime = new Date(now.getTime() - p.minutesAgo * 60 * 1000);
    const exists = await prisma.biometricPunchLog.findUnique({
      where: {
        deviceId_deviceUserId_punchTime_punchState: {
          deviceId,
          deviceUserId: p.empCode,
          punchTime,
          punchState: p.state,
        },
      },
    });
    if (exists) continue;

    const record = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: todayStart } },
      create: {
        organizationId: orgId,
        employeeId: emp.id,
        date: todayStart,
        checkIn: p.state === 0 ? punchTime : null,
        checkOut: p.state === 1 ? punchTime : null,
        status: 'PRESENT',
        method: p.verify === 15 ? 'FACE' : 'FINGERPRINT',
        deviceId,
      },
      update: { deviceId },
    });

    await prisma.biometricPunchLog.create({
      data: {
        organizationId: orgId,
        deviceId,
        employeeId: emp.id,
        deviceUserId: p.empCode,
        punchTime,
        punchState: p.state,
        verifyMode: p.verify,
        source: 'PULL',
        attendanceRecordId: record.id,
      },
    });
    logs += 1;
  }

  console.log(`[seed] Biometric: ${DEVICES.length} devices, ${enrolled} enrollments, ${logs} punch logs`);
}