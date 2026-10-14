"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VISIBILITY_HINT, VISIBILITY_LABEL, type Visibility } from "../../visibility";
import { createAssignment, updateAssignment } from "./actions";
import { ASSIGNMENT_FILE_LIMIT_LABEL, attachFiles, oversizedFiles, oversizedMessage } from "./attach-files";

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
    published: boolean;
  };
};

// Saves the 과제 first (the 첨부파일 need its id), then attaches the picked files and opens it.
export function AssignmentForm({ courseId, assignment }: Props) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tooLarge = oversizedFiles(files);
    if (tooLarge.length) return setError(oversizedMessage(tooLarge));
    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      setError(null);
      const saved = await (assignment ? updateAssignment : createAssignment)(form);
      if (saved.error || !saved.assignmentId) return setError(saved.error);

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
        {pending ? "저장 중…" : assignment ? "고친 내용 저장" : "과제 공지하기"}
      </Button>
    </form>
  );
}
