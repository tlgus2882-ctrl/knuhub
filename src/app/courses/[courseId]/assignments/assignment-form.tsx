"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDaysToInput } from "@/lib/time";
import { VISIBILITY_HINT, VISIBILITY_LABEL, type Visibility } from "../../visibility";
import { saveGradingCriteria } from "./[assignmentId]/criteria-actions";
import { createAssignment, updateAssignment } from "./actions";
import { ASSIGNMENT_FILE_LIMIT_LABEL, attachFiles, oversizedFiles, oversizedMessage } from "./attach-files";
import { CriteriaRows, toCriteria, toRows, trimRows } from "./criteria-rows";
import { DeadlineInput } from "./deadline-input";

type Props = {
  courseId: string;
  /** A new 과제's 마감 to start from (datetime-local value in Korean time). */
  defaultDue?: string;
  /** Present when editing an existing assignment. */
  assignment?: {
    id: string;
    title: string;
    description: string;
    /** datetime-local value in Korean time */
    dueInput: string;
    /** 지각 제출 마감 in the same form, or null when 지각 제출 is off. */
    lateInput: string | null;
    visibility: Visibility;
    published: boolean;
  };
};

// Saves the 과제 first (the 채점 항목 and 첨부파일 need its id), then saves the 채점 항목 and
// attaches the picked files, and opens it. Editing leaves the 채점 항목 to the 과제 화면.
export function AssignmentForm({ courseId, defaultDue, assignment }: Props) {
  const router = useRouter();
  const [due, setDue] = useState(assignment?.dueInput ?? defaultDue ?? "");
  // A new 과제 takes 지각 제출 for a week after the 마감 by default; the 지각 제출 마감 follows
  // the 마감 until it is picked by hand.
  const [lateOn, setLateOn] = useState(assignment ? assignment.lateInput !== null : true);
  const [late, setLate] = useState(assignment?.lateInput ?? (due ? addDaysToInput(due, 7) : ""));
  const [lateTouched, setLateTouched] = useState(Boolean(assignment?.lateInput));
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState(() => toRows([]));
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeDue(value: string) {
    setDue(value);
    if (!lateTouched) setLate(addDaysToInput(value, 7));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lateOn && late <= due) return setError("지각 제출 마감은 마감보다 뒤여야 해요.");
    const tooLarge = oversizedFiles(files);
    if (tooLarge.length) return setError(oversizedMessage(tooLarge));
    // Blank rows are left out; checked before saving so a bad row never leaves a 과제 without them.
    const criteria = assignment ? [] : toCriteria(trimRows(rows).filter((r) => r.name || r.description));
    if (criteria.some((c) => !c.name || !Number.isInteger(c.points) || c.points < 0 || c.points > 1000)) {
      return setError("채점 항목마다 이름과 0~1000점 정수 배점을 적어 주세요.");
    }
    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      setError(null);
      const saved = await (assignment ? updateAssignment : createAssignment)(form);
      if (saved.error || !saved.assignmentId) return setError(saved.error);

      const criteriaError = criteria.length ? (await saveGradingCriteria(saved.assignmentId, criteria)).error : null;
      if (criteriaError) {
        setSavedId(saved.assignmentId);
        setError(`과제는 저장했지만 채점 항목을 저장하지 못했어요. 과제 화면에서 다시 정해 주세요. ${criteriaError}`);
        return;
      }
      const attachError = files.length ? await attachFiles(saved.assignmentId, files) : null;
      if (attachError) {
        setSavedId(saved.assignmentId);
        setError(`과제는 저장했지만 첨부하지 못한 파일이 있어요. 과제 화면에서 다시 첨부해 주세요. ${attachError}`);
        return;
      }
      router.push(`/courses/${courseId}/assignments/${saved.assignmentId}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
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
          placeholder={"## 요구사항\n- ..."}
          className="rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          마크다운으로 쓸 수 있어요.{assignment ? " 채점 항목은 과제 화면에서 고칠 수 있어요." : " 채점 기준표는 아래 채점 항목에 적어 주세요."}
        </p>
      </div>

      {!assignment && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">채점 기준표</legend>
          <p className="text-xs text-muted-foreground">
            채점 항목마다 이름, 배점, 설명을 적어요. 셀프 점검과 1차 검사가 이 항목으로 검토해요. 비워 두고 나중에 과제 화면에서 정해도 돼요.
          </p>
          <CriteriaRows rows={rows} onChange={setRows} />
        </fieldset>
      )}

      <input type="hidden" name="due_at" value={due} />
      <DeadlineInput
        id="due_at"
        label="마감"
        value={due}
        onChange={changeDue}
        quickDays={[
          { label: "내일", days: 1 },
          { label: "3일 뒤", days: 3 },
          { label: "1주 뒤", days: 7 },
          { label: "2주 뒤", days: 14 },
        ]}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">지각 제출</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lateOn} onChange={(e) => setLateOn(e.target.checked)} className="size-4" />
          마감 뒤에도 지각 제출 받기
        </label>
        <input type="hidden" name="late_due_at" value={lateOn ? late : ""} />
        {lateOn && (
          <DeadlineInput
            id="late_due_at"
            label="지각 제출 마감"
            value={late}
            from={due}
            onChange={(value) => {
              setLate(value);
              setLateTouched(true);
            }}
            quickDays={[
              { label: "마감 +1일", days: 1 },
              { label: "+3일", days: 3 },
              { label: "+1주", days: 7 },
            ]}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {lateOn
            ? "마감 뒤에 낸 제출물에는 지각 표시가 붙어요. 채점은 마감 뒤에 바로 할 수 있고, 지각 제출 마감에 자동으로 채점 완료돼 제출물이 공개돼요."
            : "마감이 지나면 제출을 받지 않아요."}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">채점 후 공개 범위</legend>
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
        <p className="text-xs text-muted-foreground">채점 완료(버튼, 또는 지각 제출 마감에 자동) 전까지는 공개 범위와 상관없이 제출한 학생과 교수·조교만 봐요.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">과제 공개</legend>
        {[
          { value: "true", label: "학생에게 공개", hint: "수강생에게 바로 보이고 제출을 받아요." },
          { value: "false", label: "비공개 (교수·조교만)", hint: "미리 써 두었다가 나중에 공개할 때 써요. 제출도 받지 않아요." },
        ].map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="published"
              value={option.value}
              defaultChecked={String(assignment?.published ?? true) === option.value}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attachments">{assignment ? "첨부파일 추가" : "첨부파일"}</Label>
        <Input
          id="attachments"
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))}
        />
        <p className="text-xs text-muted-foreground">
          파일 하나에 {ASSIGNMENT_FILE_LIMIT_LABEL}까지. {assignment ? "이미 첨부한 파일은 과제 화면에서 지울 수 있어요." : "과제를 저장하면 함께 첨부돼요."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error}{" "}
          {savedId && (
            <a href={`/courses/${courseId}/assignments/${savedId}`} className="text-primary underline">
              과제로 가기
            </a>
          )}
        </p>
      )}

      {/* Once saved, submitting again would save a second 과제; the rest is attached from the 과제 화면. */}
      <Button type="submit" disabled={pending || savedId !== null}>
        {pending ? "저장 중…" : assignment ? "고친 내용 저장" : "과제 만들기"}
      </Button>
    </form>
  );
}
