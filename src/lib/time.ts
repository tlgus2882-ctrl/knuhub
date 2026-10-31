// Deadlines are stored with time zone and shown in Korean time.
const KST = "Asia/Seoul";

/** "2026년 10월 20일 (화) 오후 11:59" */
export function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** "3일 4시간 남음", "25분 남음", or "마감됨". */
export function timeLeft(iso: string, now: Date): string {
  const minutes = Math.floor((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (minutes < 0) return "마감됨";
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes % 60}분 남음`;
  return minutes > 0 ? `${minutes}분 남음` : "1분 미만 남음";
}

/** Value for <input type="datetime-local"> in Korean time: "2026-10-20T23:59". */
export function toKstInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

const DATETIME_LOCAL = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/;

/** Reads a datetime-local value as Korean time; null if it isn't one. */
export function fromKstInputValue(value: string): string | null {
  const match = DATETIME_LOCAL.exec(value);
  if (!match) return null;
  const date = new Date(`${match[1]}${match[2] ?? ":00"}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The same datetime-local value `days` later (the clock time stays). */
export function addDaysToInput(value: string, days: number): string {
  const [date, time] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return `${moved.toISOString().slice(0, 10)}T${time}`;
}

/** Today's date in Korean time: "2026-10-28". */
export function kstToday(now: Date): string {
  return toKstInputValue(now.toISOString()).slice(0, 10);
}

/** A new 과제's default 마감: a week from today in Korean time, at 23:59. */
export function defaultDueInput(now: Date): string {
  return addDaysToInput(`${kstToday(now)}T23:59`, 7);
}
