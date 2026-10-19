"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { promoteToProfessor, setStudentNumber } from "./admin-actions";

type Props = { userId: string; name: string; role: string; studentNumber: string | null };

// One user's admin actions: promote a 학생 to 교수, correct or clear the 학번.
export function UserActions({ userId, name, role, studentNumber }: Props) {
  const [number, setNumber] = useState(studentNumber ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error: string | null }>, ok: string) =>
    startTransition(async () => {
      setMessage(null);
      setMessage((await action()).error ?? ok);
    });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setStudentNumber(userId, number), number.trim() ? "학번을 고쳤어요." : "학번을 비웠어요.");
          }}
        >
          <Input
            aria-label={`${name}의 학번`}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="학번 없음"
            inputMode="numeric"
            className="h-8 w-32"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || number === (studentNumber ?? "")}>
            학번 저장
          </Button>
        </form>
        {role === "student" && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`${name}님을 교수로 승격할까요? 과목을 열 수 있게 돼요.`)) {
                run(() => promoteToProfessor(userId), "교수로 승격했어요.");
              }
            }}
          >
            교수로 승격
          </Button>
        )}
      </div>
      {message && (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
