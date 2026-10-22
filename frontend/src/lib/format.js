// "Wednesday, 10 October" in the wedding's timezone, as on the dashboard design.
export function todayLabel(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}

export function greeting(timeZone) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const coupleName = (w) => `${w.brideName} & ${w.groomName}`;

// Function dates are wall-clock strings ("2026-10-24", "19:00"), formatted as written,
// never shifted by the viewer's own timezone.
const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' });

// "24 October"
export const formatDay = (localDate) => fmt({ day: 'numeric', month: 'long' }).format(parseDay(localDate));
// "24 Oct"
export const formatDayShort = (localDate) => fmt({ day: 'numeric', month: 'short' }).format(parseDay(localDate));

// Today in the wedding's timezone, as YYYY-MM-DD.
export const todayIn = (timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function addDays(localDate, n) {
  const d = parseDay(localDate);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Money arrives as whole paise. "₹1,80,000" (Indian grouping); paise shown only when present.
export function formatINR(paise) {
  const rupees = (paise ?? 0) / 100;
  const whole = Number.isInteger(rupees);
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// "₹8.2L", "₹1.2Cr", "₹45K" for summary cards, as in the design.
export function formatINRShort(paise) {
  const rupees = (paise ?? 0) / 100;
  const short = (n, unit) => `₹${Number(n.toFixed(n < 10 ? 1 : 0))}${unit}`;
  if (rupees >= 1e7) return short(rupees / 1e7, 'Cr');
  if (rupees >= 1e5) return short(rupees / 1e5, 'L');
  if (rupees >= 1e3) return short(rupees / 1e3, 'K');
  return formatINR(paise);
}

// What someone typed in rupees ("1,80,000" or "1800.50") → whole paise, or null if it isn't a number.
export function rupeesToPaise(text) {
  const clean = String(text ?? '').replace(/[₹,\s]/g, '');
  if (clean === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const paiseToRupeesInput = (paise) => (paise ? String(paise / 100) : '');

// "19:00" → "7:00 PM"
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// "18–26 October 2026", "28 October – 2 November 2026", or one day.
export function formatDateRange(range) {
  if (!range) return '';
  const a = parseDay(range.start);
  const b = parseDay(range.end);
  const year = (d) => d.getUTCFullYear();
  const month = (d) => fmt({ month: 'long' }).format(d);
  const full = (d) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  if (range.start === range.end) return full(a);
  if (year(a) !== year(b)) return `${full(a)} – ${full(b)}`;
  if (month(a) !== month(b)) return `${formatDay(range.start)} – ${full(b)}`;
  return `${a.getUTCDate()}–${full(b)}`;
}

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

// Browsers differ in what they list; always include the current value.
export function timezoneOptions(current) {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}
