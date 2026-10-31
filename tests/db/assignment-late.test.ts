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

  it("마감이 지나면 지각 제출 기간에도 채점 완료를 누를 수 있지만, 제출물 공개·이의신청은 지각 제출 마감 뒤에 열린다", async () => {
    const { professor, author, outsider, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: inDays(6) });
    await submit(author, assignmentId);
    const gradedAt = async () => (await adminClient().from("assignment").select("graded_at").eq("id", assignmentId).single()).data!.graded_at;

    const now = new Date().toISOString();
    expect((await professor.client.from("assignment").update({ graded_at: now }).eq("id", assignmentId).select("id")).data).toHaveLength(1);
    expect(Date.parse((await gradedAt())!)).toBe(Date.parse(now));
    expect(await seesSubmissions(outsider, assignmentId)).toBe(0);
    expect((await author.client.rpc("can_appeal", { target_assignment: assignmentId })).data).toBe(false);

    await adminClient().from("assignment").update({ late_due_at: inDays(-0.5) }).eq("id", assignmentId);
    expect(await seesSubmissions(outsider, assignmentId)).toBe(1);
    expect((await author.client.rpc("can_appeal", { target_assignment: assignmentId })).data).toBe(true);
  });

  it("마감 전에는 채점 완료를 누를 수 없고, 마감을 늦추면 눌러 둔 채점 완료가 풀린다", async () => {
    const { professor, assignmentId } = await setup({ due_at: inDays(2), late_due_at: null });
    await professor.client.from("assignment").update({ graded_at: new Date().toISOString() }).eq("id", assignmentId);
    expect((await adminClient().from("assignment").select("graded_at").eq("id", assignmentId).single()).data!.graded_at).toBeNull();
  });

  it("지각 제출을 받으면 지각 제출 마감에 채점 완료가 자동으로 예약되고, 지나면 저절로 공개된다", async () => {
    const late = inDays(6);
    const { professor, author, outsider, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: late });
    await submit(author, assignmentId);
    const gradedAt = async () => (await adminClient().from("assignment").select("graded_at").eq("id", assignmentId).single()).data!.graded_at;
    expect(Date.parse((await gradedAt())!)).toBe(Date.parse(late));

    // 지각 제출 마감을 옮기면 예약도 따라간다
    const later = inDays(8);
    await professor.client.from("assignment").update({ late_due_at: later }).eq("id", assignmentId);
    expect(Date.parse((await gradedAt())!)).toBe(Date.parse(later));

    // 지각 제출 마감이 지나면 누르지 않아도 채점 완료로 보고 공개한다
    await adminClient().from("assignment").update({ late_due_at: inDays(-0.5) }).eq("id", assignmentId);
    expect(await seesSubmissions(outsider, assignmentId)).toBe(1);
  });

  it("자동 채점 완료 예약을 취소하면 지각 제출 마감이 지나도 공개되지 않는다", async () => {
    const { professor, author, outsider, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: inDays(6) });
    await submit(author, assignmentId);

    await professor.client.from("assignment").update({ graded_at: null }).eq("id", assignmentId);
    await adminClient().from("assignment").update({ title: "제목만 고침" }).eq("id", assignmentId);
    expect((await adminClient().from("assignment").select("graded_at").eq("id", assignmentId).single()).data!.graded_at).toBeNull();
    expect(await seesSubmissions(outsider, assignmentId)).toBe(0);
  });

  it("1차 검사는 마감이 지나면 지각 제출 기간에도 할 수 있다", async () => {
    const { professor, assignmentId } = await setup({ due_at: inDays(-1), late_due_at: inDays(6) });
    await professor.client.rpc("save_grading_criteria", {
      target_assignment: assignmentId,
      criteria: [{ name: "동작", points: 10, description: "" }],
    });

    expect((await professor.client.rpc("can_run_first_check", { target_assignment: assignmentId })).data).toBe(true);
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

  it("조교도 과제를 지우고, 첨부파일도 지울 목록에 들어간다", async () => {
    const { professor, classmate: assistant, course, assignmentId } = await setup({ due_at: inDays(3), late_due_at: null });
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
    const attachment = `${assignmentId}/${crypto.randomUUID()}`;
    expect((await professor.client.storage.from("assignment-files").upload(attachment, new Blob(["자료"]))).error).toBeNull();

    const { data: objects, error } = await assistant.client.rpc("delete_assignment", { target_assignment: assignmentId });
    expect(error).toBeNull();
    expect(objects).toEqual([{ bucket_id: "assignment-files", name: attachment }]);
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
