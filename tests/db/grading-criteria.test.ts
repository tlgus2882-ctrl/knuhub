import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import type { Criterion } from "../../src/app/courses/[courseId]/assignments/[assignmentId]/criteria-actions";
import type { Json } from "../../src/lib/supabase/database.types";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

const CRITERIA: Criterion[] = [
  { name: "insert 동작", points: 30, description: "맨 앞, 중간, 맨 뒤에 넣는다" },
  { name: "빈 리스트 처리", points: 20, description: "" },
];

async function criteriaSetup({ published = true } = {}) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [student, assistant] = await Promise.all([createTestUser(), createTestUser()]);
  for (const user of [student, assistant]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id, { published });
  return { professor, student, assistant, assignmentId };
}

function save(user: TestUser, assignmentId: string, criteria: Json) {
  return user.client.rpc("save_grading_criteria", { target_assignment: assignmentId, criteria });
}

async function criteriaSeenBy(user: TestUser, assignmentId: string) {
  const { data, error } = await user.client
    .from("grading_criterion")
    .select("name, points, description")
    .eq("assignment_id", assignmentId)
    .order("position");
  if (error) throw error;
  return data;
}

async function criteriaVersion(user: TestUser, assignmentId: string) {
  const { data } = await user.client.from("assignment").select("criteria_version").eq("id", assignmentId).single();
  return data?.criteria_version;
}

describe("채점 항목", () => {
  it("담당 교수가 저장한 채점 항목을 수강생이 저장한 순서대로 본다", async () => {
    const { professor, student, assignmentId } = await criteriaSetup();

    const { error } = await save(professor, assignmentId, CRITERIA);

    expect(error).toBeNull();
    expect(await criteriaSeenBy(student, assignmentId)).toEqual(CRITERIA);
  });

  it("조교도 채점 항목을 저장할 수 있다", async () => {
    const { assistant, student, assignmentId } = await criteriaSetup();

    const { error } = await save(assistant, assignmentId, CRITERIA);

    expect(error).toBeNull();
    expect(await criteriaSeenBy(student, assignmentId)).toHaveLength(2);
  });

  it("다시 저장하면 채점 항목이 통째로 바뀌고 채점 항목 버전이 올라간다", async () => {
    const { professor, student, assignmentId } = await criteriaSetup();
    expect(await criteriaVersion(student, assignmentId)).toBe(0);
    await save(professor, assignmentId, CRITERIA);
    expect(await criteriaVersion(student, assignmentId)).toBe(1);

    await save(professor, assignmentId, [{ name: "코드 가독성", points: 20, description: "" }]);

    expect(await criteriaSeenBy(student, assignmentId)).toEqual([{ name: "코드 가독성", points: 20, description: "" }]);
    expect(await criteriaVersion(student, assignmentId)).toBe(2);
  });

  it("수강생과 다른 과목 교수는 채점 항목을 저장할 수 없다", async () => {
    const { student, assignmentId } = await criteriaSetup();
    const otherProfessor = await createTestUser({ role: "professor" });

    const byStudent = await save(student, assignmentId, CRITERIA);
    const byOther = await save(otherProfessor, assignmentId, CRITERIA);
    const direct = await student.client
      .from("grading_criterion")
      .insert({ assignment_id: assignmentId, position: 0, name: "몰래", points: 100, description: "" });

    expect(byStudent.error?.code).toBe("KH003");
    expect(byOther.error?.code).toBe("KH003");
    expect(direct.error).not.toBeNull();
    expect(await criteriaSeenBy(student, assignmentId)).toEqual([]);
  });

  it("이름이 비었거나 배점이 음수인 채점 항목이 하나라도 있으면 아무것도 바뀌지 않는다", async () => {
    const { professor, student, assignmentId } = await criteriaSetup();
    await save(professor, assignmentId, CRITERIA);

    const blank = await save(professor, assignmentId, [{ name: "  ", points: 10, description: "" }]);
    const negative = await save(professor, assignmentId, [{ name: "기능", points: -5, description: "" }]);

    expect(blank.error?.code).toBe("KH007");
    expect(negative.error?.code).toBe("KH007");
    expect(await criteriaSeenBy(student, assignmentId)).toEqual(CRITERIA);
    expect(await criteriaVersion(student, assignmentId)).toBe(1);
  });

  it("빈 목록이나 숫자가 아니거나 정수가 아닌 배점은 저장되지 않는다", async () => {
    const { professor, student, assignmentId } = await criteriaSetup();

    const results = await Promise.all([
      save(professor, assignmentId, []),
      save(professor, assignmentId, [{ name: "기능", points: "abc", description: "" }]),
      save(professor, assignmentId, [{ name: "기능", points: 1.5, description: "" }]),
      save(professor, assignmentId, { name: "배열이 아님" }),
    ]);

    expect(results.map((r) => r.error?.code)).toEqual(["KH007", "KH007", "KH007", "KH007"]);
    expect(await criteriaVersion(student, assignmentId)).toBe(0);
  });

  it("바뀐 것 없이 다시 저장하면 채점 항목 버전이 그대로다", async () => {
    const { professor, student, assignmentId } = await criteriaSetup();
    await save(professor, assignmentId, CRITERIA);

    const { data: version } = await save(professor, assignmentId, CRITERIA);

    expect(version).toBe(1);
    expect(await criteriaVersion(student, assignmentId)).toBe(1);
  });

  it("공개 과제의 채점 항목은 과제를 볼 수 있는 다른 사용자도 본다", async () => {
    const { professor, assignmentId } = await criteriaSetup();
    const outsider = await createTestUser();
    await save(professor, assignmentId, CRITERIA);

    expect(await criteriaSeenBy(outsider, assignmentId)).toEqual(CRITERIA);
  });

  it("비공개 과제의 채점 항목은 담당 교수와 조교만 본다", async () => {
    const { professor, student, assistant, assignmentId } = await criteriaSetup({ published: false });
    await save(professor, assignmentId, CRITERIA);

    expect(await criteriaSeenBy(student, assignmentId)).toEqual([]);
    expect(await criteriaSeenBy(assistant, assignmentId)).toEqual(CRITERIA);
  });

  it("교수가 탈퇴하면 채점 항목도 과목과 함께 보관된다", async () => {
    const { professor, assignmentId } = await criteriaSetup();
    await save(professor, assignmentId, CRITERIA);

    const { error } = await withdrawUser({ userClient: professor.client, adminClient: adminClient() });

    expect(error).toBeNull();
    const { data } = await adminClient()
      .from("archived_grading_criterion")
      .select("name, points, description")
      .eq("assignment_id", assignmentId)
      .order("position");
    expect(data).toEqual(CRITERIA);
  });
});
