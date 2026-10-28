import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Visibility } from "../../src/app/courses/visibility";
import { closeAndGrade, enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { anonClient, createTestUser, type TestUser } from "../support/supabase";

async function search(user: TestUser, query: string) {
  const { data, error } = await user.client.rpc("search", { query });
  if (error) throw error;
  return data;
}

/** A submitted 제출물 and the people who may or may not find it. */
async function searchSetup(visibility: Visibility) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [author, classmate, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  for (const student of [author, classmate]) await enrollInTestCourse(student, professor, course.id);
  const assignmentId = await postTestAssignment(professor, course.id, { visibility });
  await submitFiles(author, assignmentId, [{ path: "a.txt", body: "a" }]);
  const closeDeadline = () => closeAndGrade(professor, assignmentId);

  const viewers = { professor, author, classmate, outsider };
  /** Who finds the author's 제출물 by searching for `query`. */
  const whoFinds = async (query: string) => {
    const names: string[] = [];
    for (const [name, user] of Object.entries(viewers)) {
      const results = await search(user, query);
      if (results.some((r) => r.kind === "submission" && r.assignment_id === assignmentId)) names.push(name);
    }
    return names;
  };
  return { ...viewers, assignmentId, closeDeadline, whoFinds };
}

describe("검색", () => {
  it("과목명과 과제명으로 찾는다 (로그인한 누구나)", async () => {
    const tag = randomUUID().slice(0, 8);
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor, { name: `운영체제-${tag}` });
    const assignmentId = await postTestAssignment(professor, course.id, { title: `스케줄러 과제-${tag}` });
    const stranger = await createTestUser();

    const byCourse = await search(stranger, `운영체제-${tag}`);
    const byAssignment = await search(stranger, `스케줄러 과제-${tag}`);

    expect(byCourse.map((r) => [r.kind, r.course_id])).toEqual([["course", course.id]]);
    expect(byAssignment.map((r) => [r.kind, r.assignment_id])).toEqual([["assignment", assignmentId]]);
  });

  it("같은 이름의 과목은 최신 학기부터 (1 → 여름 → 2 → 겨울 순서로) 나오고 학기·분반이 함께 온다", async () => {
    const tag = randomUUID().slice(0, 8);
    const professor = await createTestUser({ role: "professor" });
    for (const semester of ["2026-1", "2026-겨울", "2026-여름", "2026-2"]) {
      await openTestCourse(professor, { name: `캡스톤-${tag}`, semester, section: "01" });
    }

    const results = await search(professor, `캡스톤-${tag}`);

    expect(results.map((r) => [r.semester, r.section])).toEqual([
      ["2026-겨울", "01"],
      ["2026-2", "01"],
      ["2026-여름", "01"],
      ["2026-1", "01"],
    ]);
  });

  it("학생 이름이나 학번으로 그 학생의 제출물을 찾는다", async () => {
    const { professor, author, assignmentId } = await searchSetup("course");

    for (const query of [author.name, author.studentNumber!]) {
      const results = await search(professor, query);
      expect(results.filter((r) => r.kind === "submission").map((r) => r.assignment_id)).toEqual([assignmentId]);
    }
  });

  it("마감 전에는 작성자와 담당 교수만 그 제출물을 찾는다", async () => {
    const { author, whoFinds } = await searchSetup("campus");

    expect(await whoFinds(author.studentNumber!)).toEqual(["professor", "author"]);
  });

  it("마감 후에는 공개 범위만큼만 찾는다", async () => {
    const course = await searchSetup("course");
    const campus = await searchSetup("campus");
    const privateOne = await searchSetup("private");
    for (const setup of [course, campus, privateOne]) await setup.closeDeadline();

    expect(await course.whoFinds(course.author.studentNumber!)).toEqual(["professor", "author", "classmate"]);
    expect(await campus.whoFinds(campus.author.studentNumber!)).toEqual(["professor", "author", "classmate", "outsider"]);
    expect(await privateOne.whoFinds(privateOne.author.studentNumber!)).toEqual(["professor", "author"]);
  });

  it("볼 수 없는 제출물은 결과 수에도 드러나지 않는다", async () => {
    const { author, classmate } = await searchSetup("course");

    const results = await search(classmate, author.studentNumber!);

    // 프로필은 누구나 찾는다. 숨은 제출물만 없어야 한다.
    expect(results.filter((r) => r.kind !== "profile")).toEqual([]);
  });

  it("%나 _ 같은 기호는 글자 그대로 찾는다 (전부 나오지 않는다)", async () => {
    const user = await createTestUser();

    expect(await search(user, "%")).toEqual([]);
    expect(await search(user, "_")).toEqual([]);
    expect(await search(user, "   ")).toEqual([]);
  });

  it("로그인하지 않으면 검색할 수 없다", async () => {
    const { error } = await anonClient().rpc("search", { query: "과제" });

    expect(error).not.toBeNull();
  });
});
