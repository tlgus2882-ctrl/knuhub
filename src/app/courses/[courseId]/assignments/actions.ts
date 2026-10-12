"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fromKstInputValue } from "@/lib/time";
import { VISIBILITY_LABEL, type Visibility } from "../../visibility";

export type AssignmentFormState = { error: string | null };

type AssignmentFields = {
  title: string;
  description: string;
  due_at: string;
  visibility: Visibility;
};

function readFields(form: FormData): AssignmentFields | { error: string } {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "");
  const due = String(form.get("due_at") ?? "");
  const visibility = String(form.get("visibility") ?? "course");

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!due) return { error: "마감일을 정해 주세요." };
  if (!(visibility in VISIBILITY_LABEL)) return { error: "공개 범위를 골라 주세요." };

  return { title, description, due_at: fromKstInputValue(due), visibility: visibility as Visibility };
}

// Only the course's professor and assistants may write; RLS enforces it (docs/adr/0002).
export async function createAssignment(
  _prev: AssignmentFormState,
  form: FormData,
): Promise<AssignmentFormState> {
  const courseId = String(form.get("course_id"));
  const fields = readFields(form);
  if ("error" in fields) return fields;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assignment")
    .insert({ course_id: courseId, ...fields })
    .select("id")
    .single();

  if (error) return { error: "과제를 만들지 못했어요. 이 과목의 교수나 조교인지 확인해 주세요." };

  redirect(`/courses/${courseId}/assignments/${data.id}`);
}

export async function updateAssignment(
  _prev: AssignmentFormState,
  form: FormData,
): Promise<AssignmentFormState> {
  const courseId = String(form.get("course_id"));
  const assignmentId = String(form.get("assignment_id"));
  const fields = readFields(form);
  if ("error" in fields) return fields;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assignment")
    .update(fields)
    .eq("id", assignmentId)
    .select("id");

  if (error || !data?.length) {
    return { error: "과제를 고치지 못했어요. 이 과목의 교수나 조교인지 확인해 주세요." };
  }

  redirect(`/courses/${courseId}/assignments/${assignmentId}`);
}
