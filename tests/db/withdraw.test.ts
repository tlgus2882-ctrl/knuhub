import { describe, expect, it } from "vitest";
import { withdrawAccount } from "../../src/lib/account/withdraw";
import { SUBMISSION_BUCKET } from "../../src/lib/submissions/storage";
import { enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles, uploadAttempt } from "../support/submissions";
import { adminClient, anonClient, createTestUser, type TestUser } from "../support/supabase";

async function stillStored(storagePath: string) {
  const { data } = await adminClient().storage.from(SUBMISSION_BUCKET).download(storagePath);
  return data !== null;
}

async function rowsOf(table: "profile" | "profile_private" | "profile_contact" | "enrollment" | "course_assistant", column: string, id: string) {
  const { data, error } = await adminClient().from(table).select("*").eq(column, id);
  if (error) throw error;
  return data.length;
}

async function withdraw(user: TestUser) {
  return withdrawAccount({ userClient: user.client, adminClient: adminClient(), userId: user.id });
}

describe("탈퇴", () => {
  it("탈퇴하면 프로필, 제출물, 제출 파일, 리뷰가 모두 지워진다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const [leaver, stayer] = await Promise.all([createTestUser(), createTestUser()]);
    for (const student of [leaver, stayer]) await enrollInTestCourse(student, professor, course.id);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: leaver.id });
    await leaver.client.from("profile_contact").upsert({ id: leaver.id, github: "leaver" });
    const assignmentId = await postTestAssignment(professor, course.id);

    const mine = await submitFiles(leaver, assignmentId, [{ path: "a.txt", body: "내 것" }]);
    const orphan = await uploadAttempt(leaver, assignmentId, [{ path: "b.txt", body: "제출 안 한 업로드" }]);
    const theirs = await submitFiles(stayer, assignmentId, [{ path: "a.txt", body: "남의 것" }]);
    const { data: mySubmission } = await leaver.client.from("submission").select("id").eq("student_id", leaver.id).single();
    const { data: theirSubmission } = await stayer.client.from("submission").select("id").eq("student_id", stayer.id).single();
    // As assistant the leaver may review the stayer's work; the professor reviews the leaver's.
    await leaver.client.from("review").insert({ submission_id: theirSubmission!.id, body: "탈퇴자가 쓴 리뷰" });
    await professor.client.from("review").insert({ submission_id: mySubmission!.id, body: "탈퇴자 제출물의 리뷰" });

    const { error } = await withdraw(leaver);

    expect(error).toBeNull();
    for (const [table, column] of [
      ["profile", "id"],
      ["profile_private", "id"],
      ["profile_contact", "id"],
      ["enrollment", "student_id"],
      ["course_assistant", "user_id"],
    ] as const) {
      expect(await rowsOf(table, column, leaver.id), table).toBe(0);
    }
    const { data: submissions } = await adminClient().from("submission").select("student_id").eq("assignment_id", assignmentId);
    expect(submissions?.map((s) => s.student_id)).toEqual([stayer.id]);
    const { data: reviews } = await adminClient().from("review").select("body").in("submission_id", [mySubmission!.id, theirSubmission!.id]);
    expect(reviews).toEqual([]);
    expect(await stillStored(mine.storagePaths[0])).toBe(false);
    expect(await stillStored(orphan.files[0].storage_path)).toBe(false);
    expect(await stillStored(theirs.storagePaths[0])).toBe(true);
  });

  it("탈퇴한 사용자는 로그인할 수 없다", async () => {
    const leaver = await createTestUser();

    await withdraw(leaver);
    const { error } = await anonClient().auth.signInWithPassword({ email: leaver.email, password: leaver.password });

    expect(error).not.toBeNull();
  });

  it("과목을 연 교수는 스스로 탈퇴할 수 없다 (과목과 학생들의 제출물이 함께 지워지지 않게)", async () => {
    const professor = await createTestUser({ role: "professor" });
    await openTestCourse(professor);

    const { error } = await withdraw(professor);

    expect(error?.code).toBe("KH006");
    expect(await rowsOf("profile", "id", professor.id)).toBe(1);
  });

  it("과목을 열지 않은 교수는 탈퇴할 수 있다", async () => {
    const professor = await createTestUser({ role: "professor" });

    const { error } = await withdraw(professor);

    expect(error).toBeNull();
    expect(await rowsOf("profile", "id", professor.id)).toBe(0);
  });

  it("다른 사람의 파일 목록은 탈퇴 준비로 얻을 수 없다 (자기 것만 나온다)", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const [me, other] = await Promise.all([createTestUser(), createTestUser()]);
    for (const student of [me, other]) await enrollInTestCourse(student, professor, course.id);
    const assignmentId = await postTestAssignment(professor, course.id);
    await submitFiles(other, assignmentId, [{ path: "a.txt", body: "남의 것" }]);

    const { data, error } = await me.client.rpc("prepare_withdrawal");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
