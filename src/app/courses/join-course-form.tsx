"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinCourse, type CourseFormState } from "./actions";

const initial: CourseFormState = { error: null };

export function JoinCourseForm() {
  const [state, action, pending] = useActionState(joinCourse, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="code">초대 코드로 과목 참여</Label>
      <div className="flex gap-2">
        <Input id="code" name="code" placeholder="예: 3F9A1C2B" autoComplete="off" required />
        <Button type="submit" disabled={pending}>
          {pending ? "참여 중…" : "참여"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
