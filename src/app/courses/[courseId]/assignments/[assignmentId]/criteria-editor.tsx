"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftGradingCriteria, saveGradingCriteria, type Criterion } from "./criteria-actions";

// A row keeps a stable id so focus follows it when rows move or go away.
type Row = Criterion & { id: string };

const emptyRow = (): Row => ({ id: crypto.randomUUID(), name: "", points: 0, description: "" });

// The professor's and assistants' editor for a 과제's 채점 항목. Saving replaces the whole list.
export function CriteriaEditor({ assignmentId, initial }: { assignmentId: string; initial: Criterion[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length ? initial.map((c) => ({ ...c, id: crypto.randomUUID() })) : [emptyRow()],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setRows(next);
  };
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.points) ? r.points : 0), 0);

  function draft() {
    const hasContent = rows.some((r) => r.name.trim() || r.description.trim());
    if (hasContent && !window.confirm("편집 칸의 내용을 AI 초안으로 바꿀까요? 저장하기 전에는 확정되지 않아요.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await draftGradingCriteria(assignmentId);
      if (result.criteria) setRows(result.criteria.map((c) => ({ ...c, id: crypto.randomUUID() })));
      setMessage(result.error ?? "AI 초안을 채웠어요. 확인하고 고친 뒤 저장해 주세요.");
    });
  }

  function save() {
    setMessage(null);
    // Trimmed the way the server saves them, so the editor shows what was saved.
    const trimmed = rows.map((r) => ({ ...r, name: r.name.trim(), description: r.description.trim() }));
    startTransition(async () => {
      const { error } = await saveGradingCriteria(
        assignmentId,
        trimmed.map(({ name, points, description }) => ({ name, points, description })),
      );
      if (!error) setRows(trimmed);
      setMessage(error ?? "채점 항목을 저장했어요.");
    });
  }

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
              <Button type="button" size="sm" variant="ghost" aria-label={`${i + 1}번 항목 지우기`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRows([...rows, emptyRow()])}>
          항목 추가
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={draft}>
          AI로 초안 만들기
        </Button>
        <span className="text-sm text-muted-foreground">합계 {total}점</span>
        <Button type="button" size="sm" className="ml-auto" disabled={pending || !rows.length} onClick={save}>
          {pending ? "저장 중…" : "저장하고 확정"}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
