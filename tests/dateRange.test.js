import test from 'node:test';
import assert from 'node:assert/strict';
import { startOfLocalDay, addDays, todayIn, describeRange, normalizeDateRange, validTimeZone } from '../server/services/dateRange.js';

test('local day boundaries respect the time zone, including daylight saving', () => {
  assert.equal(startOfLocalDay('2025-09-01', 'America/Denver'), '2025-09-01T06:00:00.000Z'); // MDT, UTC-6
  assert.equal(startOfLocalDay('2025-12-01', 'America/Denver'), '2025-12-01T07:00:00.000Z'); // MST, UTC-7
  assert.equal(startOfLocalDay('2025-03-09', 'America/Denver'), '2025-03-09T07:00:00.000Z'); // day DST starts
  assert.equal(startOfLocalDay('2025-09-01', 'UTC'), '2025-09-01T00:00:00.000Z');
  assert.equal(startOfLocalDay('2025-09-01', 'Asia/Tokyo'), '2025-08-31T15:00:00.000Z');
});

test('addDays and todayIn', () => {
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(todayIn('Asia/Tokyo', new Date('2026-10-16T20:00:00Z')), '2026-10-17');
  assert.equal(todayIn('America/Denver', new Date('2026-10-16T03:00:00Z')), '2026-10-15');
});

test('normalizeDateRange validates, orders, and makes an exclusive upper bound', () => {
  const r = normalizeDateRange({ from: '2025-09-01', to: '2025-09-30' }, 'America/Denver');
  assert.equal(r.takenFrom, '2025-09-01T06:00:00.000Z');
  assert.equal(r.takenTo, '2025-10-01T06:00:00.000Z');
  assert.equal(r.label, 'September 2025');
  assert.equal(describeRange('2025-01-01', '2025-12-31'), '2025');
  assert.equal(describeRange('2025-09-05', '2025-09-30'), 'Sep 5 – Sep 30, 2025');
  const swapped = normalizeDateRange({ from: '2025-09-30', to: '2025-09-01' }, 'UTC');
  assert.equal(swapped.from, '2025-09-01');
  assert.equal(normalizeDateRange({ from: '2025-02-30' }, 'UTC'), null);
  assert.equal(normalizeDateRange({ from: 'last summer' }, 'UTC'), null);
  assert.equal(normalizeDateRange(null), null);
  const open = normalizeDateRange({ from: '2026-03-03' }, 'UTC');
  assert.equal(open.takenTo, null);
  assert.equal(open.label, 'Since Mar 3, 2026');
  assert.equal(validTimeZone('Not/AZone'), 'UTC');
  assert.equal(describeRange('2025-09-05', '2025-09-05'), 'Sep 5, 2025');
});
