// 정확도 평가 (#50): runs the 평가 세트 against the real model and writes a report to eval/reports/.
// A manual script, never part of CI: every run calls the model (see eval/README.md).
//
//   npm run eval                       all cases, 3 runs each
//   npm run eval -- --runs 1 --only calc-01,list-02
//   npm run eval -- --labels           only check the 정답 라벨 (no model calls)
//   npm run eval -- --template 박시현   write a blank label file for one annotator
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { reviewModel, reviewModelName } from "../src/lib/ai-review/model";
import { reviewSubmission, type Criterion, type ReviewFile, type TokenUsage, type Verdict } from "../src/lib/ai-review/review";
import { finalLabels, summarize, type CaseRun, type FinalLabels, type LabelSource, type Summary } from "./metrics";

const ROOT = import.meta.dirname;
const VERDICTS: readonly Verdict[] = ["met", "not_met", "uncertain"];

/**
 * USD per million tokens (Anthropic price list, 2026-10); other models report tokens only.
 * shortcut: a hand-kept table, so check the price again before reporting a cost.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

type EvalCase = { id: string; note: string; injection: boolean; intended: Verdict[]; criteria: Criterion[]; files: ReviewFile[] };
type CaseResult = CaseRun & { note: string };

const { values: args } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    only: { type: "string" },
    delay: { type: "string", default: "4000" },
    labels: { type: "boolean", default: false },
    template: { type: "string" },
  },
});

const runs = Number(args.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, not ${args.runs}`);

const cases = loadCases().filter((c) => !args.only || args.only.split(",").includes(c.id));
const intended = Object.fromEntries(cases.map((c) => [c.id, c.intended]));

if (args.template) {
  const file = path.join(ROOT, "labels", `${args.template}.json`);
  if (existsSync(file)) throw new Error(`${file} already exists`);
  writeFileSync(file, JSON.stringify(Object.fromEntries(cases.map((c) => [c.id, []])), null, 2) + "\n");
  console.log(`Wrote ${file}. Fill each case with one verdict per 채점 항목: "met", "not_met" or "uncertain".`);
} else {
  const { annotators, resolved } = loadLabels();
  const labelled = finalLabels(intended, annotators, resolved);
  printLabelStatus(labelled, Object.keys(annotators));
  if (!args.labels) await evaluate(labelled);
}

async function evaluate(labelled: FinalLabels) {
  let lastUsage: TokenUsage = { input: 0, output: 0 };
  const model = reviewModel((usage) => (lastUsage = usage));
  if (!model) throw new Error("No AI key: set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env.local");
  // shortcut: a fixed pause for free-tier rate limits; lower --delay on a paid key.
  const delay = Number(args.delay);
  const modelName = reviewModelName();

  const results: CaseResult[] = [];
  for (const c of cases.filter((c) => labelled.labels[c.id])) {
    const result: CaseResult = {
      caseId: c.id,
      note: c.note,
      injection: c.injection,
      labels: [...labelled.labels[c.id]],
      runs: [],
      usage: [],
      ms: [],
    };
    for (let run = 0; run < runs; run++) {
      if (results.length || run) await new Promise((resolve) => setTimeout(resolve, delay));
      lastUsage = { input: 0, output: 0 };
      const started = performance.now();
      const review = await reviewSubmission(model, c.criteria, c.files);
      result.ms.push(Math.round(performance.now() - started));
      result.usage.push(lastUsage);
      result.runs.push(review.kind === "reviewed" ? review.opinions.map((o) => o.verdict) : null);
      console.log(`${c.id} #${run + 1}: ${result.runs.at(-1)?.join(" ") ?? review.kind}`);
    }
    results.push(result);
  }

  const summary = summarize(results);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const dir = path.join(ROOT, "reports");
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${stamp}-${modelName.replace(/[^\w.-]/g, "-")}`);
  const left = labelled.disagreements.map((d) => d.caseId);
  writeFileSync(`${base}.json`, JSON.stringify({ model: modelName, runs, source: labelled.source, left, results, summary }, null, 2) + "\n");
  writeFileSync(`${base}.md`, report(modelName, labelled.source, left, results, summary));
  console.log(`\nWrote ${base}.md`);
}

function loadCases(): EvalCase[] {
  const dir = path.join(ROOT, "cases");
  return readdirSync(dir).sort().map((id) => {
    const meta = JSON.parse(readFileSync(path.join(dir, id, "case.json"), "utf8"));
    const assignment = JSON.parse(readFileSync(path.join(ROOT, "assignments", `${meta.assignment}.json`), "utf8"));
    const files = listFiles(path.join(dir, id)).filter((p) => p !== "case.json");
    return {
      id,
      note: meta.note,
      injection: meta.injection,
      intended: meta.intended,
      criteria: assignment.criteria,
      files: files.map((p) => ({ path: p, text: readFileSync(path.join(dir, id, p), "utf8") })),
    };
  });
}

function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) =>
    statSync(path.join(dir, name)).isDirectory() ? listFiles(path.join(dir, name), `${prefix}${name}/`) : [`${prefix}${name}`],
  );
}

/** eval/labels/<annotator>.json, plus resolved.json for disagreements settled together. */
function loadLabels() {
  const dir = path.join(ROOT, "labels");
  const read = (name: string): Record<string, Verdict[]> => {
    const labels = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
    for (const [caseId, verdicts] of Object.entries<string[]>(labels)) {
      const typo = verdicts.find((v) => !VERDICTS.includes(v as Verdict));
      if (typo) throw new Error(`${name} ${caseId}: "${typo}" is not one of ${VERDICTS.join(", ")}`);
    }
    return labels;
  };
  const annotators = Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith(".json") && name !== "resolved.json")
      .map((name) => [name.replace(/\.json$/, ""), read(name)]),
  );
  return { annotators, resolved: existsSync(path.join(dir, "resolved.json")) ? read("resolved.json") : {} };
}

function printLabelStatus(labelled: FinalLabels, annotators: string[]) {
  const count = (source: LabelSource) => Object.values(labelled.source).filter((s) => s === source).length;
  console.log(`정답 라벨 — 라벨 단 사람: ${annotators.join(", ") || "없음"}`);
  console.log(`  두 명 일치 ${count("agreed")}, 논의로 정함 ${count("resolved")}, 출제 의도로 임시 ${count("intended")}, 논의 필요 ${labelled.disagreements.length}`);
  for (const d of labelled.disagreements) console.log(`  논의 필요 ${d.caseId}: ${JSON.stringify(d.byAnnotator)}`);
}

function percent({ part, whole }: { part: number; whole: number }) {
  return whole ? `${((part / whole) * 100).toFixed(1)}% (${part}/${whole})` : "해당 없음";
}

function report(model: string, source: Record<string, LabelSource>, left: string[], results: CaseResult[], s: Summary) {
  const price = PRICES[model];
  const cost = price
    ? `$${((s.perCall.input * price.input + s.perCall.output * price.output) / 1e6).toFixed(5)}`
    : "가격 정보 없음 (무료 등급이거나 가격표에 없는 모델)";
  const intendedCount = Object.values(source).filter((v) => v === "intended").length;
  const verdictMark = { met: "충족", not_met: "부족", uncertain: "판단 불가" } as const;

  return [
    `# 정확도 평가 보고서`,
    ``,
    `- 모델: \`${model}\`, 사례 ${results.length}건 × ${runs}회, ${new Date().toISOString().slice(0, 10)}`,
    intendedCount
      ? `- ⚠️ 정답 라벨이 아직 확정되지 않은 사례 ${intendedCount}건은 출제 의도를 임시 정답으로 썼어요. 2명이 따로 라벨을 단 뒤 다시 돌려 주세요.`
      : `- 정답 라벨: 2명이 따로 표시하고 다르면 논의해서 정함`,
    ...(left.length ? [`- ⚠️ 두 사람의 라벨이 달라 아직 논의 중인 사례 ${left.length}건은 빠졌어요: ${left.join(", ")}`] : []),
    `- 비율은 답을 받은 실행만으로 계산해요 (실패한 실행은 따로 셈). 반복 실행 일관성은 답을 두 번 이상 받은 항목만 봐요.`,
    ``,
    `| 지표 | 값 |`,
    `|---|---|`,
    `| 항목별 일치율 (목표 80%) | ${percent({ part: s.agreement.matched, whole: s.agreement.total })} |`,
    `| 결함 검출률 (부족을 부족으로) | ${percent({ part: s.defectDetection.detected, whole: s.defectDetection.total })} |`,
    `| 결함이 의심으로 걸린 비율 (부족·판단 불가) | ${percent({ part: s.defectDetection.flagged, whole: s.defectDetection.total })} |`,
    `| 반복 실행 일관성 | ${percent({ part: s.consistency.stable, whole: s.consistency.total })} |`,
    `| 인젝션 방어율 | ${percent({ part: s.injectionDefense.defended, whole: s.injectionDefense.total })} |`,
    `| 실패한 실행 | ${s.failedRuns} / ${s.failedRuns + s.perCall.calls} |`,
    `| 건당 토큰 (입력 / 출력) | ${s.perCall.input} / ${s.perCall.output} |`,
    `| 건당 응답 시간 | ${(s.perCall.ms / 1000).toFixed(1)}초 |`,
    `| 건당 비용 | ${cost} |`,
    ``,
    `## 사례별`,
    ``,
    `| 사례 | 설명 | 정답 | 실행 결과 |`,
    `|---|---|---|---|`,
    ...results.map((r) => {
      const label = r.labels.map((v) => verdictMark[v]).join(", ");
      const runsText = r.runs
        .map((run) => (run ? run.map((v, i) => (v === r.labels[i] ? verdictMark[v] : `**${verdictMark[v]}**`)).join(", ") : "실패"))
        .join(" / ");
      return `| ${r.caseId}${r.injection ? " (인젝션)" : ""} | ${r.note} | ${label} | ${runsText} |`;
    }),
    ``,
    `굵은 글씨는 정답과 다른 판정이에요.`,
    ``,
  ].join("\n");
}
