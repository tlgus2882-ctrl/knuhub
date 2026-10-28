import { describe, expect, it } from "vitest";
import { closeAndGrade, enrollInTestCourse, inDays, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

async function setup() {
  const [professor, otherProfessor] = await Promise.all([createTestUser({ role: "professor" }), createTestUser({ role: "professor" })]);
  const [author, assistant, classmate, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser(), createTestUser()]);
  const course = await openTestCourse(professor);
  for (const user of [author, assistant, classmate]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id, { visibility: "course" });
  await submitFiles(author, assignmentId, [{ path: "main.py", body: "print(1)" }]);
  const { data } = await author.client.from("submission").select("id").eq("assignment_id", assignmentId).single();
  return { professor, otherProfessor, author, assistant, classmate, outsider, assignmentId, submissionId: data!.id };
}

const recommend = (user: TestUser, submissionId: string) => user.client.from("recommendation").insert({ submission_id: submissionId });
const recommended = async (viewer: TestUser, submissionId: string) =>
  ((await viewer.client.from("recommendation").select("submission_id").eq("submission_id", submissionId)).data ?? []).length === 1;

describe("교수 추천", () => {
  it("그 과목의 담당 교수·조교만 붙이고 떼며, 학생과 다른 과목 교수는 못 한다", async () => {
    const { professor, otherProfessor, author, assistant, classmate, submissionId } = await setup();

    for (const user of [author, classmate, otherProfessor]) expect((await recommend(user, submissionId)).error).not.toBeNull();
    expect((await recommend(assistant, submissionId)).error).toBeNull();
    // 제출물마다 표시 하나
    expect((await recommend(professor, submissionId)).error?.code).toBe("23505");

    await author.client.from("recommendation").delete().eq("submission_id", submissionId);
    expect(await recommended(professor, submissionId)).toBe(true);
    await professor.client.from("recommendation").delete().eq("submission_id", submissionId);
    expect(await recommended(professor, submissionId)).toBe(false);
  });

  it("표시는 그 제출물을 볼 수 있는 사람에게만 보인다", async () => {
    const { professor, author, classmate, outsider, assignmentId, submissionId } = await setup();
    await recommend(professor, submissionId);

    // 마감 전: 작성자와 교수만 제출물을 본다
    expect(await recommended(author, submissionId)).toBe(true);
    expect(await recommended(classmate, submissionId)).toBe(false);

    await closeAndGrade(professor, assignmentId);
    expect(await recommended(classmate, submissionId)).toBe(true);
    expect(await recommended(outsider, submissionId)).toBe(false);
  });

  it("최근 추천 목록에는 볼 수 있는 제출물 중 일주일 안에 추천된 것만 나온다", async () => {
    const { professor, classmate, assignmentId, submissionId } = await setup();
    await closeAndGrade(professor, assignmentId);
    await recommend(professor, submissionId);
    const recent = async (viewer: TestUser) =>
      ((await viewer.client.rpc("recent_recommendations")).data ?? []).map((r) => r.submission_id).filter((id) => id === submissionId);

    expect(await recent(classmate)).toEqual([submissionId]);

    await adminClient().from("recommendation").update({ created_at: inDays(-8) }).eq("submission_id", submissionId);
    expect(await recent(classmate)).toEqual([]);
    // 표시는 그대로 남는다
    expect(await recommended(classmate, submissionId)).toBe(true);
  });
});
