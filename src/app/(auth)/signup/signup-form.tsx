"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp, type AuthFormState } from "../actions";

const initial: AuthFormState = { error: null };

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="학교 메일" name="email" type="email" placeholder="you@kangnam.ac.kr" required />
      <Field label="비밀번호" name="password" type="password" minLength={6} required />
      <Field label="이름" name="name" required />
      <Field
        label="학번 (학생만)"
        name="student_number"
        inputMode="numeric"
        hint="교수님은 비워 두세요. 가입 후에는 바꿀 수 없어요."
      />
      <Field
        label="전화번호"
        name="phone"
        type="tel"
        placeholder="010-0000-0000"
        hint="나와 관리자만 볼 수 있어요. 학번 중복 같은 문제가 생겼을 때 연락드려요."
        required
      />

      <div className="flex items-start gap-2">
        <Checkbox id="privacy_consent" name="privacy_consent" />
        <Label htmlFor="privacy_consent" className="text-sm font-normal leading-snug">
          학번, 이름, 전화번호, 연락처 수집과 이용에 동의합니다. 탈퇴하면 모두 삭제됩니다.
        </Label>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "가입 중…" : "가입하기"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  hint,
  ...input
}: { label: string; name: string; hint?: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...input} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
