"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { fromKstInputValue } from "@/lib/time";
import { VISIBILITY_LABEL, type Visibility } from "../../visibility";

/** On success, the saved 과제's id: the form then attaches files and opens it. */
export type AssignmentFormState = { error: string | null; assignmentId?: string };

const NOT_ALLOWED = "이 과목의 담당 교수나 조교만 과제를 공지하고 고칠 수 있어요.";

type AssignmentFields = {
  title: string;
  description: string;
  due_at: string;
  visibility: Visibility;
  published: boolean;
};

function readFields(form: FormData): AssignmentFields | { error: string } {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "");
  const due = String(form.get("due_at") ?? "");
  const visibility = String(form.get("visibility") ?? "course");

  const dueAt = fromKstInputValue(due);

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!dueAt) return { error: "마감일을 정해 주세요." };
  if (!Object.hasOwn(VISIBILITY_LABEL, visibility)) return { error: "공개 범위를 골라 주세요." };

  const published = form.get("published") !== "false";

  return { title, description, due_at: dueAt, visibility: visibility as Visibility, published };
}

// Only the course's professor and assistants may write; RLS enforces it (docs/adr/0002).
export async function createAssignment(form: FormData): Promise<AssignmentFormState> {
  const courseId = String(form.get("course_id"));
  const fields = readFields(form);
  if ("error" in fields) return fields;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assignment")
    .insert({ course_id: courseId, ...fields })
    .select("id")
    .single();

  if (error) return { error: NOT_ALLOWED };

  return { error: null, assignmentId: data.id };
}

export async function updateAssignment(form: FormData): Promise<AssignmentFormState> {
  const courseId = String(form.get("course_id"));
  const assignmentId = String(form.get("assignment_id"));
  const fields = readFields(form);
  if ("error" in fields) return fields;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assignment")
    .update(fields)
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .select("id");

  if (error || !data?.length) return { error: NOT_ALLOWED };

  return { error: null, assignmentId };
}
