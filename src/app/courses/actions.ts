"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export type CourseFormState = { error: string | null };

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
    if (error.code === "23505") {
      return { error: "같은 과목명, 학기, 분반의 과목이 이미 있어요." };
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
    return { error: "초대 코드가 맞지 않아요. 교수님께 받은 코드를 다시 확인해 주세요." };
  }

  redirect(`/courses/${courseId}`);
}
