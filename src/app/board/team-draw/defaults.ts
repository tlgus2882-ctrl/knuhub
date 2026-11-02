import type { Question } from "@/lib/team-draw/form-teams";

/** The 설문 a new 팀 추첨 starts with; the professor may change any of it. */
export const DEFAULT_QUESTIONS: Question[] = [
  { title: "코딩 역량", kind: "choice", options: ["상", "중", "하"] },
  { title: "성격", kind: "choice", options: ["소심한 편", "활발한 편"] },
  { title: "자신의 강점", kind: "text" },
];

export const DEFAULT_CRITERIA = "팀마다 코딩 역량이 고르게 섞이고, 소심한 사람과 활발한 사람이 섞이며, 서로의 강점이 보완되게 나눠 주세요.";

export const DEFAULT_TEAM_SIZE = 4;
