"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openCourse, type CourseFormState } from "../actions";

const initial: CourseFormState = { error: null };

export function OpenCourseForm() {
  const [state, action, pending] = useActionState(openCourse, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">과목명</Label>
        <Input id="name" name="name" placeholder="자료구조" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="semester">학기</Label>
          <Input id="semester" name="semester" placeholder="2026-2" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="section">분반</Label>
          <Input id="section" name="section" placeholder="01" required />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        같은 과목명이라도 학기나 분반이 다르면 따로 열어요. 분반마다 초대 코드와 수강생이 따로예요.
      </p>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "여는 중…" : "과목 열기"}
      </Button>
    </form>
  );
}
