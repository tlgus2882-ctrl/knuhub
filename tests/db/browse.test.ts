import { describe, expect, it } from "vitest";
import { openTestCourse, postTestAssignment } from "../support/courses";
import { anonClient, createTestUser } from "../support/supabase";

describe("학기·과목·과제 탐색", () => {
  it("수강생이 아닌 사용자도 모든 학기의 과목 목록과 과목의 과제 목록을 본다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const lastTerm = await openTestCourse(professor, { semester: "2026-1" });
    const thisTerm = await openTestCourse(professor, { semester: "2026-2" });
    const assignmentId = await postTestAssignment(professor, thisTerm.id);
    const stranger = await createTestUser();

    const { data: courses } = await stranger.client
      .from("course")
      .select("id, semester, professor:profile!course_professor_id_fkey(name)")
      .in("id", [lastTerm.id, thisTerm.id])
      .order("semester");
    const { data: assignments } = await stranger.client.from("assignment").select("id").eq("course_id", thisTerm.id);

    expect(courses?.map((c) => [c.id, c.semester, c.professor?.name])).toEqual([
      [lastTerm.id, "2026-1", professor.name],
      [thisTerm.id, "2026-2", professor.name],
    ]);
    expect(assignments?.map((a) => a.id)).toEqual([assignmentId]);
  });

  it("로그인하지 않은 사람은 과목과 과제 목록을 볼 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    await postTestAssignment(professor, course.id);

    const { data: courses } = await anonClient().from("course").select("id").eq("id", course.id);
    const { data: assignments } = await anonClient().from("assignment").select("id").eq("course_id", course.id);

    expect(courses ?? []).toEqual([]);
    expect(assignments ?? []).toEqual([]);
  });
});
