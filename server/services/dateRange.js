// Date helpers for photo searches. Photos are dated by captured_at (when they were taken)
// and people think in their own calendar days, so ranges are given as local YYYY-MM-DD
// dates plus an IANA time zone and converted to UTC instants here.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}

function offsetMinutes(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return (Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - date.getTime()) / 60000;
}

const isRealDate = s => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** The UTC instant at which local calendar day `dateStr` begins in `tz`. */
export function startOfLocalDay(dateStr, tz = 'UTC') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMinutes(tz, new Date(guess)) * 60000;
  return new Date(guess - offsetMinutes(tz, new Date(first)) * 60000).toISOString();
}

export function addDays(dateStr, days) {
  const t = new Date(`${dateStr}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export function todayIn(tz = 'UTC', now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p; // en-CA formats as YYYY-MM-DD
}

const fmt = (dateStr, withYear) => new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/** "Sep 1 – Sep 30, 2025" / "Since Mar 3, 2026" / "Until Dec 31, 2025" */
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

export function describeRange(from, to) {
  if (from && to) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return String(fy);
    if (fy === ty && fm === tm && fd === 1 && td === lastDayOfMonth(ty, tm)) {
      return new Date(Date.UTC(fy, fm - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    if (from === to) return fmt(from, true);
    return `${fmt(from, !sameYear)} – ${fmt(to, true)}`;
  }
  if (from) return `Since ${fmt(from, true)}`;
  if (to) return `Until ${fmt(to, true)}`;
  return '';
}

/**
 * Validates a model- or user-supplied { from, to, label } and adds the UTC bounds
 * (takenFrom inclusive, takenTo exclusive). Returns null when there is nothing usable.
 */
export function normalizeDateRange(raw, tz = 'UTC') {
  if (!raw || typeof raw !== 'object') return null;
  const zone = validTimeZone(tz);
  let from = isRealDate(String(raw.from || '')) ? String(raw.from) : null;
  let to = isRealDate(String(raw.to || '')) ? String(raw.to) : null;
  if (!from && !to) return null;
  if (from && to && from > to) [from, to] = [to, from];
  return {
    from, to,
    // always the real dates, not the model's phrasing ("last October" is ambiguous in a reply)
    label: describeRange(from, to),
    takenFrom: from ? startOfLocalDay(from, zone) : null,
    takenTo: to ? startOfLocalDay(addDays(to, 1), zone) : null,
  };
}
