"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { reviewModel } from "@/lib/ai-review/model";
import { createAdminSupabase, type AdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";
import { formTeams, type Question } from "@/lib/team-draw/form-teams";
import { fromKstInputValue } from "@/lib/time";

export type TeamDrawFormState = { error: string | null; savedAt?: number };

// Raised by the team_draw migration (supabase/migrations/*_team_draw.sql).
const DB_ERRORS: Record<string, string> = {
  KH017: "추첨 중이거나 공개한 팀 추첨이라 바꿀 수 없어요.",
  KH018: "응답이 들어와서 설문 문항은 바꿀 수 없어요. 기간, 팀당 인원, 편성 기준은 바꿀 수 있어요.",
  KH019: "모든 문항에 답해 주세요.",
};

// Who may do what is decided by RLS and the DB functions (docs/adr/0002).
export async function createTeamDraw(_prev: TeamDrawFormState, form: FormData): Promise<TeamDrawFormState> {
  const draw = readDraw(form);
  if (typeof draw === "string") return { error: draw };

  const supabase = await createServerSupabase();
  const { data: postId, error } = await supabase.rpc("create_team_draw", {
    target_course: String(form.get("course_id")),
    title: draw.title,
    body: draw.body,
    mode: draw.mode,
    team_size: draw.team_size,
    criteria: draw.criteria,
    questions: draw.questions,
    survey_due_at: draw.survey_due_at ?? undefined,
  });
  if (error) return failed("createTeamDraw", error, "담당 교수만 팀 추첨을 올릴 수 있어요.");
  redirect(`/board/${postId}`);
}

export async function updateTeamDraw(_prev: TeamDrawFormState, form: FormData): Promise<TeamDrawFormState> {
  const draw = readDraw(form);
  if (typeof draw === "string") return { error: draw };

  const postId = String(form.get("post_id"));
  const supabase = await createServerSupabase();
  const { title, body, mode, team_size, criteria, questions, survey_due_at } = draw;
  // Locked 문항 are not sent, so changing the rest still works.
  const settings = { team_size, criteria, ...(mode === "survey" && { survey_due_at, ...(!form.get("questions_locked") && { questions }) }) };
  const { data, error } = await supabase.from("team_draw").update(settings).eq("post_id", postId).select("post_id");
  if (error || !data?.length) return failed("updateTeamDraw", error, "담당 교수만 공개 전에 설정을 바꿀 수 있어요.");
  const { error: postError } = await supabase.from("post").update({ title, body }).eq("id", postId);
  if (postError) return failed("updateTeamDraw", postError, "제목과 설명을 저장하지 못했어요.");
  redirect(`/board/${postId}`);
}

export async function answerSurvey(_prev: TeamDrawFormState, form: FormData): Promise<TeamDrawFormState> {
  const count = Number(form.get("question_count"));
  const answers = Array.from({ length: count }, (_, i) => String(form.get(`answer-${i}`) ?? "").trim());
  if (answers.some((a) => !a)) return { error: DB_ERRORS.KH019 };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("survey_response").upsert({ post_id: String(form.get("post_id")), answers });
  if (error) return failed("answerSurvey", error, "설문 마감이 지났거나 이 과목 수강생이 아니라서 응답할 수 없어요.");
  refresh();
  return { error: null, savedAt: Date.now() };
}

export type DrawOutcome = { error: string | null };

/**
 * Draws the teams if this call may take the draw (see claim_team_draw()): the professor any time before
 * 공개, anyone in the course once the 설문 마감 has passed. `random` places everyone at random (the
 * professor's fallback when the AI failed). The result waits for the professor to check and 공개.
 */
export async function drawTeams(postId: string, random = false): Promise<DrawOutcome> {
  const supabase = await createServerSupabase();
  const { data: claimedAt, error } = await supabase.rpc("claim_team_draw", { target_post: postId });
  if (error) return failed("claim_team_draw", error, "지금은 추첨할 수 없어요.");
  // Not due yet, or someone else is drawing right now.
  if (!claimedAt) return { error: null };

  // 추첨 대상 with their 설문 응답 come from a server-only DB function, and only the server writes the result.
  const admin = createAdminSupabase();
  // A draw taken over by someone else (or published) meanwhile is left alone by finish_team_draw().
  const finish = (teams: string[][] | null, rationale?: string) =>
    admin.rpc("finish_team_draw", { target_post: postId, claimed_at: claimedAt, teams, rationale });
  try {
    const result = await placePeople(supabase, admin, postId, random);
    const { error: finishError } = await finish(result?.teams ?? null, result?.rationale);
    if (finishError) throw finishError;
    return { error: result ? null : "AI가 팀을 나누지 못했어요. 다시 시도하거나 무작위로 나눠 주세요." };
  } catch (cause) {
    console.error("drawTeams failed", postId, cause);
    await finish(null);
    return { error: "팀을 나누지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }
}

/** The teams as member keys for finish_team_draw(), or null when the AI failed. */
async function placePeople(supabase: ServerSupabase, admin: AdminSupabase, postId: string, random: boolean) {
  const [{ data: draw, error }, { data: people, error: peopleError }] = await Promise.all([
    supabase.from("team_draw").select("mode, team_size, criteria, questions").eq("post_id", postId).single(),
    admin.rpc("team_draw_people", { target_post: postId }),
  ]);
  if (error) throw error;
  if (peopleError) throw peopleError;

  let survey;
  if (draw.mode === "survey" && !random) {
    const model = reviewModel();
    if (!model) return null;
    survey = { model, criteria: draw.criteria, questions: draw.questions as Question[] };
  }
  const result = await formTeams({
    people: people.map((p) => ({ key: p.key, answers: p.answers as string[] | null })),
    teamSize: draw.team_size,
    survey,
  });
  return result.kind === "formed" ? result : null;
}

export async function publishTeamDraw(form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("publish_team_draw", { target_post: String(form.get("post_id")) });
  logIfFailed("publishTeamDraw", error);
  refresh();
}

/** Moves a 팀 member to another team (team_no), which may be a new one. */
export async function moveTeamMember(form: FormData) {
  const teamNo = Number(form.get("team_no"));
  if (!Number.isInteger(teamNo) || teamNo < 1) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("team_member").update({ team_no: teamNo }).eq("id", String(form.get("member_id")));
  logIfFailed("moveTeamMember", error);
  refresh();
}

export async function removeTeamMember(form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("team_member").delete().eq("id", String(form.get("member_id")));
  logIfFailed("removeTeamMember", error);
  refresh();
}

/**
 * Adds someone to the 추첨 대상 or, after the draw, to a team: a 수강생 (user_id) or a name typed in
 * for someone without an account (guest_name). Before the draw only names are kept (team_no empty).
 */
export async function addTeamMember(form: FormData) {
  const teamNo = Number(form.get("team_no")) || null;
  const userId = String(form.get("user_id") ?? "") || null;
  const guestName = String(form.get("guest_name") ?? "").trim() || null;
  if (!userId && !guestName) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("team_member")
    .insert({ post_id: String(form.get("post_id")), course_id: String(form.get("course_id")), team_no: teamNo, user_id: guestName ? null : userId, guest_name: guestName });
  logIfFailed("addTeamMember", error);
  refresh();
}

/** Takes a 수강생 out of the 추첨 대상, or puts them back (`excluded` is the whole new list). */
export async function setExcluded(form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("team_draw")
    .update({ excluded: form.getAll("excluded").map(String) })
    .eq("post_id", String(form.get("post_id")));
  logIfFailed("setExcluded", error);
  refresh();
}

/** The form's 팀 추첨 fields, or what is wrong with them. */
function readDraw(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const mode = form.get("mode") === "random" ? ("random" as const) : ("survey" as const);
  const teamSize = Number(form.get("team_size"));
  const criteria = String(form.get("criteria") ?? "").trim();
  if (!title || !body) return "제목과 설명을 입력해 주세요.";
  if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 50) return "팀당 인원은 2명에서 50명 사이로 정해 주세요.";
  if (mode === "random") return { title, body, mode, team_size: teamSize, criteria: "", questions: [], survey_due_at: null };

  const dueAt = fromKstInputValue(String(form.get("survey_due_at") ?? ""));
  if (!dueAt) return "설문 마감 날짜와 시각을 정해 주세요.";
  let questions: Question[];
  try {
    questions = (JSON.parse(String(form.get("questions") ?? "[]")) as Question[]).map((q) =>
      q.kind === "choice"
        ? { title: q.title.trim(), kind: "choice", options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
        : { title: q.title.trim(), kind: "text" },
    );
  } catch {
    return "설문 문항을 읽지 못했어요.";
  }
  if (!questions.length) return "설문 문항을 하나 이상 넣어 주세요.";
  if (questions.some((q) => !q.title || (q.kind === "choice" && q.options!.length < 2))) {
    return "문항마다 제목을 쓰고, 객관식에는 보기를 두 개 이상 넣어 주세요.";
  }
  return { title, body, mode, team_size: teamSize, criteria, questions, survey_due_at: dueAt };
}

function failed(action: string, error: { code?: string; message: string } | null, message: string): TeamDrawFormState {
  if (error) console.error(`${action} failed`, error.message);
  return { error: DB_ERRORS[error?.code ?? ""] ?? message };
}

function logIfFailed(action: string, error: { message: string } | null) {
  if (error) console.error(`${action} failed`, error.message);
}
