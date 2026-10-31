"use client";

import { Input } from "@/components/ui/input";
import { addDaysToInput, formatKst, fromKstInputValue, toKstInputValue } from "@/lib/time";

const TIMES = ["09:00", "12:00", "18:00", "23:59"];

type Props = {
  id: string;
  label: string;
  /** datetime-local value in Korean time ("2026-11-04T23:59") */
  value: string;
  onChange: (value: string) => void;
  /** Quick buttons: days after `from` (today when omitted, else e.g. the 마감 for the 지각 제출 마감). */
  quickDays: { label: string; days: number }[];
  from?: string;
};

/** A deadline as a date plus a time (Korean time), with quick buttons and a readable preview. */
export function DeadlineInput({ id, label, value, onChange, quickDays, from }: Props) {
  const [date, time = "23:59"] = value.split("T");
  const iso = fromKstInputValue(value);

  // Today is read on click, so rendering stays the same on the server and in the browser.
  const pickDays = (days: number) => {
    const base = from ?? `${toKstInputValue(new Date().toISOString()).slice(0, 10)}T${time}`;
    onChange(`${addDaysToInput(base, days).slice(0, 10)}T${from ? from.split("T")[1] : time}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
        <Input
          id={id}
          type="date"
          aria-label={`${label} 날짜`}
          value={date}
          required
          onChange={(e) => e.target.value && onChange(`${e.target.value}T${time}`)}
          className="w-auto"
        />
        <Input
          type="time"
          aria-label={`${label} 시각`}
          value={time}
          required
          onChange={(e) => e.target.value && onChange(`${date}T${e.target.value}`)}
          className="w-auto"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {quickDays.map((quick) => (
          <button key={quick.label} type="button" onClick={() => pickDays(quick.days)} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted">
            {quick.label}
          </button>
        ))}
        <span className="mx-1 border-l" aria-hidden />
        {TIMES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={time === t}
            onClick={() => onChange(`${date}T${t}`)}
            className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted aria-pressed:border-primary aria-pressed:text-primary"
          >
            {t === "23:59" ? "밤 11:59" : t}
          </button>
        ))}
      </div>
      {iso && <p className="text-xs text-muted-foreground">{formatKst(iso)} (한국 시간)</p>}
    </div>
  );
}
