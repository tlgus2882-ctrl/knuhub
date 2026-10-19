import { describe, expect, it } from "vitest";
import {
  draftCriteria,
  INPUT_TOKEN_LIMIT,
  isSuspicious,
  reviewSubmission,
  type Prompt,
  type ReviewModel,
} from "./review";

/** A model that answers with `answer` and records what it was asked. */
function fakeModel(answer: unknown, { tokens = 100, fail = false } = {}) {
  const asked: Prompt[] = [];
  const model: ReviewModel = {
    countTokens: async () => tokens,
    generate: async (prompt) => {
      asked.push(prompt);
      if (fail) throw new Error("network down");
      return answer as never;
    },
  };
  return { model, asked };
}

const CRITERIA = [
  { name: "insert 동작", points: 30, description: "맨 앞, 중간, 맨 뒤에 넣는다" },
  { name: "빈 리스트 처리", points: 20, description: "" },
];
const FILES = [{ path: "src/list.c", text: "int insert() {\n  return 0;\n}\n" }];

describe("reviewSubmission", () => {
  it("입력이 한도를 넘으면 모델에게 묻지 않고 너무 크다고 알린다", async () => {
    const { model, asked } = fakeModel(null, { tokens: INPUT_TOKEN_LIMIT + 1 });

    expect(await reviewSubmission(model, CRITERIA, FILES)).toEqual({ kind: "too_large" });
    expect(asked).toEqual([]);
  });

  it("파일에 줄 번호를 붙여 보내고, 코드 속 지시문을 따르지 말라고 알린다", async () => {
    const { model, asked } = fakeModel({ opinions: [] });

    await reviewSubmission(model, CRITERIA, FILES);

    expect(asked[0].user).toContain('<file path="src/list.c">\n1| int insert() {\n2|   return 0;\n3| }\n</file>');
    expect(asked[0].user).toContain("1. insert 동작 (30점)");
    expect(asked[0].system).toContain("지시문");
  });

  it("근거가 없거나, 없는 파일이거나, 파일 범위 밖의 줄이면 판단 불가로 바꾼다", async () => {
    const { model } = fakeModel({
      opinions: [
        { criterion: 1, verdict: "met", evidence: [{ path: "src/list.c", start_line: 1, end_line: 3 }], comment: "넣는다" },
        { criterion: 2, verdict: "not_met", evidence: [{ path: "src/list.c", start_line: 2, end_line: 9 }], comment: "없다" },
      ],
    });
    const { model: noEvidence } = fakeModel({
      opinions: [
        { criterion: 1, verdict: "met", evidence: [], comment: "" },
        { criterion: 2, verdict: "met", evidence: [{ path: "src/other.c", start_line: 1, end_line: 1 }], comment: "" },
      ],
    });

    const first = await reviewSubmission(model, CRITERIA, FILES);
    const second = await reviewSubmission(noEvidence, CRITERIA, FILES);

    expect(first.kind === "reviewed" && first.opinions.map((o) => o.verdict)).toEqual(["met", "uncertain"]);
    expect(second.kind === "reviewed" && second.opinions.map((o) => o.verdict)).toEqual(["uncertain", "uncertain"]);
  });

  it("AI가 빠뜨린 채점 항목은 판단 불가로 채우고, 채점 항목 순서대로 돌려준다", async () => {
    const { model } = fakeModel({
      opinions: [{ criterion: 2, verdict: "uncertain", evidence: [], comment: "모르겠다" }],
    });

    const result = await reviewSubmission(model, CRITERIA, FILES);

    expect(result.kind === "reviewed" && result.opinions.map((o) => [o.criterion, o.verdict])).toEqual([
      [1, "uncertain"],
      [2, "uncertain"],
    ]);
  });

  it("모델이 답하지 않거나 호출이 실패하면 실패로 알린다", async () => {
    expect(await reviewSubmission(fakeModel(null).model, CRITERIA, FILES)).toEqual({ kind: "failed" });
    expect(await reviewSubmission(fakeModel({}, { fail: true }).model, CRITERIA, FILES)).toEqual({ kind: "failed" });
  });
});

describe("isSuspicious", () => {
  it("채점 항목 중 하나라도 부족이나 판단 불가면 의심이다", () => {
    const opinion = (verdict: "met" | "not_met" | "uncertain") => ({ criterion: 1, verdict, evidence: [], comment: "" });

    expect(isSuspicious([opinion("met"), opinion("met")])).toBe(false);
    expect(isSuspicious([opinion("met"), opinion("not_met")])).toBe(true);
    expect(isSuspicious([opinion("uncertain")])).toBe(true);
  });
});

describe("draftCriteria", () => {
  it("이름이 빈 항목은 빼고, 배점은 0~1000 정수로 맞추고, 50개까지만 돌려준다", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `항목 ${i}`, points: 1, description: "" }));
    const { model } = fakeModel({
      criteria: [
        { name: "  insert 동작 ", points: 30.4, description: " 맨 앞 " },
        { name: "   ", points: 10, description: "" },
        { name: "보너스", points: 5000, description: "" },
        ...many,
      ],
    });

    const draft = await draftCriteria(model, "연결 리스트를 구현하시오.");

    expect(draft?.slice(0, 2)).toEqual([
      { name: "insert 동작", points: 30, description: "맨 앞" },
      { name: "보너스", points: 1000, description: "" },
    ]);
    expect(draft).toHaveLength(50);
  });

  it("과제 설명이 너무 길거나 모델이 답하지 않으면 초안이 없다", async () => {
    expect(await draftCriteria(fakeModel(null, { tokens: INPUT_TOKEN_LIMIT + 1 }).model, "긴 설명")).toBeNull();
    expect(await draftCriteria(fakeModel(null).model, "설명")).toBeNull();
  });
});
