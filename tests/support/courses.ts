import { randomUUID } from "node:crypto";
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
