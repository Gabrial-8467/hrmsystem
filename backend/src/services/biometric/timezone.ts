/**
 * ZK terminals record naive wall-clock time with no offset and no zone
 * (`ZkNaiveTime`). We interpret that wall reading in the organization's
 * configured timezone so punches land on the right calendar day.
 */

export interface ZkWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface ZkNaiveTime extends ZkWallClock {
  /** Compact wall reading, `YYYYMMDDTHHmmss`, as the terminal prints it. */
  local: string;
}

function tzOffsetMs(epochMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const hit = parts.find((p) => p.type === type);
    return Number(hit?.value ?? 0);
  };
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallAsUtc - epochMs;
}

function naiveToInstantUTC(parts: ZkWallClock, timeZone: string): number {
  let utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let offset = tzOffsetMs(utcGuess, timeZone);
  for (let i = 0; i < 3; i += 1) {
    const result = utcGuess - offset;
    const next = tzOffsetMs(result, timeZone);
    if (next === offset) break;
    offset = next;
  }
  return utcGuess - offset;
}

function fmt(parts: number[]): string {
  return parts.map((n) => String(n).padStart(2, '0')).join('');
}

/** Interpret a device wall-clock reading in `timeZone` and return the instant. */
export function naiveToDate(naive: ZkNaiveTime, timeZone: string): Date {
  return new Date(naiveToInstantUTC(naive, timeZone));
}

/**
 * Decompose an instant into the wall-clock it shows in `timeZone`.
 */
export function instantToZkNaive(date: Date, timeZone: string): ZkNaiveTime {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const hit = parts.find((p) => p.type === type);
    return Number(hit?.value ?? 0);
  };
  const wall: ZkWallClock = {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
  return {
    ...wall,
    local: `${fmt([wall.year, wall.month, wall.day])}T${fmt([wall.hour, wall.minute, wall.second])}`,
  };
}

/**
 * Convert a ZK device clock report (Unix seconds of the device's naive wall
 * time) into a naive wall reading. The device encodes its local clock as
 * epoch seconds, so the UTC decomposition is the canonical naive reading.
 */
export function secondsToZkNaive(seconds: number): ZkNaiveTime {
  const d = new Date(seconds * 1000);
  const wall: ZkWallClock = {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
  return {
    ...wall,
    local: `${fmt([wall.year, wall.month, wall.day])}T${fmt([wall.hour, wall.minute, wall.second])}`,
  };
}

/**
 * Recover the naive wall reading from a Date that was constructed from
 * wall-clock components in the *runtime server's* local timezone (as
 * node-zklib does with `new Date(y, m, d, h, min, s)`). Reinterpreting the
 * fields through the organization timezone keeps punches correct no matter
 * what timezone the Node process itself runs in.
 */
export function localDateToNaive(d: Date): ZkNaiveTime {
  const wall: ZkWallClock = {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
  return {
    ...wall,
    local: `${fmt([wall.year, wall.month, wall.day])}T${fmt([wall.hour, wall.minute, wall.second])}`,
  };
}

/** Start of the naive calendar day in `timeZone`, as an instant. */
export function naiveStartOfDay(
  naive: { year: number; month: number; day: number },
  timeZone: string,
): Date {
  return new Date(
    naiveToInstantUTC({ ...naive, hour: 0, minute: 0, second: 0 }, timeZone),
  );
}