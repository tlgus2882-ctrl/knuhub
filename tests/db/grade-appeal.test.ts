import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { closeAndGrade, enrollInTestCourse, inDays, moveDeadline, openTestCourse, postTestAssignment } from "../support/courses";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

/** A 과제 with a 수강생 who may appeal, a classmate, an 조교 and people outside the course. */
async function appealSetup() {
  const [professor, otherProfessor] = await Promise.all([createTestUser({ role: "professor" }), createTestUser({ role: "professor" })]);
  const [student, classmate, assistant, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser(), createTestUser()]);
  const course = await openTestCourse(professor);
  for (const user of [student, classmate, assistant]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id);
  return { professor, otherProfessor, student, classmate, assistant, outsider, assignmentId };
}

const appeal = (user: TestUser, assignmentId: string, body = "2번 채점 항목 점수를 다시 봐 주세요") =>
  user.client.from("grade_appeal").insert({ assignment_id: assignmentId, body });

const appealsSeenBy = async (user: TestUser, assignmentId: string) =>
  ((await user.client.from("grade_appeal").select("student_id").eq("assignment_id", assignmentId)).data ?? []).map((a) => a.student_id);

const answer = (user: TestUser, assignmentId: string, studentId: string, text = "확인했어요. 점수를 고쳤어요.") =>
  user.client.from("grade_appeal").update({ answer: text }).eq("assignment_id", assignmentId).eq("student_id", studentId).select("answered_by");

describe("점수 이의신청", () => {
  it("마감 전이나 채점 완료 전에는 할 수 없고, 채점 완료 후 그 과목 수강생만 과제마다 한 번 한다", async () => {
    const { professor, student, outsider, assignmentId } = await appealSetup();

    expect((await appeal(student, assignmentId)).error).not.toBeNull();
    await moveDeadline(professor, assignmentId, inDays(-1));
    expect((await appeal(student, assignmentId)).error).not.toBeNull();

    await closeAndGrade(professor, assignmentId);
    for (const user of [outsider, professor]) expect((await appeal(user, assignmentId)).error).not.toBeNull();
    expect((await appeal(student, assignmentId)).error).toBeNull();
    expect((await appeal(student, assignmentId)).error?.code).toBe("23505");
  });

  it("빈 내용이나 다른 사람 이름으로는 신청할 수 없다", async () => {
    const { professor, student, classmate, assignmentId } = await appealSetup();
    await closeAndGrade(professor, assignmentId);

    expect((await appeal(student, assignmentId, " \n ")).error).not.toBeNull();
    const forged = await classmate.client
      .from("grade_appeal")
      .insert({ assignment_id: assignmentId, body: "대신 신청", student_id: student.id } as never);
    expect(forged.error).not.toBeNull();
  });

  it("신청한 학생과 담당 교수·조교만 읽는다", async () => {
    const { professor, otherProfessor, student, classmate, assistant, outsider, assignmentId } = await appealSetup();
    await closeAndGrade(professor, assignmentId);
    await appeal(student, assignmentId);

    for (const user of [student, professor, assistant]) expect(await appealsSeenBy(user, assignmentId)).toEqual([student.id]);
    for (const user of [classmate, outsider, otherProfessor]) expect(await appealsSeenBy(user, assignmentId)).toEqual([]);
  });

  it("담당 교수·조교만 답변하고, 답변한 사람이 남는다", async () => {
    const { professor, otherProfessor, student, assistant, assignmentId } = await appealSetup();
    await closeAndGrade(professor, assignmentId);
    await appeal(student, assignmentId);

    for (const user of [student, otherProfessor]) expect((await answer(user, assignmentId, student.id)).data ?? []).toEqual([]);
    expect((await answer(assistant, assignmentId, student.id)).data).toEqual([{ answered_by: assistant.id }]);
  });

  it("학생은 답변을 받기 전에만 자기 신청을 거둔다", async () => {
    const { professor, student, assignmentId } = await appealSetup();
    await closeAndGrade(professor, assignmentId);
    const withdraw = () =>
      student.client.from("grade_appeal").delete().eq("assignment_id", assignmentId).eq("student_id", student.id).select("student_id");

    await appeal(student, assignmentId);
    expect((await withdraw()).data).toHaveLength(1);

    await appeal(student, assignmentId);
    await answer(professor, assignmentId, student.id);
    expect((await withdraw()).data ?? []).toEqual([]);
    expect(await appealsSeenBy(student, assignmentId)).toEqual([student.id]);
  });

  it("탈퇴하면 그 학생의 이의신청이 지워진다", async () => {
    const { professor, student, assignmentId } = await appealSetup();
    await closeAndGrade(professor, assignmentId);
    await appeal(student, assignmentId);

    expect((await withdrawUser({ userClient: student.client, adminClient: adminClient() })).error).toBeNull();

    expect(await appealsSeenBy(professor, assignmentId)).toEqual([]);
  });
});
