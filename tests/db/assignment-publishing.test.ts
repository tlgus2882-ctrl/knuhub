import { describe, expect, it } from "vitest";
import { attachFile, downloadAttachment } from "../support/assignment-files";
import { closeAndGrade, enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { download, submitFiles, uploadAttempt } from "../support/submissions";
import { anonClient, createTestUser, type TestUser } from "../support/supabase";

async function publishingSetup(published: boolean) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [student, assistant, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  for (const user of [student, assistant]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id, { published, visibility: "campus" });
  return { professor, student, assistant, outsider, course, assignmentId };
}

async function sees(user: TestUser, assignmentId: string) {
  const { data } = await user.client.from("assignment").select("id").eq("id", assignmentId);
  return (data ?? []).length === 1;
}

describe("과제 공개 여부", () => {
  it("공개 여부를 정하지 않으면 공개 과제가 된다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const assignmentId = await postTestAssignment(professor, course.id);

    const { data } = await professor.client.from("assignment").select("published").eq("id", assignmentId).single();

    expect(data?.published).toBe(true);
  });

  it("비공개 과제는 그 과목의 담당 교수와 조교만 본다", async () => {
    const { professor, assistant, student, outsider, assignmentId } = await publishingSetup(false);

    expect(await sees(professor, assignmentId)).toBe(true);
    expect(await sees(assistant, assignmentId)).toBe(true);
    expect(await sees(student, assignmentId)).toBe(false);
    expect(await sees(outsider, assignmentId)).toBe(false);
  });

  it("공개로 바꾸면 수강생과 다른 사용자에게 보이고, 다시 비공개로 바꾸면 보이지 않는다", async () => {
    const { professor, student, outsider, assignmentId } = await publishingSetup(false);

    await professor.client.from("assignment").update({ published: true }).eq("id", assignmentId);
    expect(await sees(student, assignmentId)).toBe(true);
    expect(await sees(outsider, assignmentId)).toBe(true);

    await professor.client.from("assignment").update({ published: false }).eq("id", assignmentId);
    expect(await sees(student, assignmentId)).toBe(false);
  });

  it("조교도 공개 여부를 바꿀 수 있고, 학생은 바꿀 수 없다", async () => {
    const { assistant, student, assignmentId } = await publishingSetup(false);

    const byStudent = await student.client.from("assignment").update({ published: true }).eq("id", assignmentId).select("id");
    const byAssistant = await assistant.client.from("assignment").update({ published: true }).eq("id", assignmentId).select("id");

    expect(byStudent.data ?? []).toEqual([]);
    expect(byAssistant.data).toHaveLength(1);
  });

  it("비공개 과제에는 제출할 수 없다", async () => {
    const { student, assignmentId } = await publishingSetup(false);

    const upload = await uploadAttempt(student, assignmentId, [{ path: "a.txt", body: "a" }]);
    const submit = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);

    expect(upload.error).not.toBeNull();
    expect(submit.error).not.toBeNull();
  });

  it("비공개 과제의 첨부파일은 수강생이 목록에서도 파일로도 받을 수 없다", async () => {
    const { professor, student, assignmentId } = await publishingSetup(false);
    const { error, storagePath } = await attachFile(professor, assignmentId, "안내.txt", "미리 올린 자료");

    expect(error).toBeNull();
    const { data } = await student.client.from("assignment_file").select("id").eq("assignment_id", assignmentId);
    expect(data).toEqual([]);
    expect(await downloadAttachment(student, storagePath)).toBeNull();
    expect(await downloadAttachment(professor, storagePath)).toBe("미리 올린 자료");
  });

  it("비공개로 바꾸면 이미 낸 제출물도 수강생 쪽 검색과 목록에서 사라진다", async () => {
    const { professor, student, assignmentId } = await publishingSetup(true);
    await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);

    await professor.client.from("assignment").update({ published: false }).eq("id", assignmentId);

    const { data: results } = await student.client.rpc("search", { query: student.studentNumber! });
    expect((results ?? []).filter((r) => r.assignment_id === assignmentId)).toEqual([]);
    const { data: professorResults } = await professor.client.rpc("search", { query: student.studentNumber! });
    expect((professorResults ?? []).some((r) => r.assignment_id === assignmentId)).toBe(true);
  });

  it("마감 후 전체 공개였던 과제를 비공개로 바꾸면 다른 사람은 제출물과 파일을 볼 수 없다", async () => {
    const { professor, student, assistant, outsider, assignmentId } = await publishingSetup(true);
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "제출한 코드" }]);
    await closeAndGrade(professor, assignmentId);
    const submissionsSeenBy = async (user: TestUser) => {
      const { data } = await user.client.from("submission").select("id").eq("assignment_id", assignmentId);
      return (data ?? []).length;
    };
    expect(await submissionsSeenBy(outsider)).toBe(1);

    await professor.client.from("assignment").update({ published: false }).eq("id", assignmentId);

    expect(await submissionsSeenBy(outsider)).toBe(0);
    expect(await download(outsider, storagePaths[0])).toBeNull();
    expect(await submissionsSeenBy(assistant)).toBe(1);
    expect(await download(professor, storagePaths[0])).toBe("제출한 코드");
  });

  it("로그인하지 않으면 공개 과제도 볼 수 없다", async () => {
    const { assignmentId } = await publishingSetup(true);

    const { data } = await anonClient().from("assignment").select("id").eq("id", assignmentId);

    expect(data ?? []).toEqual([]);
  });
});
