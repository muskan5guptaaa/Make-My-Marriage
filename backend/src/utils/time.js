// Wall-clock dates and times in a wedding's timezone, without a date library.

// Milliseconds the zone is ahead of UTC at a given instant (DST-aware).
function zoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - instant.getTime();
}

// "2026-10-24" + "19:00" in Asia/Kolkata → 2026-10-24T13:30:00Z. A missing time means midnight.
export function zonedToUtc(localDate, startTime, timeZone) {
  const [y, m, d] = localDate.split('-').map(Number);
  const [h, min] = (startTime ?? '00:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let utc = wall - zoneOffsetMs(new Date(wall), timeZone);
  utc = wall - zoneOffsetMs(new Date(utc), timeZone); // second pass settles DST edges
  return new Date(utc);
}

// Today's date in the zone, as YYYY-MM-DD.
export const todayIn = (timeZone, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function daysBetween(fromDate, toDate) {
  const toUtc = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toDate) - toUtc(fromDate)) / 86_400_000);
}

export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// The 11-character video id from any common YouTube link, or null.
export function youtubeVideoId(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const match = u.pathname.match(/^\/(live|embed|shorts)\/([^/?#]+)/);
      if (match) id = match[2];
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
