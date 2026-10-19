import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, inDays, moveDeadline, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

const CRITERIA = [{ name: "insert 동작", points: 30, description: "" }];

/** A closed 과제 with 채점 항목 and two 제출물 (student and classmate). */
async function firstCheckSetup() {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [student, classmate, assistant, idle] = await Promise.all([createTestUser(), createTestUser(), createTestUser(), createTestUser()]);
  for (const user of [student, classmate, assistant, idle]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id);
  await professor.client.rpc("save_grading_criteria", { target_assignment: assignmentId, criteria: CRITERIA });
  for (const user of [student, classmate]) await submitFiles(user, assignmentId, [{ path: "a.c", body: "int main() {}\n" }]);
  await moveDeadline(professor, assignmentId, inDays(-1));
  return { professor, student, classmate, assistant, assignmentId };
}

const request = (user: TestUser, assignmentId: string) => user.client.rpc("request_first_check", { target_assignment: assignmentId });
const claim = (user: TestUser, assignmentId: string, max = 10) =>
  user.client.rpc("claim_first_check", { target_assignment: assignmentId, max_count: max });

async function submissionOf(student: TestUser, assignmentId: string) {
  const { data } = await adminClient().from("submission").select("id, submitted_at").eq("assignment_id", assignmentId).eq("student_id", student.id).single();
  return data!;
}

/** Saves a 1차 검사 result for the student's current 제출물 the way the server does (secret key). */
async function saveResult(student: TestUser, assignmentId: string) {
  const submission = await submissionOf(student, assignmentId);
  const admin = adminClient();
  const { error } = await admin.from("first_check").upsert({
    submission_id: submission.id,
    submitted_at: submission.submitted_at,
    criteria_version: 1,
    criteria: CRITERIA,
    status: "reviewed",
    opinions: [{ criterion: 1, verdict: "not_met", evidence: [], comment: "" }],
    suspicious: true,
  });
  if (error) throw error;
  await admin.from("first_check_queue").delete().eq("submission_id", submission.id);
}

async function resultsSeenBy(viewer: TestUser, assignmentId: string) {
  const { data, error } = await viewer.client
    .from("first_check")
    .select("suspicious, submission!inner(assignment_id)")
    .eq("submission.assignment_id", assignmentId);
  if (error) throw error;
  return data.map((row) => row.suspicious);
}

describe("1차 검사", () => {
  it("담당 교수·조교가 마감 후에 요청하면 제출물이 모두 검사 대기열에 들어간다", async () => {
    const { professor, assistant, assignmentId } = await firstCheckSetup();

    expect(await request(professor, assignmentId)).toMatchObject({ data: 2, error: null });
    expect((await request(assistant, assignmentId)).error).toBeNull();

    const progress = async () => (await professor.client.rpc("first_check_progress", { target_assignment: assignmentId })).data;
    expect(await progress()).toEqual([{ total: 2, remaining: 2 }]);
  });

  it("검사 중에 다시 요청해도 끝난 수가 처음부터 다시 세어지지 않는다", async () => {
    const { professor, student, assignmentId } = await firstCheckSetup();
    await request(professor, assignmentId);
    await saveResult(student, assignmentId);

    await request(professor, assignmentId);

    const { data } = await professor.client.rpc("first_check_progress", { target_assignment: assignmentId });
    expect(data).toEqual([{ total: 2, remaining: 1 }]);
  });

  it("마감 전(마감을 연장한 뒤 포함)이거나 담당 교수·조교가 아니면 요청도 맡기도 못 한다", async () => {
    const { professor, student, assignmentId } = await firstCheckSetup();
    const otherProfessor = await createTestUser({ role: "professor" });
    for (const user of [student, otherProfessor]) {
      expect((await request(user, assignmentId)).error?.code).toBe("KH010");
      expect((await claim(user, assignmentId)).error?.code).toBe("KH010");
    }

    await moveDeadline(professor, assignmentId, inDays(1));

    expect((await request(professor, assignmentId)).error?.code).toBe("KH010");
    expect((await claim(professor, assignmentId)).error?.code).toBe("KH010");
  });

  it("결과가 없거나 제출물·채점 항목이 바뀐 제출물만 다시 검사한다", async () => {
    const { professor, student, classmate, assignmentId } = await firstCheckSetup();
    await saveResult(student, assignmentId);

    expect((await request(professor, assignmentId)).data).toBe(1);
    await saveResult(classmate, assignmentId);
    expect((await request(professor, assignmentId)).data).toBe(0);

    // 마감을 연장해 다시 제출하면 그 제출물만 다시 검사 대상이 된다.
    await moveDeadline(professor, assignmentId, inDays(1));
    await submitFiles(student, assignmentId, [{ path: "a.c", body: "int main() { return 0; }\n" }]);
    await moveDeadline(professor, assignmentId, inDays(-1));
    expect((await request(professor, assignmentId)).data).toBe(1);
    await saveResult(student, assignmentId);

    // 채점 항목을 고치면 모두 다시 검사 대상이 된다.
    await professor.client.rpc("save_grading_criteria", { target_assignment: assignmentId, criteria: [{ name: "새 항목", points: 10, description: "" }] });
    expect((await request(professor, assignmentId)).data).toBe(2);
  });

  it("동시에 맡아도 같은 제출물을 두 번 맡지 않는다", async () => {
    const { professor, assistant, assignmentId } = await firstCheckSetup();
    await request(professor, assignmentId);

    const [a, b] = await Promise.all([claim(professor, assignmentId, 1), claim(assistant, assignmentId, 1)]);
    const third = await claim(professor, assignmentId, 1);

    const claimed = [...a.data!, ...b.data!].map((row) => row.submission_id);
    expect(new Set(claimed).size).toBe(2);
    expect(third.data).toEqual([]);
  });

  it("결과는 담당 교수·조교만 읽고, 학생·다른 교수·관리자·외부인은 못 읽는다", async () => {
    const { professor, student, classmate, assistant, assignmentId } = await firstCheckSetup();
    const [otherProfessor, admin, outsider] = await Promise.all([
      createTestUser({ role: "professor" }),
      createTestUser({ role: "admin" }),
      createTestUser(),
    ]);
    await saveResult(student, assignmentId);

    for (const staff of [professor, assistant]) expect(await resultsSeenBy(staff, assignmentId)).toEqual([true]);
    for (const other of [student, classmate, otherProfessor, admin, outsider]) expect(await resultsSeenBy(other, assignmentId)).toEqual([]);
    expect((await student.client.from("first_check_queue").select("submission_id")).data).toEqual([]);
  });

  it("교수·조교도 결과를 직접 쓰지 못한다 (서버만 쓴다)", async () => {
    const { professor, student, assignmentId } = await firstCheckSetup();
    const submission = await submissionOf(student, assignmentId);

    const { error } = await professor.client.from("first_check").insert({
      submission_id: submission.id,
      submitted_at: submission.submitted_at,
      criteria_version: 1,
      criteria: CRITERIA,
      status: "reviewed",
      opinions: [],
      suspicious: false,
    });

    expect(error).not.toBeNull();
  });

  it("교수가 탈퇴하면 1차 검사 결과도 과목과 함께 보관된다", async () => {
    const { professor, student, assignmentId } = await firstCheckSetup();
    await saveResult(student, assignmentId);
    const submission = await submissionOf(student, assignmentId);

    expect((await withdrawUser({ userClient: professor.client, adminClient: adminClient() })).error).toBeNull();

    const { data } = await adminClient().from("archived_first_check").select("suspicious").eq("submission_id", submission.id);
    expect(data).toEqual([{ suspicious: true }]);
  });
});
