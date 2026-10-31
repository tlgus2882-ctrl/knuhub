"use server";

import { redirect } from "next/navigation";
import { removeObjects } from "@/lib/storage-remove";
import { createAdminSupabase } from "@/lib/supabase/admin";
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
  late_due_at: string | null;
  visibility: Visibility;
  published: boolean;
};

function readFields(form: FormData): AssignmentFields | { error: string } {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "");
  const due = String(form.get("due_at") ?? "");
  const visibility = String(form.get("visibility") ?? "course");

  const dueAt = fromKstInputValue(due);
  const late = String(form.get("late_due_at") ?? "");
  // Empty means no 지각 제출.
  const lateDueAt = late ? fromKstInputValue(late) : null;

  if (!title) return { error: "제목을 입력해 주세요." };
  if (!dueAt) return { error: "마감일을 정해 주세요." };
  if (late && !lateDueAt) return { error: "지각 제출 마감을 정해 주세요." };
  if (lateDueAt && lateDueAt <= dueAt) return { error: "지각 제출 마감은 마감보다 뒤여야 해요." };
  if (!Object.hasOwn(VISIBILITY_LABEL, visibility)) return { error: "공개 범위를 골라 주세요." };

  const published = form.get("published") !== "false";

  return { title, description, due_at: dueAt, late_due_at: lateDueAt, visibility: visibility as Visibility, published };
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

// Raised by delete_assignment() (supabase/migrations/*_late_submission_and_delete.sql).
const DELETE_ERRORS: Record<string, string> = { KH003: "이 과목의 담당 교수나 조교만 과제를 지울 수 있어요." };

/**
 * Deletes the 과제 with its 제출물, 리뷰 and 채점 항목 (delete_assignment() checks who may), then
 * removes the Storage files it listed with the secret key, like 탈퇴 does (docs/adr/0002).
 */
export async function deleteAssignment(courseId: string, assignmentId: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { data: objects, error } = await supabase.rpc("delete_assignment", { target_assignment: assignmentId });
  if (error) {
    console.error("deleteAssignment failed", error.message);
    return { error: DELETE_ERRORS[error.code] ?? "과제를 지우지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }

  // The 과제 is gone now; Storage files are removed per bucket as the DB listed them.
  const admin = createAdminSupabase();
  for (const [bucket, rows] of Map.groupBy(objects, (o) => o.bucket_id)) {
    await removeObjects(admin, bucket, rows.map((o) => o.name), "deleteAssignment");
  }
  redirect(`/courses/${courseId}`);
}
