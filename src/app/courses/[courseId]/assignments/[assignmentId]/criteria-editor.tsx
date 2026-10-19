"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CriteriaRows, toCriteria, toRows, trimRows } from "../criteria-rows";
import { saveGradingCriteria, type Criterion } from "./criteria-actions";

// The professor's and assistants' editor for a 과제's 채점 항목. Saving replaces the whole list.
export function CriteriaEditor({ assignmentId, initial }: { assignmentId: string; initial: Criterion[] }) {
  const [rows, setRows] = useState(() => toRows(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    // Trimmed here too, so the editor shows what was saved.
    const trimmed = trimRows(rows);
    startTransition(async () => {
      const { error } = await saveGradingCriteria(assignmentId, toCriteria(trimmed));
      if (!error) setRows(trimmed);
      setMessage(error ?? "채점 항목을 저장했어요.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <CriteriaRows rows={rows} onChange={setRows}>
        <Button type="button" size="sm" className="ml-auto" disabled={pending || !rows.length} onClick={save}>
          {pending ? "저장 중…" : "저장하고 확정"}
        </Button>
      </CriteriaRows>
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
