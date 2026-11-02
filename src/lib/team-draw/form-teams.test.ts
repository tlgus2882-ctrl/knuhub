import { describe, expect, it } from "vitest";
import type { Prompt, ReviewModel } from "@/lib/ai-review/review";
import { formTeams } from "./form-teams";

const people = (count: number) => Array.from({ length: count }, (_, i) => ({ key: `p${i + 1}`, answers: null }));

describe("팀 나누기", () => {
  it("무작위 방식은 모두를 한 번씩 넣고, 남는 사람은 앞 팀부터 1명씩 더한다", async () => {
    const result = await formTeams({ people: people(23), teamSize: 4 });

    expect(result.kind).toBe("formed");
    if (result.kind !== "formed") return;
    expect(result.teams.map((t) => t.length)).toEqual([5, 5, 5, 4, 4]);
    expect(result.teams.flat().sort()).toEqual(people(23).map((p) => p.key).sort());
  });

  it("설문 방식은 응답한 사람만 익명 번호로 AI에 보내고, 미응답자는 남은 자리에 넣는다", async () => {
    const { model, asked } = fakeModel({
      teams: [
        { team: 1, members: [1, 2] },
        { team: 2, members: [3, 4] },
      ],
      rationale: "역량을 고르게 섞었어요.",
    });
    const answered = (key: string, level: string) => ({ key, answers: [level, "문서 정리를 잘해요"] });

    const result = await formTeams({
      people: [answered("user-a", "상"), answered("user-b", "하"), answered("user-c", "중"), answered("user-d", "중"), ...people(2)],
      teamSize: 3,
      survey: { model, criteria: "역량이 고르게", questions: QUESTIONS },
    });

    expect(result).toMatchObject({ kind: "formed", rationale: "역량을 고르게 섞었어요." });
    if (result.kind !== "formed") return;
    expect(result.teams[0]).toEqual(expect.arrayContaining(["user-a", "user-b"]));
    expect(result.teams[1]).toEqual(expect.arrayContaining(["user-c", "user-d"]));
    expect(result.teams.map((t) => t.length)).toEqual([3, 3]);
    expect(result.teams.flat()).toEqual(expect.arrayContaining(["p1", "p2"]));

    const sent = asked[0].system + asked[0].user;
    expect(sent).toContain("역량이 고르게");
    expect(sent).toContain("코딩 역량");
    expect(sent).toContain("하");
    expect(sent).not.toContain("user-");
    expect(sent).not.toContain("p1");
  });

  it.each([
    ["빠진 사람", { teams: [{ team: 1, members: [1] }], rationale: "" }],
    ["두 번 들어간 사람", { teams: [{ team: 1, members: [1, 2] }, { team: 2, members: [2] }], rationale: "" }],
    ["없는 번호", { teams: [{ team: 1, members: [1, 9] }], rationale: "" }],
    ["없는 팀", { teams: [{ team: 3, members: [1, 2] }], rationale: "" }],
    ["자리보다 많이", { teams: [{ team: 1, members: [1, 2, 3] }, { team: 2, members: [] }], rationale: "" }],
    ["형식이 틀린 답", { teams: "1팀" }],
    ["답 없음", null],
  ])("AI 결과에 %s이 있으면 실패로 처리한다", async (_, answer) => {
    const { model } = fakeModel(answer);
    const result = await formTeams({
      people: [...[1, 2, 3].map((n) => ({ key: `u${n}`, answers: ["상", "강점"] })), ...people(1)],
      teamSize: 2,
      survey: { model, criteria: "", questions: QUESTIONS },
    });
    expect(result).toEqual({ kind: "failed" });
  });

  it("AI 호출이 오류를 내면 실패로 처리한다", async () => {
    const { model } = fakeModel(null, { fail: true });
    const result = await formTeams({ people: [{ key: "u1", answers: ["상", "강점"] }], teamSize: 2, survey: { model, criteria: "", questions: QUESTIONS } });
    expect(result).toEqual({ kind: "failed" });
  });

  it("아무도 응답하지 않았으면 AI 없이 무작위로 나눈다", async () => {
    const { model, asked } = fakeModel(null, { fail: true });
    const result = await formTeams({ people: people(4), teamSize: 2, survey: { model, criteria: "", questions: QUESTIONS } });
    expect(result.kind).toBe("formed");
    expect(asked).toEqual([]);
  });
});

const QUESTIONS = [
  { title: "코딩 역량", kind: "choice" as const, options: ["상", "중", "하"] },
  { title: "자신의 강점", kind: "text" as const },
];

/** A model that answers with `answer` and records what it was asked. */
function fakeModel(answer: unknown, { fail = false } = {}) {
  const asked: Prompt[] = [];
  const model: ReviewModel = {
    countTokens: async () => 100,
    generate: async (prompt) => {
      asked.push(prompt);
      if (fail) throw new Error("network down");
      return answer as never;
    },
  };
  return { model, asked };
}
