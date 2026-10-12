import { describe, expect, it } from "vitest";
import { enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { createTestUser, type TestUser } from "../support/supabase";

async function statusSetup() {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [submitter, slacker, assistant] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  for (const student of [submitter, slacker, assistant]) await enrollInTestCourse(student, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id);
  return { professor, submitter, slacker, assistant, assignmentId };
}

async function statusAs(user: TestUser, assignmentId: string) {
  return user.client.rpc("submission_status", { target_assignment: assignmentId });
}

async function rowFor(viewer: TestUser, assignmentId: string, student: TestUser) {
  const { data } = await statusAs(viewer, assignmentId);
  return data?.find((row) => row.student_id === student.id);
}

describe("제출 현황", () => {
  it("담당 교수는 미제출자를 포함한 모든 수강생의 제출 여부와 제출 시각을 본다", async () => {
    const { professor, submitter, slacker, assistant, assignmentId } = await statusSetup();
    await submitFiles(submitter, assignmentId, [{ path: "a.txt", body: "a" }]);

    const { data, error } = await statusAs(professor, assignmentId);

    expect(error).toBeNull();
    const byStudent = new Map(data!.map((row) => [row.student_id, row]));
    expect([...byStudent.keys()].sort()).toEqual([submitter.id, slacker.id, assistant.id].sort());
    expect(byStudent.get(submitter.id)).toMatchObject({ name: submitter.name, student_number: submitter.studentNumber });
    expect(byStudent.get(submitter.id)?.submitted_at).toBeTruthy();
    expect(byStudent.get(submitter.id)?.submission_id).toBeTruthy();
    expect(byStudent.get(slacker.id)).toMatchObject({ submitted_at: null, submission_id: null });
  });

  it("제출 시각은 마지막으로 다시 제출한 시각이다", async () => {
    const { professor, submitter, assignmentId } = await statusSetup();
    await submitFiles(submitter, assignmentId, [{ path: "a.txt", body: "v1" }]);
    const first = await rowFor(professor, assignmentId, submitter);

    await submitFiles(submitter, assignmentId, [{ path: "a.txt", body: "v2" }]);
    const { data: mine } = await submitter.client
      .from("submission")
      .select("submitted_at")
      .eq("assignment_id", assignmentId)
      .single();

    const latest = await rowFor(professor, assignmentId, submitter);
    expect(Date.parse(latest!.submitted_at)).toBeGreaterThan(Date.parse(first!.submitted_at));
    expect(Date.parse(latest!.submitted_at)).toBe(Date.parse(mine!.submitted_at));
  });

  it("그 과목의 조교도 제출 현황을 본다", async () => {
    const { assistant, assignmentId } = await statusSetup();

    const { data, error } = await statusAs(assistant, assignmentId);

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });

  it("학생, 다른 과목의 교수·조교, 수강생이 아닌 사용자는 제출 현황을 볼 수 없다", async () => {
    const { slacker, assignmentId } = await statusSetup();
    const other = await statusSetup(); // another course with its own professor and assistant
    const outsider = await createTestUser();

    for (const user of [slacker, other.professor, other.assistant, outsider]) {
      const { data, error } = await statusAs(user, assignmentId);
      expect(error?.code).toBe("42501");
      expect(data).toBeNull();
    }
  });

  it("없는 과제를 물으면 권한 없음과 똑같이 거부한다 (과제가 있는지 드러내지 않는다)", async () => {
    const { professor } = await statusSetup();

    const { error } = await statusAs(professor, "00000000-0000-0000-0000-000000000000");

    expect(error?.code).toBe("42501");
  });
});
