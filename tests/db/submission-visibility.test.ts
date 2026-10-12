import { describe, expect, it } from "vitest";
import { enrollInTestCourse, openTestCourse } from "../support/courses";
import { download, submitFiles } from "../support/submissions";
import { createTestUser, type TestUser } from "../support/supabase";

type Visibility = "private" | "course" | "campus";

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

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

  const { data: assignment, error } = await professor.client
    .from("assignment")
    .insert({ course_id: course.id, title: "1주차 과제", due_at: inDays(7), visibility })
    .select("id")
    .single();
  if (error) throw error;

  const { storagePaths } = await submitFiles(author, assignment.id, [{ path: "main.py", body: "print(1)" }]);

  const update = async (fields: { due_at?: string; visibility?: Visibility }) => {
    const { error } = await professor.client.from("assignment").update(fields).eq("id", assignment.id);
    if (error) throw error;
  };

  /** Whether `user` sees the 제출물 row, its file list and the file itself. All three must agree. */
  const sees = async (user: TestUser) => {
    const { data: rows } = await user.client.from("submission").select("id").eq("assignment_id", assignment.id);
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

  return { ...viewers, assignmentId: assignment.id, update, whoSees };
}

describe("제출물 열람", () => {
  it("마감 전에는 공개 범위와 상관없이 작성자 본인과 담당 교수·조교만 본다", async () => {
    const { whoSees } = await submittedSetup("campus");

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("마감 후 비공개면 교수·조교와 작성자만 본다", async () => {
    const { update, whoSees } = await submittedSetup("private");
    await update({ due_at: inDays(-1) });

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("마감 후 수강생 공개면 그 과목 수강생까지 본다", async () => {
    const { update, whoSees } = await submittedSetup("course");
    await update({ due_at: inDays(-1) });

    expect(await whoSees()).toEqual(["professor", "assistant", "author", "classmate"]);
  });

  it("마감 후 학내 공개면 모든 사용자가 본다", async () => {
    const { update, whoSees } = await submittedSetup("campus");
    await update({ due_at: inDays(-1) });

    expect(await whoSees()).toEqual(["professor", "assistant", "author", "classmate", "outsider", "otherProfessor"]);
  });

  it("공개 범위를 바꾸면 바로 반영된다", async () => {
    const { update, whoSees } = await submittedSetup("campus");
    await update({ due_at: inDays(-1) });

    await update({ visibility: "private" });

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
  });

  it("마감을 연장하면 공개된 제출물이 다시 숨겨지고 재제출할 수 있다", async () => {
    const { author, assignmentId, update, whoSees } = await submittedSetup("campus");
    await update({ due_at: inDays(-1) });

    await update({ due_at: inDays(1) });

    expect(await whoSees()).toEqual(["professor", "assistant", "author"]);
    const { error } = await submitFiles(author, assignmentId, [{ path: "main.py", body: "print(2)" }]);
    expect(error).toBeNull();
  });
});
