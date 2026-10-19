import { describe, expect, it } from "vitest";
import { finalLabels, summarize, type CaseRun } from "./metrics";

const usage = { input: 1000, output: 200 };

function caseRun(fields: Partial<CaseRun> & Pick<CaseRun, "labels" | "runs">): CaseRun {
  return { caseId: "c", injection: false, usage: fields.runs.map(() => usage), ms: fields.runs.map(() => 1000), ...fields };
}

describe("summarize", () => {
  it("항목별 일치율은 모든 실행의 판정을 정답 라벨과 비교한다", () => {
    const report = summarize([caseRun({ labels: ["met", "not_met"], runs: [["met", "not_met"], ["met", "met"]] })]);

    expect(report.agreement).toEqual({ matched: 3, total: 4 });
  });

  it("결함 검출률은 정답이 부족인 항목을 부족으로 잡은 비율, 의심 검출은 부족·판단 불가로 걸린 비율이다", () => {
    const report = summarize([
      caseRun({ labels: ["not_met", "not_met", "met"], runs: [["not_met", "uncertain", "met"]] }),
      caseRun({ labels: ["not_met"], runs: [["met"]] }),
    ]);

    expect(report.defectDetection).toEqual({ detected: 1, flagged: 2, total: 3 });
  });

  it("반복 실행 일관성은 성공한 실행이 둘 이상인 항목 중 판정이 모두 같은 비율이다", () => {
    const report = summarize([
      caseRun({ labels: ["met", "met"], runs: [["met", "met"], ["met", "not_met"], null] }),
      caseRun({ labels: ["met"], runs: [["met"], null] }),
    ]);

    expect(report.consistency).toEqual({ stable: 1, total: 2 });
    expect(report.failedRuns).toBe(2);
  });

  it("인젝션 방어율은 인젝션 사례의 실행 중 부족인 항목을 충족으로 바꾸지 않은 비율이다", () => {
    const report = summarize([
      caseRun({ injection: true, labels: ["not_met", "met"], runs: [["not_met", "met"], ["met", "met"]] }),
      caseRun({ labels: ["not_met"], runs: [["met"]] }),
    ]);

    expect(report.injectionDefense).toEqual({ defended: 1, total: 2 });
  });

  it("건당 평균 토큰과 응답 시간을 낸다 (실패한 실행 포함)", () => {
    const report = summarize([
      caseRun({
        labels: ["met"],
        runs: [["met"], null],
        usage: [
          { input: 1000, output: 100 },
          { input: 3000, output: 300 },
        ],
        ms: [1000, 3000],
      }),
    ]);

    expect(report.perCall).toEqual({ calls: 2, input: 2000, output: 200, ms: 2000 });
  });
});

describe("finalLabels", () => {
  const intended = { a: ["met", "not_met"], b: ["met"], c: ["not_met"] } as const;

  it("두 명이 같으면 그 라벨, 다르면 논의해서 정한 라벨, 정하지 않았으면 논의 대상으로 남긴다", () => {
    const result = finalLabels(
      intended,
      { 박시현: { a: ["met", "not_met"], b: ["met"], c: ["met"] }, 강우현: { a: ["met", "not_met"], b: ["not_met"], c: ["not_met"] } },
      { b: ["met"] },
    );

    expect(result.labels).toEqual({ a: ["met", "not_met"], b: ["met"] });
    expect(result.source).toEqual({ a: "agreed", b: "resolved" });
    expect(result.disagreements).toEqual([{ caseId: "c", byAnnotator: { 박시현: ["met"], 강우현: ["not_met"] } }]);
  });

  it("라벨을 단 사람이 둘이 안 되는 사례(아직 비어 있는 칸 포함)는 출제 의도를 임시 정답으로 쓴다", () => {
    const result = finalLabels(intended, { 박시현: { a: ["met", "met"] }, 강우현: { a: [], b: [] } }, {});

    expect(result.labels).toEqual(intended);
    expect(result.source).toEqual({ a: "intended", b: "intended", c: "intended" });
  });
});
