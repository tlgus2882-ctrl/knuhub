"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveBio, type ProfileFormState } from "./actions";

const initial: ProfileFormState = { error: null };

export function BioForm({ bio }: { bio: string }) {
  const [state, action, pending] = useActionState(saveBio, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="bio">자기소개</Label>
      <textarea
        id="bio"
        name="bio"
        rows={4}
        maxLength={2000}
        defaultValue={bio}
        placeholder="관심 분야, 다룰 줄 아는 언어 등을 적어 주세요. 로그인한 사용자 누구나 내 프로필에서 봐요."
        className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.savedAt && !state.error && <p className="text-sm text-muted-foreground">저장했어요.</p>}
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        {pending ? "저장 중…" : "자기소개 저장"}
      </Button>
    </form>
  );
}
