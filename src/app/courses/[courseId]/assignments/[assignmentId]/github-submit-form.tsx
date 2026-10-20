"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitFromGitHub, type SubmissionActionState } from "./submission-actions";

const initial: SubmissionActionState = { error: null };

/** 제출 from a GitHub 공개 저장소: the server fetches the branch, no zip needed. */
export function GitHubSubmitForm({ assignmentId, resubmit }: { assignmentId: string; resubmit: boolean }) {
  const [state, action, pending] = useActionState(submitFromGitHub, initial);

  return (
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">GitHub 공개 저장소에서 {resubmit ? "다시 " : ""}제출하기</summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="assignment_id" value={assignmentId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="github-repo">저장소 주소</Label>
          <Input id="github-repo" name="repo" required placeholder="https://github.com/아이디/저장소" autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="github-branch">브랜치</Label>
          <Input id="github-branch" name="branch" placeholder="비워 두면 기본 브랜치 (예: main)" autoComplete="off" />
        </div>
        <p className="text-xs text-muted-foreground">
          공개 저장소만 가져올 수 있어요. zip 업로드와 같이 node_modules, .git 같은 폴더는 빼고, 합쳐서 20MB까지 제출돼요.
          {resubmit && " 다시 제출하면 지금 파일은 제출 이력에 남고 저장소 파일로 바뀌어요."}
        </p>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "GitHub에서 가져오는 중…" : resubmit ? "저장소로 다시 제출하기" : "저장소로 제출하기"}
        </Button>
      </form>
    </details>
  );
}
