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
  return `${minutes}분 남음`;
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

/** Reads a datetime-local value as Korean time. */
export function fromKstInputValue(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}
