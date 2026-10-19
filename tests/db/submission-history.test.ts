import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, inDays, moveDeadline, openTestCourse, postTestAssignment } from "../support/courses";
import { download, SUBMISSION_BUCKET, submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

async function historySetup() {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [student, classmate] = await Promise.all([createTestUser(), createTestUser()]);
  for (const user of [student, classmate]) await enrollInTestCourse(user, professor, course.id);
  const assignmentId = await postTestAssignment(professor, course.id, { visibility: "course" });
  return { professor, student, classmate, assignmentId };
}

/** Submits one file per version and returns each version's storage path, oldest first. */
async function submitVersions(student: TestUser, assignmentId: string, count: number) {
  const paths: string[] = [];
  for (let v = 1; v <= count; v++) {
    const { error, storagePaths } = await submitFiles(student, assignmentId, [{ path: `v${v}.txt`, body: `버전 ${v}` }]);
    if (error) throw error;
    paths.push(storagePaths[0]);
  }
  return paths;
}

/** The 제출 이력 of the student's 제출물 as `viewer` sees it, oldest first. */
async function historySeenBy(viewer: TestUser, assignmentId: string) {
  const { data, error } = await viewer.client
    .from("submission_history")
    .select("submitted_at, submission_history_file(path, storage_path), submission!inner(assignment_id)")
    .eq("submission.assignment_id", assignmentId)
    .order("submitted_at");
  if (error) throw error;
  return data.map((h) => ({ submitted_at: h.submitted_at, files: h.submission_history_file }));
}

async function stillStored(storagePath: string) {
  const { data } = await adminClient().storage.from(SUBMISSION_BUCKET).download(storagePath);
  return data !== null;
}

describe("제출 이력", () => {
  it("재제출하면 이전 파일 묶음이 그때의 제출 시각과 함께 제출 이력에 남는다", async () => {
    const { student, assignmentId } = await historySetup();
    const [v1] = await submitVersions(student, assignmentId, 1);
    const { data: first } = await student.client.from("submission").select("submitted_at").eq("assignment_id", assignmentId).single();

    await submitVersions(student, assignmentId, 1);

    expect(await historySeenBy(student, assignmentId)).toEqual([
      { submitted_at: first!.submitted_at, files: [{ path: "v1.txt", storage_path: v1 }] },
    ]);
    expect(await download(student, v1)).toBe("버전 1");
  });

  it("제출 이력은 최근 5개까지만 남고, 더 오래된 버전의 파일은 Storage에서 지워진다", async () => {
    const { student, assignmentId } = await historySetup();

    const paths = await submitVersions(student, assignmentId, 7);

    const history = await historySeenBy(student, assignmentId);
    expect(history.map((h) => h.files[0].path)).toEqual(["v2.txt", "v3.txt", "v4.txt", "v5.txt", "v6.txt"]);
    expect(await stillStored(paths[0])).toBe(false);
    expect(await stillStored(paths[1])).toBe(true);
  });

  it("지금 제출물을 볼 수 있는 사람만 제출 이력과 그 파일을 본다", async () => {
    const { professor, student, classmate, assignmentId } = await historySetup();
    const [v1] = await submitVersions(student, assignmentId, 2);

    expect(await historySeenBy(classmate, assignmentId)).toEqual([]);
    expect(await download(classmate, v1)).toBeNull();
    expect(await historySeenBy(professor, assignmentId)).toHaveLength(1);
    expect(await download(professor, v1)).toBe("버전 1");

    await moveDeadline(professor, assignmentId, inDays(-1));
    expect(await historySeenBy(classmate, assignmentId)).toHaveLength(1);
    expect(await download(classmate, v1)).toBe("버전 1");
  });

  it("제출물을 지우면 제출 이력과 그 파일도 함께 지워진다", async () => {
    const { student, assignmentId } = await historySetup();
    const [v1, v2] = await submitVersions(student, assignmentId, 2);

    const { data: removed, error } = await student.client.rpc("delete_submission", { target_assignment: assignmentId });
    expect(error).toBeNull();
    expect([...removed!].sort()).toEqual([v1, v2].sort());
    await student.client.storage.from(SUBMISSION_BUCKET).remove(removed!);

    const { data: left } = await adminClient().from("submission_history").select("id, submission!inner(assignment_id)").eq("submission.assignment_id", assignmentId);
    expect(left).toEqual([]);
    expect(await stillStored(v1)).toBe(false);
  });

  it("학생은 제출 이력의 파일을 Storage에서 따로 지울 수 없다", async () => {
    const { student, assignmentId } = await historySetup();
    const [v1] = await submitVersions(student, assignmentId, 2);

    await student.client.storage.from(SUBMISSION_BUCKET).remove([v1]);

    expect(await stillStored(v1)).toBe(true);
  });

  it("방금 재제출한 학생도 탈퇴할 수 있고, 제출 이력의 파일까지 지워진다", async () => {
    const { student, assignmentId } = await historySetup();
    const [v1, v2] = await submitVersions(student, assignmentId, 2);

    const { error } = await withdrawUser({ userClient: student.client, adminClient: adminClient() });

    expect(error).toBeNull();
    expect(await stillStored(v1)).toBe(false);
    expect(await stillStored(v2)).toBe(false);
  });

  it("교수가 탈퇴하면 제출 이력도 과목과 함께 보관된다", async () => {
    const { professor, student, assignmentId } = await historySetup();
    const [v1] = await submitVersions(student, assignmentId, 2);

    const { error } = await withdrawUser({ userClient: professor.client, adminClient: adminClient() });

    expect(error).toBeNull();
    const { data } = await adminClient()
      .from("archived_submission_history")
      .select("archived_submission_history_file(path, storage_path), archived_submission!inner(assignment_id)")
      .eq("archived_submission.assignment_id", assignmentId);
    expect(data?.map((h) => h.archived_submission_history_file)).toEqual([[{ path: "v1.txt", storage_path: v1 }]]);
    expect(await stillStored(v1)).toBe(true);
  });
});
