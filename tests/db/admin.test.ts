import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, randomStudentNumber, type TestUser } from "../support/supabase";

const list = (user: TestUser, query: string) => user.client.rpc("admin_list_users", { query });
const promote = (user: TestUser, target: string) => user.client.rpc("admin_promote_to_professor", { target_user: target });
const setNumber = (user: TestUser, target: string, number: string) =>
  user.client.rpc("admin_set_student_number", { target_user: target, new_student_number: number });

async function profileOf(id: string) {
  const { data } = await adminClient().from("profile").select("role, student_number").eq("id", id).single();
  return data;
}

describe("관리자 페이지", () => {
  it("관리자는 사용자를 이름·학번·학교 메일로 찾는다", async () => {
    const [admin, student] = await Promise.all([createTestUser({ role: "admin" }), createTestUser()]);

    for (const query of [student.name, student.studentNumber!, student.email]) {
      const { data, error } = await list(admin, query);
      expect(error).toBeNull();
      expect(data).toEqual([
        expect.objectContaining({ id: student.id, name: student.name, student_number: student.studentNumber, email: student.email, role: "student" }),
      ]);
    }
  });

  it("관리자가 아니면 사용자 목록·승격·학번 정정을 못 한다", async () => {
    const [student, professor, target] = await Promise.all([createTestUser(), createTestUser({ role: "professor" }), createTestUser()]);

    for (const user of [student, professor]) {
      expect((await list(user, "")).error?.code).toBe("KH011");
      expect((await promote(user, target.id)).error?.code).toBe("KH011");
      expect((await setNumber(user, target.id, randomStudentNumber())).error?.code).toBe("KH011");
    }
    expect(await profileOf(target.id)).toEqual({ role: "student", student_number: target.studentNumber });
  });

  it("관리자가 학생을 교수로 승격하면 그 사용자가 과목을 열 수 있다", async () => {
    const [admin, student] = await Promise.all([createTestUser({ role: "admin" }), createTestUser()]);

    expect((await promote(admin, student.id)).error).toBeNull();

    expect((await profileOf(student.id))?.role).toBe("professor");
    const { error } = await student.client.from("course").insert({ name: "새 과목", semester: "2026-2", section: "01" });
    expect(error).toBeNull();
  });

  it("학생이 아닌 사용자(교수·관리자)는 승격하지 않는다", async () => {
    const [admin, professor, otherAdmin] = await Promise.all([
      createTestUser({ role: "admin" }),
      createTestUser({ role: "professor" }),
      createTestUser({ role: "admin" }),
    ]);

    for (const target of [professor, otherAdmin]) expect((await promote(admin, target.id)).error?.code).toBe("KH013");
  });

  it("관리자가 학번을 정정하고, 다른 사용자가 차지한 학번은 먼저 비운 뒤에만 넣을 수 있다", async () => {
    const [admin, student, squatter] = await Promise.all([createTestUser({ role: "admin" }), createTestUser(), createTestUser()]);
    const wanted = squatter.studentNumber!;

    expect((await setNumber(admin, student.id, wanted)).error?.code).toBe("KH012");
    expect((await setNumber(admin, student.id, "12ab")).error?.code).toBe("KH012");

    expect((await setNumber(admin, squatter.id, "")).error).toBeNull();
    expect((await setNumber(admin, student.id, wanted)).error).toBeNull();

    expect((await profileOf(student.id))?.student_number).toBe(wanted);
    expect((await profileOf(squatter.id))?.student_number).toBeNull();
  });

  it("관리자만 보관된 과목과 그 과제·제출물·리뷰를 읽는다", async () => {
    const [admin, professor, student, assistant, outsider] = await Promise.all([
      createTestUser({ role: "admin" }),
      createTestUser({ role: "professor" }),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ]);
    const course = await openTestCourse(professor);
    for (const user of [student, assistant]) await enrollInTestCourse(user, professor, course.id);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
    const assignmentId = await postTestAssignment(professor, course.id);
    await submitFiles(student, assignmentId, [{ path: "main.py", body: "print(1)\n" }]);
    const { data: submission } = await student.client.from("submission").select("id").eq("assignment_id", assignmentId).single();
    // The withdrawing professor's own reviews are not archived, so an assistant writes this one.
    await assistant.client.from("review").insert({ submission_id: submission!.id, body: "좋아요" });
    expect((await withdrawUser({ userClient: professor.client, adminClient: adminClient() })).error).toBeNull();

    const archivedSeenBy = (user: TestUser) =>
      user.client
        .from("archived_course")
        .select("name, archived_assignment(title, archived_submission(student_name, archived_submission_file(path), archived_review(body)))")
        .eq("id", course.id);

    const { data } = await archivedSeenBy(admin);
    expect(data).toEqual([
      {
        name: course.name,
        archived_assignment: [
          { title: "1주차 과제", archived_submission: [{ student_name: student.name, archived_submission_file: [{ path: "main.py" }], archived_review: [{ body: "좋아요" }] }] },
        ],
      },
    ]);
    for (const other of [student, outsider]) expect((await archivedSeenBy(other)).data ?? []).toEqual([]);
  });
});
