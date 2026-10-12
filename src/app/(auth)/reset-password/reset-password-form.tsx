"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type AuthFormState } from "../actions";

const initial: AuthFormState = { error: null };

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">새 비밀번호</Label>
        <Input id="password" name="password" type="password" minLength={6} autoComplete="new-password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password_confirm">새 비밀번호 확인</Label>
        <Input
          id="password_confirm"
          name="password_confirm"
          type="password"
          minLength={6}
          autoComplete="new-password"
          required
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
      </Button>
    </form>
  );
}
