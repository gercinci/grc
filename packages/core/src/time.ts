/**
 * Europe/Istanbul zaman yardımcıları. Tüm oyun kuralları İstanbul duvar saatine
 * göre tanımlıdır; bu modül hiçbir yerde sabit UTC+3 varsaymaz.
 */
export const TZ = 'Europe/Istanbul';

/** İstanbul takvim günü, `YYYY-MM-DD`. */
export type DateStr = string;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function wallClock(instant: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of formatter.formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function parseDate(date: DateStr): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Geçersiz tarih: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Verilen anın İstanbul'daki takvim günü. */
export function istanbulDate(instant: Date): DateStr {
  const w = wallClock(instant);
  return `${pad(w.year!, 4)}-${pad(w.month!)}-${pad(w.day!)}`;
}

/** İstanbul duvar saati ile UTC arasındaki fark (dakika). */
function offsetMinutes(instant: Date): number {
  const w = wallClock(instant);
  const asUtc = Date.UTC(w.year!, w.month! - 1, w.day!, w.hour!, w.minute!, w.second!);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** İstanbul'da `date` günü `hour:minute` olan an. */
export function istanbulInstant(date: DateStr, hour: number, minute = 0): Date {
  const [y, m, d] = parseDate(date);
  const naive = Date.UTC(y, m - 1, d, hour, minute);
  let t = naive - offsetMinutes(new Date(naive)) * 60000;
  t = naive - offsetMinutes(new Date(t)) * 60000;
  return new Date(t);
}

export function addDays(date: DateStr, days: number): DateStr {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** İki takvim günü arasındaki gün farkı (b − a). */
export function daysBetween(a: DateStr, b: DateStr): number {
  const [ay, am, ad] = parseDate(a);
  const [by, bm, bd] = parseDate(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** `YYYY-MM` — seri dondurma hakkı takvim ayına bağlıdır. */
export function monthKey(date: DateStr): string {
  return date.slice(0, 7);
}

/** Verilen anın içinde bulunduğu lig haftasının pazartesisi (İstanbul). */
export function weekStart(instant: Date): DateStr {
  const date = istanbulDate(instant);
  const [y, m, d] = parseDate(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = pazar
  return addDays(date, -((dow + 6) % 7));
}
