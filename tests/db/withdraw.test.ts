import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { SUBMISSION_BUCKET } from "../../src/lib/submissions/storage";
import { enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles, uploadAttempt } from "../support/submissions";
import { adminClient, anonClient, createTestUser, type TestUser } from "../support/supabase";

async function stillStored(storagePath: string) {
  const { data } = await adminClient().storage.from(SUBMISSION_BUCKET).download(storagePath);
  return data !== null;
}

/** Each per-사용자 table and the column that holds the 사용자's id. */
const USER_COLUMN = {
  profile: "id",
  profile_private: "id",
  profile_contact: "id",
  enrollment: "student_id",
  course_assistant: "user_id",
} as const;

async function rowsOf(table: keyof typeof USER_COLUMN, userId: string) {
  const { data, error } = await adminClient().from(table).select("*").filter(USER_COLUMN[table], "eq", userId);
  if (error) throw error;
  return data.length;
}

async function withdraw(user: TestUser) {
  return withdrawUser({ userClient: user.client, adminClient: adminClient() });
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
    const theirs = await submitFiles(stayer, assignmentId, [{ path: "a.txt", body: "남의 것" }]);
    const { data: mySubmission } = await leaver.client.from("submission").select("id").eq("student_id", leaver.id).single();
    const { data: theirSubmission } = await stayer.client.from("submission").select("id").eq("student_id", stayer.id).single();
    // As assistant the leaver may review the stayer's work; the professor reviews the leaver's.
    await leaver.client.from("review").insert({ submission_id: theirSubmission!.id, body: "탈퇴자가 쓴 리뷰" });
    await professor.client.from("review").insert({ submission_id: mySubmission!.id, body: "탈퇴자 제출물의 리뷰" });

    const { error } = await withdraw(leaver);

    expect(error).toBeNull();
    for (const table of Object.keys(USER_COLUMN) as (keyof typeof USER_COLUMN)[]) {
      expect(await rowsOf(table, leaver.id), table).toBe(0);
    }
    const { data: submissions } = await adminClient().from("submission").select("student_id").eq("assignment_id", assignmentId);
    expect(submissions?.map((s) => s.student_id)).toEqual([stayer.id]);
    const { data: files } = await adminClient().from("submission_file").select("storage_path").eq("submission_id", mySubmission!.id);
    expect(files).toEqual([]);
    const { data: reviews } = await adminClient().from("review").select("body").in("submission_id", [mySubmission!.id, theirSubmission!.id]);
    expect(reviews).toEqual([]);
    expect(await stillStored(mine.storagePaths[0])).toBe(false);
    expect(await stillStored(theirs.storagePaths[0])).toBe(true);
  });

  it("탈퇴한 사용자는 로그인할 수 없다", async () => {
    const leaver = await createTestUser();

    await withdraw(leaver);
    const { error } = await anonClient().auth.signInWithPassword({ email: leaver.email, password: leaver.password });

    expect(error).not.toBeNull();
  });

  it("파일을 올리는 중(올렸지만 아직 제출하지 않은 파일이 있을 때)에는 탈퇴할 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const student = await createTestUser();
    await enrollInTestCourse(student, professor, course.id);
    const assignmentId = await postTestAssignment(professor, course.id);
    await uploadAttempt(student, assignmentId, [{ path: "a.txt", body: "올리는 중" }]);

    const { error } = await withdraw(student);

    expect(error?.code).toBe("KH006");
    expect(await rowsOf("profile", student.id)).toBe(1);
  });

  it("과목을 연 교수도 탈퇴할 수 있고, 과목은 보관 테이블로 옮겨진다 (교수가 쓴 리뷰만 지운다)", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const [student, assistant] = await Promise.all([createTestUser(), createTestUser()]);
    for (const user of [student, assistant]) await enrollInTestCourse(user, professor, course.id);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
    const assignmentId = await postTestAssignment(professor, course.id, { title: "보관될 과제" });
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "src/main.py", body: "print(1)" }]);
    const { data: submission } = await student.client.from("submission").select("id").eq("student_id", student.id).single();
    await professor.client.from("review").insert({ submission_id: submission!.id, body: "교수 리뷰" });
    await assistant.client.from("review").insert({ submission_id: submission!.id, body: "조교 리뷰" });

    const { error } = await withdraw(professor);

    expect(error).toBeNull();
    expect(await rowsOf("profile", professor.id)).toBe(0);
    const { data: live } = await adminClient().from("course").select("id").eq("id", course.id);
    expect(live).toEqual([]);

    const admin = adminClient();
    const { data: archived } = await admin.from("archived_course").select("name, professor_name").eq("id", course.id).single();
    const { data: assignments } = await admin.from("archived_assignment").select("title").eq("course_id", course.id);
    const { data: submissions } = await admin
      .from("archived_submission")
      .select("student_name, student_number, archived_submission_file(path, storage_path), archived_review(body)")
      .eq("assignment_id", assignmentId);
    expect(archived).toEqual({ name: course.name, professor_name: professor.name });
    expect(assignments).toEqual([{ title: "보관될 과제" }]);
    expect(submissions).toEqual([
      {
        student_name: student.name,
        student_number: student.studentNumber,
        archived_submission_file: [{ path: "src/main.py", storage_path: storagePaths[0] }],
        archived_review: [{ body: "조교 리뷰" }],
      },
    ]);
    expect(await stillStored(storagePaths[0])).toBe(true);
  });

  it("보관된 과목의 학생이 나중에 탈퇴하면 보관된 그 학생의 제출물·파일·리뷰도 지워진다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const [student, reviewer] = await Promise.all([createTestUser(), createTestUser()]);
    for (const user of [student, reviewer]) await enrollInTestCourse(user, professor, course.id);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: reviewer.id });
    const assignmentId = await postTestAssignment(professor, course.id);
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);
    const { data: theirs } = await reviewer.client.from("submission").select("id").eq("student_id", student.id).single();
    await reviewer.client.from("review").insert({ submission_id: theirs!.id, body: "조교 리뷰" });
    await withdraw(professor);

    const { error } = await withdraw(student);

    expect(error).toBeNull();
    const admin = adminClient();
    const { data: submissions } = await admin.from("archived_submission").select("id").eq("student_id", student.id);
    const { data: files } = await admin.from("archived_submission_file").select("id").eq("submission_id", theirs!.id);
    const { data: reviews } = await admin.from("archived_review").select("body").eq("submission_id", theirs!.id);
    expect(submissions).toEqual([]);
    expect(files).toEqual([]);
    expect(reviews).toEqual([]);
    expect(await stillStored(storagePaths[0])).toBe(false);
  });

  it("보관된 과목에 리뷰를 남긴 사람이 나중에 탈퇴하면 보관된 그 리뷰도 지워진다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const [student, assistant] = await Promise.all([createTestUser(), createTestUser()]);
    for (const user of [student, assistant]) await enrollInTestCourse(user, professor, course.id);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
    const assignmentId = await postTestAssignment(professor, course.id);
    await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);
    const { data: submission } = await student.client.from("submission").select("id").eq("student_id", student.id).single();
    await assistant.client.from("review").insert({ submission_id: submission!.id, body: "조교 리뷰" });
    await withdraw(professor);

    await withdraw(assistant);

    const { data } = await adminClient().from("archived_review").select("body").eq("submission_id", submission!.id);
    expect(data).toEqual([]);
    const { data: kept } = await adminClient().from("archived_submission").select("id").eq("id", submission!.id);
    expect(kept).toHaveLength(1);
  });

  it("보관 테이블은 사용자가 읽을 수 없다 (관리자만 대시보드에서 본다)", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    await withdraw(professor);
    const someone = await createTestUser();

    const { data } = await someone.client.from("archived_course").select("id").eq("id", course.id);

    expect(data ?? []).toEqual([]);
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
