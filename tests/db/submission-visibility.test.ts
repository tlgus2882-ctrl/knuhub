import { describe, expect, it } from "vitest";
import type { Visibility } from "../../src/app/courses/visibility";
import { enrollInTestCourse, inDays, openTestCourse, postTestAssignment } from "../support/courses";
import { download, submitFiles } from "../support/submissions";
import { createTestUser, type TestUser } from "../support/supabase";

/** A course with every kind of viewer, and one 제출물 submitted before the 마감일. */
async function submittedSetup(visibility: Visibility) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [author, classmate, assistant, outsider, otherProfessor] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser({ role: "professor" }),
  ]);
  for (const student of [author, classmate, assistant]) await enrollInTestCourse(student, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });

  const assignmentId = await postTestAssignment(professor, course.id, { visibility });

  const { storagePaths } = await submitFiles(author, assignmentId, [{ path: "main.py", body: "print(1)" }]);

  const update = async (fields: { due_at?: string; visibility?: Visibility; graded_at?: string | null }) => {
    const { error } = await professor.client.from("assignment").update(fields).eq("id", assignmentId);
    if (error) throw error;
  };

  /** Whether `user` sees the 제출물 row, its file list and the file itself. All three must agree. */
  const sees = async (user: TestUser) => {
    const { data: rows } = await user.client.from("submission").select("id").eq("assignment_id", assignmentId);
    const { data: files } = await user.client.from("submission_file").select("storage_path").in("storage_path", storagePaths);
    const content = await download(user, storagePaths[0]);
    const seen = [rows?.length === 1, files?.length === 1, content === "print(1)"];
    expect(new Set(seen).size, "row, file list and Storage disagree").toBe(1);
    return seen[0];
  };

  const viewers = { professor, assistant, author, classmate, outsider, otherProfessor };
  /** Names of the viewers who see the 제출물 right now. */
  const whoSees = async () => {
    const names: string[] = [];
    for (const [name, user] of Object.entries(viewers)) if (await sees(user)) names.push(name);
    return names;
  };

  /** Closes the 과제 and marks it 채점 완료. */
  const closeAndGrade = () => update({ due_at: inDays(-1), graded_at: new Date().toISOString() });

  return { ...viewers, assignmentId, update, closeAndGrade, whoSees };
}

describe("제출물 열람", () => {
  it("마감 전에는 공개 범위와 상관없이 작성자 본인과 담당 교수·조교만 본다", async () => {
    const { whoSees } = await submittedSetup("campus");

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("마감이 지나도 채점 완료 전에는 작성자 본인과 담당 교수·조교만 본다", async () => {
    const { update, whoSees } = await submittedSetup("campus");
    await update({ due_at: inDays(-1) });

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("채점 완료를 취소하면 공개된 제출물이 다시 숨겨진다", async () => {
    const { update, closeAndGrade, whoSees } = await submittedSetup("campus");
    await closeAndGrade();

    await update({ graded_at: null });

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("조교는 채점 완료를 표시하고, 학생은 표시할 수 없다", async () => {
    const { assistant, author, assignmentId, update, whoSees } = await submittedSetup("campus");
    await update({ due_at: inDays(-1) });
    const markGraded = (user: TestUser) =>
      user.client.from("assignment").update({ graded_at: new Date().toISOString() }).eq("id", assignmentId).select("id");

    expect((await markGraded(author)).data ?? []).toEqual([]);
    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);

    expect((await markGraded(assistant)).data).toHaveLength(1);
    expect(await whoSees()).toEqual(["professor", "assistant", "author", "classmate", "outsider", "otherProfessor"]);
  });

  it("채점 완료 후 비공개면 교수·조교와 작성자만 본다", async () => {
    const { closeAndGrade, whoSees } = await submittedSetup("private");
    await closeAndGrade();

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("채점 완료 후 수강생 공개면 그 과목 수강생까지 본다", async () => {
    const { closeAndGrade, whoSees } = await submittedSetup("course");
    await closeAndGrade();

    expect(await whoSees()).toEqual(["professor", "assistant", "author", "classmate"]);
  });

  it("채점 완료 후 학내 공개면 모든 사용자가 본다", async () => {
    const { closeAndGrade, whoSees } = await submittedSetup("campus");
    await closeAndGrade();

    expect(await whoSees()).toEqual(["professor", "assistant", "author", "classmate", "outsider", "otherProfessor"]);
  });

  it("공개 범위를 좁히거나 넓히면 바로 반영된다", async () => {
    const { update, closeAndGrade, whoSees } = await submittedSetup("campus");
    await closeAndGrade();

    await update({ visibility: "private" });
    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);

    await update({ visibility: "course" });
    expect(await whoSees()).toEqual(["professor", "assistant", "author", "classmate"]);
  });

  it("마감을 연장하면 공개된 제출물이 다시 숨겨지고 재제출할 수 있다", async () => {
    const { author, classmate, outsider, professor, assignmentId, update, closeAndGrade, whoSees } = await submittedSetup("campus");
    await closeAndGrade();

    await update({ due_at: inDays(1) });

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
    const { error } = await submitFiles(author, assignmentId, [{ path: "main.py", body: "print(2)" }]);
    expect(error).toBeNull();

    // 연장하면 채점 완료가 풀려서, 새 마감이 지나도 다시 채점 완료를 눌러야 공개된다.
    // 재제출로 처음 파일은 제출 이력으로 옮겨졌으니 whoSees()의 파일 비교 대신 제출물 행으로 본다.
    await update({ due_at: inDays(-1) });
    const seesRow = async (user: TestUser) =>
      ((await user.client.from("submission").select("id").eq("assignment_id", assignmentId)).data ?? []).length === 1;
    expect(await Promise.all([author, professor, classmate, outsider].map(seesRow))).toEqual([true, true, false, false]);
  });
});
