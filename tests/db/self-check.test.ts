import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, inDays, moveDeadline, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

const CRITERIA = [{ name: "insert 동작", points: 30, description: "" }];
const OPINIONS = [{ criterion: 1, verdict: "met", evidence: [{ path: "a.c", start_line: 1, end_line: 2 }], comment: "넣는다" }];

async function selfCheckSetup({ criteria = true, submit = true } = {}) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [student, classmate, assistant] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  for (const user of [student, classmate, assistant]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id, { visibility: "campus" });
  if (criteria) await professor.client.rpc("save_grading_criteria", { target_assignment: assignmentId, criteria: CRITERIA });
  if (submit) await submitFiles(student, assignmentId, [{ path: "a.c", body: "int main() {}\n" }]);
  return { professor, student, classmate, assistant, assignmentId };
}

const start = (user: TestUser, assignmentId: string) => user.client.rpc("start_self_check", { target_assignment: assignmentId });

async function usedBy(viewer: TestUser, assignmentId: string) {
  const { data } = await viewer.client.from("self_check_usage").select("used").eq("assignment_id", assignmentId);
  return data?.map((row) => row.used) ?? [];
}

/** Saves a 셀프 점검 result for the student's current 제출물, the way the server action does. */
async function saveResult(student: TestUser, assignmentId: string) {
  const { data: submission } = await student.client
    .from("submission")
    .select("id, submitted_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", student.id)
    .single();
  return student.client.from("self_check").insert({
    submission_id: submission!.id,
    submitted_at: submission!.submitted_at,
    criteria_version: 1,
    criteria: CRITERIA,
    opinions: OPINIONS,
  });
}

async function resultsSeenBy(viewer: TestUser, assignmentId: string) {
  const { data, error } = await viewer.client
    .from("self_check")
    .select("opinions, submission!inner(assignment_id)")
    .eq("submission.assignment_id", assignmentId);
  if (error) throw error;
  return data.map((row) => row.opinions);
}

describe("셀프 점검", () => {
  it("수강생이 시작하면 횟수가 하나 차감되고 남은 횟수를 본다", async () => {
    const { student, assignmentId } = await selfCheckSetup();

    const { data, error } = await start(student, assignmentId);

    expect(error).toBeNull();
    expect(data).toBe(2);
    expect(await usedBy(student, assignmentId)).toEqual([1]);
  });

  it("결과와 횟수 기록은 그 학생만 읽는다 (교수·조교·다른 수강생은 못 읽는다)", async () => {
    const { professor, student, classmate, assistant, assignmentId } = await selfCheckSetup();
    await start(student, assignmentId);

    const { error } = await saveResult(student, assignmentId);

    expect(error).toBeNull();
    expect(await resultsSeenBy(student, assignmentId)).toEqual([OPINIONS]);
    for (const other of [professor, classmate, assistant]) {
      expect(await resultsSeenBy(other, assignmentId)).toEqual([]);
      expect(await usedBy(other, assignmentId)).toEqual([]);
    }
  });

  it("과제당 3번까지 쓰고, 동시에 눌러도 한도를 넘지 않는다", async () => {
    const { student, assignmentId } = await selfCheckSetup();
    expect((await student.client.rpc("self_check_limit")).data).toBe(3);

    const results = await Promise.all(Array.from({ length: 5 }, () => start(student, assignmentId)));

    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(results.filter((r) => r.error?.code === "KH009")).toHaveLength(2);
    expect(await usedBy(student, assignmentId)).toEqual([3]);
  });

  it("채점 항목이 없거나, 제출하지 않았거나, 마감이 지났거나, 수강생이 아니면 쓸 수 없다", async () => {
    const noCriteria = await selfCheckSetup({ criteria: false });
    const noSubmission = await selfCheckSetup({ submit: false });
    const pastDue = await selfCheckSetup();
    await moveDeadline(pastDue.professor, pastDue.assignmentId, inDays(-1));
    const outsider = await createTestUser();

    for (const [user, assignmentId] of [
      [noCriteria.student, noCriteria.assignmentId],
      [noSubmission.student, noSubmission.assignmentId],
      [pastDue.student, pastDue.assignmentId],
      [pastDue.professor, pastDue.assignmentId],
      [outsider, noCriteria.assignmentId],
    ] as const) {
      expect((await start(user, assignmentId)).error?.code).toBe("KH008");
    }
  });

  it("횟수 되돌리기는 서버만 할 수 있다 (학생이 직접 부르면 거부)", async () => {
    const { student, assignmentId } = await selfCheckSetup();
    await start(student, assignmentId);
    const args = { target_assignment: assignmentId, target_student: student.id };

    const byStudent = await student.client.rpc("refund_self_check", args);
    expect(byStudent.error).not.toBeNull();
    expect(await usedBy(student, assignmentId)).toEqual([1]);

    expect((await adminClient().rpc("refund_self_check", args)).error).toBeNull();
    expect(await usedBy(student, assignmentId)).toEqual([0]);
  });

  it("다른 학생의 제출물에는 결과를 넣을 수 없다", async () => {
    const { student, classmate, assignmentId } = await selfCheckSetup();
    const { data: submission } = await student.client.from("submission").select("id, submitted_at").eq("assignment_id", assignmentId).single();

    const { error } = await classmate.client.from("self_check").insert({
      submission_id: submission!.id,
      submitted_at: submission!.submitted_at,
      criteria_version: 1,
      criteria: CRITERIA,
      opinions: OPINIONS,
    });

    expect(error).not.toBeNull();
  });

  it("제출물을 지우면 결과는 지워지지만 쓴 횟수는 되돌아가지 않는다", async () => {
    const { student, assignmentId } = await selfCheckSetup();
    await start(student, assignmentId);
    await saveResult(student, assignmentId);

    await student.client.rpc("delete_submission", { target_assignment: assignmentId });

    expect(await resultsSeenBy(student, assignmentId)).toEqual([]);
    expect(await usedBy(student, assignmentId)).toEqual([1]);
  });

  it("탈퇴하면 결과와 횟수 기록이 지워진다", async () => {
    const { student, assignmentId } = await selfCheckSetup();
    await start(student, assignmentId);
    await saveResult(student, assignmentId);

    expect((await withdrawUser({ userClient: student.client, adminClient: adminClient() })).error).toBeNull();

    const admin = adminClient();
    expect((await admin.from("self_check_usage").select("used").eq("student_id", student.id)).data).toEqual([]);
    expect((await admin.from("self_check").select("id, submission!inner(assignment_id)").eq("submission.assignment_id", assignmentId)).data).toEqual([]);
  });
});
