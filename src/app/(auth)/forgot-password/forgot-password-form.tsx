"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type AuthFormState } from "../actions";

const initial: AuthFormState = { error: null };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.notice) return <p className="text-sm">{state.notice}</p>;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="identifier">학번 또는 학교 메일</Label>
        <Input id="identifier" name="identifier" autoComplete="username" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "보내는 중…" : "재설정 링크 받기"}
      </Button>
    </form>
  );
}
