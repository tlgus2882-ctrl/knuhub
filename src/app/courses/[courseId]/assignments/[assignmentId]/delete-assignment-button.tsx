"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteAssignment } from "../actions";

export function DeleteAssignmentButton({ courseId, assignmentId, title }: { courseId: string; assignmentId: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() => {
          if (!confirm(`"${title}" 과제를 지울까요?\n학생들의 제출물, 리뷰, 셀프 점검·1차 검사 결과, 첨부파일이 모두 지워지고 되돌릴 수 없어요.`)) return;
          startTransition(async () => setError((await deleteAssignment(courseId, assignmentId)).error));
        }}
      >
        {pending ? "지우는 중…" : "과제 삭제"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
