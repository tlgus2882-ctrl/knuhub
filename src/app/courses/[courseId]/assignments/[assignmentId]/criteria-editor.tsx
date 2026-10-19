"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveGradingCriteria, type Criterion } from "./criteria-actions";

const EMPTY: Criterion = { name: "", points: 0, description: "" };

// The professor's and assistants' editor for a 과제's 채점 항목. Saving replaces the whole list.
export function CriteriaEditor({ assignmentId, initial }: { assignmentId: string; initial: Criterion[] }) {
  const [rows, setRows] = useState<Criterion[]>(initial.length ? initial : [EMPTY]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (i: number, patch: Partial<Criterion>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setRows(next);
  };
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.points) ? r.points : 0), 0);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const { error } = await saveGradingCriteria(assignmentId, rows);
      setMessage(error ?? "채점 항목을 저장했어요.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
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
              <Button type="button" size="sm" variant="ghost" aria-label={`${i + 1}번 항목 지우기`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRows([...rows, EMPTY])}>
          항목 추가
        </Button>
        <span className="text-sm text-muted-foreground">합계 {total}점</span>
        <Button type="button" size="sm" className="ml-auto" disabled={pending} onClick={save}>
          {pending ? "저장 중…" : "저장하고 확정"}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
