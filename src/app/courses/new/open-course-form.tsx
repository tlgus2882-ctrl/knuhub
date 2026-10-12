"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openCourse, type CourseFormState } from "../actions";
import { SEMESTER_TERMS } from "../course-term";

const initial: CourseFormState = { error: null };

export function OpenCourseForm() {
  const [state, action, pending] = useActionState(openCourse, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">과목명</Label>
        <Input id="name" name="name" placeholder="자료구조" required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="year">연도</Label>
          <Input id="year" name="year" inputMode="numeric" pattern="[0-9]{4}" placeholder="2026" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="term">학기</Label>
          <select
            id="term"
            name="term"
            required
            defaultValue=""
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="" disabled>
              고르기
            </option>
            {SEMESTER_TERMS.map((term) => (
              <option key={term} value={term}>
                {/^[0-9]$/.test(term) ? `${term}학기` : `${term}학기 (계절)`}
              </option>
            ))}
          </select>
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
