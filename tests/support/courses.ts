import { randomUUID } from "node:crypto";
import type { Visibility } from "../../src/app/courses/visibility";
import type { TestUser } from "./supabase";

export type TestCourse = { id: string; name: string; semester: string; section: string };

/** Opens a course as `professor` with a unique name, returning its row. */
export async function openTestCourse(
  professor: TestUser,
  overrides: Partial<Omit<TestCourse, "id">> = {},
): Promise<TestCourse> {
  const { data, error } = await professor.client
    .from("course")
    .insert({
      name: `테스트과목-${randomUUID().slice(0, 8)}`,
      semester: "2026-2",
      section: "01",
      ...overrides,
    })
    .select("id, name, semester, section")
    .single();
  if (error) throw error;
  return data;
}

/** The course's invite code, read as its professor. */
export async function inviteCodeOf(professor: TestUser, courseId: string): Promise<string> {
  const { data, error } = await professor.client
    .from("course_invite")
    .select("invite_code")
    .eq("course_id", courseId)
    .single();
  if (error) throw error;
  return data.invite_code;
}

/** Signs `student` up to the course with its invite code. */
export async function enrollInTestCourse(
  student: TestUser,
  professor: TestUser,
  courseId: string,
): Promise<void> {
  const code = await inviteCodeOf(professor, courseId);
  const { error } = await student.client.rpc("join_course", { code });
  if (error) throw error;
}

/** An ISO timestamp `days` from now (negative for the past). */
export const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

/** Posts an assignment as `professor`, due in a week unless overridden; returns its id. */
export async function postTestAssignment(
  professor: TestUser,
  courseId: string,
  fields: { due_at?: string; visibility?: Visibility } = {},
): Promise<string> {
  const { data, error } = await professor.client
    .from("assignment")
    .insert({ course_id: courseId, title: "1주차 과제", due_at: inDays(7), ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
