"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VISIBILITY_HINT, VISIBILITY_LABEL, type Visibility } from "../../visibility";
import { createAssignment, updateAssignment, type AssignmentFormState } from "./actions";

const initial: AssignmentFormState = { error: null };

type Props = {
  courseId: string;
  /** Present when editing an existing assignment. */
  assignment?: {
    id: string;
    title: string;
    description: string;
    /** datetime-local value in Korean time */
    dueInput: string;
    visibility: Visibility;
  };
};

export function AssignmentForm({ courseId, assignment }: Props) {
  const [state, action, pending] = useActionState(
    assignment ? updateAssignment : createAssignment,
    initial,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="course_id" value={courseId} />
      {assignment && <input type="hidden" name="assignment_id" value={assignment.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" defaultValue={assignment?.title} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">설명</Label>
        <textarea
          id="description"
          name="description"
          rows={12}
          defaultValue={assignment?.description}
          placeholder={"## 요구사항\n- ...\n\n## 채점 기준표\n| 항목 | 배점 |\n|---|---|\n| 기능 | 50 |"}
          className="rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          마크다운으로 쓸 수 있어요. 채점 기준표도 여기에 적어 주세요.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="due_at">마감일 (한국 시간)</Label>
        <Input id="due_at" name="due_at" type="datetime-local" defaultValue={assignment?.dueInput} required />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">마감 후 공개 범위</legend>
        {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="visibility"
              value={value}
              defaultChecked={(assignment?.visibility ?? "course") === value}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{VISIBILITY_LABEL[value]}</span>
              <span className="block text-xs text-muted-foreground">{VISIBILITY_HINT[value]}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">마감 전에는 공개 범위와 상관없이 제출한 학생과 교수·조교만 봐요.</p>
      </fieldset>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "저장 중…" : assignment ? "고친 내용 저장" : "과제 공지하기"}
      </Button>
    </form>
  );
}
