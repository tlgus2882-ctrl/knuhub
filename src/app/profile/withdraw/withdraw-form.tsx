"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withdraw, type WithdrawFormState } from "./actions";
import { CONFIRM_PHRASE } from "./confirm-phrase";

const initial: WithdrawFormState = { error: null };

export function WithdrawForm() {
  const [state, action, pending] = useActionState(withdraw, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">확인을 위해 “{CONFIRM_PHRASE}”를 입력해 주세요</Label>
        <Input id="confirm" name="confirm" autoComplete="off" required />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="destructive" disabled={pending} className="self-start">
        {pending ? "탈퇴하는 중…" : "모두 지우고 탈퇴"}
      </Button>
    </form>
  );
}
