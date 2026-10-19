"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Criterion } from "@/lib/ai-review/review";

// A row keeps a stable id so focus follows it when rows move or go away.
export type CriterionRow = Criterion & { id: string };

export const emptyRow = (): CriterionRow => ({ id: crypto.randomUUID(), name: "", points: 0, description: "" });

export const toRows = (criteria: Criterion[]): CriterionRow[] =>
  criteria.length ? criteria.map((c) => ({ ...c, id: crypto.randomUUID() })) : [emptyRow()];

/** Trimmed the way save_grading_criteria() saves them. */
export const trimRows = (rows: CriterionRow[]): CriterionRow[] =>
  rows.map((r) => ({ ...r, name: r.name.trim(), description: r.description.trim() }));

export const toCriteria = (rows: CriterionRow[]): Criterion[] =>
  rows.map(({ name, points, description }) => ({ name, points, description }));

// The 채점 기준표 form: one row per 채점 항목, with the total. `children` sit next to the total.
export function CriteriaRows({
  rows,
  onChange,
  children,
}: {
  rows: CriterionRow[];
  onChange: (rows: CriterionRow[]) => void;
  children?: React.ReactNode;
}) {
  const change = (i: number, patch: Partial<CriterionRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.points) ? r.points : 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
            <span className="w-6 pt-1.5 text-sm text-muted-foreground">{i + 1}</span>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex gap-2">
                <Input aria-label={`${i + 1}번 항목 이름`} placeholder="항목 이름" value={row.name} onChange={(e) => change(i, { name: e.target.value })} />
                <Input
                  aria-label={`${i + 1}번 항목 배점`}
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  className="w-24"
                  value={Number.isFinite(row.points) ? row.points : ""}
                  onChange={(e) => change(i, { points: e.target.valueAsNumber })}
                />
                <span className="pt-1.5 text-sm text-muted-foreground">점</span>
              </div>
              <Input
                aria-label={`${i + 1}번 항목 설명`}
                placeholder="설명 (선택)"
                value={row.description}
                onChange={(e) => change(i, { description: e.target.value })}
              />
            </div>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" aria-label={`${i + 1}번 항목 위로`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </Button>
              <Button type="button" size="sm" variant="ghost" aria-label={`${i + 1}번 항목 아래로`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </Button>
              <Button type="button" size="sm" variant="ghost" aria-label={`${i + 1}번 항목 지우기`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, emptyRow()])}>
          항목 추가
        </Button>
        <span className="text-sm text-muted-foreground">합계 {total}점</span>
        {children}
      </div>
    </div>
  );
}
