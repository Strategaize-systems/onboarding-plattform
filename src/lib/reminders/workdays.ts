/**
 * Counts workdays (Mon-Fri) strictly after `start` up to and including `end`.
 * No holiday calendar (DEC-055).
 */
export function workdaysSince(start: Date, end: Date = new Date()): number {
  if (end <= start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cur < stop) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}
