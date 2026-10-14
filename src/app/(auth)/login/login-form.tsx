"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logIn, type AuthFormState } from "../actions";

const initial: AuthFormState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(logIn, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="identifier">학번 또는 학교 메일</Label>
        <Input id="identifier" name="identifier" autoComplete="username" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">비밀번호</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground underline hover:text-primary">
            비밀번호를 잊었나요?
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </Button>
    </form>
  );
}
