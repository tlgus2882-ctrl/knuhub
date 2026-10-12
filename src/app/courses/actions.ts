"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export type CourseFormState = { error: string | null };

const UNIQUE_VIOLATION = "23505";
// Raised by join_course() in the course migration.
const JOIN_ERRORS: Record<string, string> = {
  KH001: "학생만 초대 코드로 과목에 참여할 수 있어요.",
  KH002: "초대 코드가 맞지 않아요. 교수님께 받은 코드를 다시 확인해 주세요.",
};

// Who may open or join a course is decided by RLS and join_course() (docs/adr/0002).
export async function openCourse(_prev: CourseFormState, form: FormData): Promise<CourseFormState> {
  const name = String(form.get("name") ?? "").trim();
  const semester = String(form.get("semester") ?? "").trim();
  const section = String(form.get("section") ?? "").trim();

  if (!name || !semester || !section) {
    return { error: "과목명, 학기, 분반을 모두 입력해 주세요." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("course")
    .insert({ name, semester, section })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: "같은 과목명, 학기, 분반으로 이미 연 과목이 있어요." };
    }
    return { error: "과목을 열지 못했어요. 교수 권한이 있는지 확인해 주세요." };
  }

  redirect(`/courses/${data.id}`);
}

export async function joinCourse(_prev: CourseFormState, form: FormData): Promise<CourseFormState> {
  const code = String(form.get("code") ?? "");

  const supabase = await createServerSupabase();
  const { data: courseId, error } = await supabase.rpc("join_course", { code });

  if (error || !courseId) {
    return { error: JOIN_ERRORS[error?.code ?? ""] ?? "과목에 참여하지 못했어요. 다시 시도해 주세요." };
  }

  redirect(`/courses/${courseId}`);
}

// Roster management for the course's professor. RLS and the DB functions
// refuse anyone else, so these only pass the request through.
export async function removeStudent(form: FormData) {
  const courseId = String(form.get("course_id"));
  const studentId = String(form.get("student_id"));

  const supabase = await createServerSupabase();
  await supabase.from("enrollment").delete().eq("course_id", courseId).eq("student_id", studentId);
  refresh();
}

export async function setAssistant(form: FormData) {
  const courseId = String(form.get("course_id"));
  const userId = String(form.get("user_id"));
  const makeAssistant = form.get("assistant") === "true";

  const supabase = await createServerSupabase();
  if (makeAssistant) {
    await supabase.from("course_assistant").insert({ course_id: courseId, user_id: userId });
  } else {
    await supabase.from("course_assistant").delete().eq("course_id", courseId).eq("user_id", userId);
  }
  refresh();
}

export async function regenerateInviteCode(form: FormData) {
  const courseId = String(form.get("course_id"));

  const supabase = await createServerSupabase();
  await supabase.rpc("regenerate_invite_code", { target_course: courseId });
  refresh();
}
