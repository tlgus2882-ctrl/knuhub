import { describe, expect, it } from "vitest";
import { enrollInTestCourse, inDays, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

async function setup(fields: { due_at: string; late_due_at: string | null }) {
  const professor = await createTestUser({ role: "professor" });
  const [author, classmate, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  const course = await openTestCourse(professor);
  for (const user of [author, classmate]) await enrollInTestCourse(user, professor, course.id);
  const assignmentId = await postTestAssignment(professor, course.id, { visibility: "campus", ...fields });
  return { professor, author, classmate, outsider, course, assignmentId };
}

const submit = (user: TestUser, assignmentId: string) => submitFiles(user, assignmentId, [{ path: "main.py", body: "print(1)" }]);
const seesSubmissions = async (user: TestUser, assignmentId: string) =>
  ((await user.client.from("submission").select("id").eq("assignment_id", assignmentId)).data ?? []).length;

describe("지각 제출", () => {
  it("마감이 지나도 지각 제출 마감 전이면 제출하고, 지각 제출 마감이 지나면 못 한다", async () => {
    const { professor, author, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: inDays(6) });

    expect((await submit(author, assignmentId)).error).toBeNull();
    const { data } = await author.client.from("submission").select("submitted_at, assignment(due_at)").eq("assignment_id", assignmentId).single();
    // 마감 뒤에 낸 제출물이라 지각으로 보인다
    expect(Date.parse(data!.submitted_at) > Date.parse(data!.assignment!.due_at)).toBe(true);

    await professor.client.from("assignment").update({ late_due_at: inDays(-0.5) }).eq("id", assignmentId);
    expect((await submit(author, assignmentId)).error).not.toBeNull();
  });

  it("지각 제출을 받지 않으면(비워 두면) 마감에 닫힌다", async () => {
    const { author, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: null });

    expect((await submit(author, assignmentId)).error).not.toBeNull();
  });

  it("지각 제출 마감은 마감보다 뒤여야 한다", async () => {
    const { professor, course } = await setup({ due_at: inDays(1), late_due_at: null });

    const { error } = await professor.client.from("assignment").insert({ course_id: course.id, title: "x", due_at: inDays(3), late_due_at: inDays(2) });
    expect(error).not.toBeNull();
  });

  it("지각 제출 기간에는 채점 완료할 수 없어서 제출물이 공개되지 않고, 1차 검사·이의신청도 그 뒤에 열린다", async () => {
    const { professor, author, classmate, outsider, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: inDays(6) });
    await submit(author, assignmentId);

    await professor.client.from("assignment").update({ graded_at: new Date().toISOString() }).eq("id", assignmentId);
    const { data: assignment } = await professor.client.from("assignment").select("graded_at").eq("id", assignmentId).single();
    expect(assignment!.graded_at).toBeNull();
    expect(await seesSubmissions(classmate, assignmentId)).toBe(0);
    expect((await professor.client.rpc("can_run_first_check", { target_assignment: assignmentId })).data).toBe(false);

    // 지각 제출 마감이 지나고 채점 완료하면 공개된다
    await adminClient().from("assignment").update({ late_due_at: inDays(-0.5) }).eq("id", assignmentId);
    await professor.client.from("assignment").update({ graded_at: new Date().toISOString() }).eq("id", assignmentId);
    expect(await seesSubmissions(outsider, assignmentId)).toBe(1);
    expect((await author.client.rpc("can_appeal", { target_assignment: assignmentId })).data).toBe(true);
  });
});

describe("과제 삭제", () => {
  it("담당 교수·조교는 과제를 지우고, 지울 Storage 파일 목록(제출 파일·첨부파일)을 받는다", async () => {
    const { professor, author, assignmentId } = await setup({ due_at: inDays(3), late_due_at: null });
    const { storagePaths } = await submit(author, assignmentId);

    const { data: objects, error } = await professor.client.rpc("delete_assignment", { target_assignment: assignmentId });
    expect(error).toBeNull();
    expect(objects).toEqual(expect.arrayContaining([{ bucket_id: "submissions", name: storagePaths[0] }]));
    expect((await adminClient().from("assignment").select("id").eq("id", assignmentId)).data).toEqual([]);
    expect((await adminClient().from("submission").select("id").eq("assignment_id", assignmentId)).data).toEqual([]);
  });

  it("학생과 다른 과목 교수는 과제를 지우지 못한다", async () => {
    const { author, assignmentId } = await setup({ due_at: inDays(3), late_due_at: null });
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const user of [author, otherProfessor]) {
      expect((await user.client.rpc("delete_assignment", { target_assignment: assignmentId })).error?.code).toBe("KH003");
    }
    expect((await adminClient().from("assignment").select("id").eq("id", assignmentId)).data).toHaveLength(1);
  });
});
