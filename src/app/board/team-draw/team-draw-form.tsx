"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Question } from "@/lib/team-draw/form-teams";
import { DeadlineInput } from "@/app/courses/[courseId]/assignments/deadline-input";
import { createTeamDraw, updateTeamDraw, type TeamDrawFormState } from "./actions";
import { DEFAULT_CRITERIA, DEFAULT_QUESTIONS, DEFAULT_TEAM_SIZE } from "./defaults";

const initial: TeamDrawFormState = { error: null };

const textarea =
  "rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Draw = {
  postId: string;
  title: string;
  body: string;
  mode: "random" | "survey";
  teamSize: number;
  criteria: string;
  questions: Question[];
  /** datetime-local value in Korean time */
  dueInput: string;
  /** 응답이 들어와 문항을 바꿀 수 없다 */
  questionsLocked: boolean;
};

type Props = { draw: Draw; courseId?: undefined } | { draw?: undefined; courseId: string; defaultDue: string };

/** Posts a new 팀 추첨 on a 과목 게시판, or changes `draw`'s settings before 공개. */
export function TeamDrawForm(props: Props) {
  const { draw } = props;
  const [state, action, pending] = useActionState(draw ? updateTeamDraw : createTeamDraw, initial);
  const [mode, setMode] = useState(draw?.mode ?? "survey");
  const [due, setDue] = useState(draw?.dueInput ?? (props.draw ? "" : props.defaultDue));
  const [questions, setQuestions] = useState<Question[]>(draw?.questions.length ? draw.questions : DEFAULT_QUESTIONS);
  const locked = draw?.questionsLocked ?? false;

  const change = (index: number, question: Question) => setQuestions(questions.map((q, i) => (i === index ? question : q)));

  return (
    <form action={action} className="flex flex-col gap-5">
      {draw ? <input type="hidden" name="post_id" value={draw.postId} /> : <input type="hidden" name="course_id" value={props.courseId} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" required maxLength={200} defaultValue={draw?.title ?? "팀 프로젝트 팀 추첨"} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">설명</Label>
        <textarea id="body" name="body" rows={4} required maxLength={20000} defaultValue={draw?.body} className={textarea} />
      </div>

      {/* A disabled fieldset sends none of its inputs, so these stay outside. */}
      {draw && <input type="hidden" name="mode" value={mode} />}
      {locked && <input type="hidden" name="questions_locked" value="1" />}
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />
      <fieldset className="flex flex-col gap-2" disabled={Boolean(draw)}>
        <legend className="mb-1.5 text-sm font-medium">방식</legend>
        {(
          [
            ["survey", "설문을 받아 AI가 나누기", "기간 안에 수강생에게 설문을 받고, 마감이 지나면 편성 기준에 따라 AI가 팀을 나눠요."],
            ["random", "무작위로 나누기", "설문 없이 바로 무작위로 나눠요."],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex cursor-pointer gap-2 text-sm">
            <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 size-4" />
            <span>
              {label}
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team_size">팀당 인원</Label>
        <Input id="team_size" name="team_size" type="number" min={2} max={50} required defaultValue={draw?.teamSize ?? DEFAULT_TEAM_SIZE} className="w-24" />
        <p className="text-xs text-muted-foreground">나누어떨어지지 않으면 남는 사람은 앞 팀부터 1명씩 더해져요.</p>
      </div>

      {mode === "survey" && (
        <>
          <input type="hidden" name="survey_due_at" value={due} />
          <DeadlineInput
            id="survey_due_at"
            label="설문 마감"
            value={due}
            onChange={setDue}
            quickDays={[
              { label: "3일 뒤", days: 3 },
              { label: "1주 뒤", days: 7 },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="criteria">편성 기준</Label>
            <textarea id="criteria" name="criteria" rows={3} maxLength={2000} defaultValue={draw?.criteria || DEFAULT_CRITERIA} className={textarea} />
            <p className="text-xs text-muted-foreground">AI가 이 기준에 따라 팀을 나눠요. 이름과 학번은 AI에 보내지 않아요.</p>
          </div>

          <fieldset className="flex flex-col gap-3" disabled={locked}>
            <legend className="mb-1.5 text-sm font-medium">설문 문항</legend>
            {locked && <p className="text-xs text-muted-foreground">응답이 들어와서 문항은 바꿀 수 없어요.</p>}
            {questions.map((q, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`${i + 1}번 문항`}
                    value={q.title}
                    maxLength={200}
                    onChange={(e) => change(i, { ...q, title: e.target.value })}
                    className="min-w-0 flex-1"
                  />
                  <select
                    aria-label={`${i + 1}번 문항 형식`}
                    value={q.kind}
                    onChange={(e) =>
                      change(i, e.target.value === "choice" ? { title: q.title, kind: "choice", options: ["", ""] } : { title: q.title, kind: "text" })
                    }
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="choice">객관식</option>
                    <option value="text">서술형</option>
                  </select>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>
                    지우기
                  </Button>
                </div>
                {q.kind === "choice" && (
                  <Input
                    aria-label={`${i + 1}번 문항 보기`}
                    placeholder="보기를 쉼표로 나눠 쓰세요 (예: 상, 중, 하)"
                    value={(q.options ?? []).join(", ")}
                    onChange={(e) => change(i, { ...q, options: e.target.value.split(",").map((o) => o.trim()) })}
                    onBlur={() => change(i, { ...q, options: (q.options ?? []).filter(Boolean) })}
                  />
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setQuestions([...questions, { title: "", kind: "text" }])}>
              문항 더하기
            </Button>
          </fieldset>
        </>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "저장 중…" : draw ? "고친 내용 저장" : mode === "random" ? "올리고 바로 나누기" : "팀 추첨 올리기"}
      </Button>
    </form>
  );
}
