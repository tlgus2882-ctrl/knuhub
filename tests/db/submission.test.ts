import { describe, expect, it } from "vitest";
import { enrollInTestCourse, inDays, openTestCourse, postTestAssignment } from "../support/courses";
import { download, SUBMISSION_BUCKET, submitFiles, uploadAttempt } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

async function moveDue(professor: TestUser, assignmentId: string, dueAt: string) {
  const { error } = await professor.client.from("assignment").update({ due_at: dueAt }).eq("id", assignmentId);
  if (error) throw error;
}

/** Whether the object is still in Storage, checked with the secret key. */
async function stillStored(storagePath: string) {
  const { data } = await adminClient().storage.from(SUBMISSION_BUCKET).download(storagePath);
  return data !== null;
}

async function assignmentSetup() {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const student = await createTestUser();
  await enrollInTestCourse(student, professor, course.id);
  const assignmentId = await postTestAssignment(professor, course.id);
  return { professor, course, student, assignmentId };
}

async function mySubmission(student: TestUser, assignmentId: string) {
  const { data, error } = await student.client
    .from("submission")
    .select("id, submitted_at, submission_file(path, size, storage_path)")
    .eq("assignment_id", assignmentId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("제출", () => {
  it("수강생은 과제에 파일 하나를 제출하고 자기 제출물과 제출 시각을 본다", async () => {
    const { student, assignmentId } = await assignmentSetup();

    const { error, storagePaths } = await submitFiles(student, assignmentId, [
      { path: "보고서.txt", body: "안녕하세요" },
    ]);

    expect(error).toBeNull();
    const submission = await mySubmission(student, assignmentId);
    expect(submission?.submitted_at).toBeTruthy();
    expect(submission?.submission_file).toEqual([
      { path: "보고서.txt", size: Buffer.byteLength("안녕하세요"), storage_path: storagePaths[0] },
    ]);
    expect(await download(student, storagePaths[0])).toBe("안녕하세요");
  });

  it("재제출하면 이전 파일이 사라지고 새 파일로 바뀐다", async () => {
    const { student, assignmentId } = await assignmentSetup();
    const first = await submitFiles(student, assignmentId, [{ path: "v1.txt", body: "첫 제출" }]);
    const before = await mySubmission(student, assignmentId);

    const second = await submitFiles(student, assignmentId, [{ path: "v2.txt", body: "다시 제출" }]);

    expect(second.error).toBeNull();
    const after = await mySubmission(student, assignmentId);
    expect(after?.id).toBe(before?.id);
    expect(after!.submitted_at > before!.submitted_at).toBe(true);
    expect(after?.submission_file.map((f) => f.path)).toEqual(["v2.txt"]);
    expect(await download(student, second.storagePaths[0])).toBe("다시 제출");
    expect(await stillStored(first.storagePaths[0])).toBe(false);
  });

  it("마감 전에는 제출물을 지울 수 있다", async () => {
    const { student, assignmentId } = await assignmentSetup();
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);

    const { data: removed, error } = await student.client.rpc("delete_submission", {
      target_assignment: assignmentId,
    });
    const { data: deleted } = await student.client.storage.from(SUBMISSION_BUCKET).remove(removed ?? []);

    expect(error).toBeNull();
    expect(deleted).toHaveLength(1);
    expect(await mySubmission(student, assignmentId)).toBeNull();
    expect(await stillStored(storagePaths[0])).toBe(false);
  });

  it("마감이 지나면 제출, 재제출, 삭제가 모두 거부된다", async () => {
    const { professor, student, assignmentId } = await assignmentSetup();
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "제때 낸 것" }]);
    const { files: lateUpload } = await uploadAttempt(student, assignmentId, [{ path: "b.txt", body: "늦게 낸 것" }]);
    await moveDue(professor, assignmentId, inDays(-1));

    const resubmit = await student.client.rpc("submit_files", { target_assignment: assignmentId, files: lateUpload });
    const upload = await uploadAttempt(student, assignmentId, [{ path: "c.txt", body: "c" }]);
    const deletion = await student.client.rpc("delete_submission", { target_assignment: assignmentId });
    const { data: removed } = await student.client.storage.from(SUBMISSION_BUCKET).remove(storagePaths);

    expect(resubmit.error).not.toBeNull();
    expect(upload.error).not.toBeNull();
    expect(deletion.error).not.toBeNull();
    expect(removed).toEqual([]);
    expect((await mySubmission(student, assignmentId))?.submission_file.map((f) => f.path)).toEqual(["a.txt"]);
    expect(await download(student, storagePaths[0])).toBe("제때 낸 것");
  });

  it("마감을 연장하면 다시 재제출할 수 있다", async () => {
    const { professor, student, assignmentId } = await assignmentSetup();
    await moveDue(professor, assignmentId, inDays(-1));
    await moveDue(professor, assignmentId, inDays(1));

    const { error } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);

    expect(error).toBeNull();
  });

  it("마감 전에 다른 수강생은 내 제출물과 파일을 볼 수 없다", async () => {
    const { professor, course, student, assignmentId } = await assignmentSetup();
    const classmate = await createTestUser();
    await enrollInTestCourse(classmate, professor, course.id);
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "비밀" }]);

    const { data: rows } = await classmate.client.from("submission").select("id").eq("assignment_id", assignmentId);
    const { data: files } = await classmate.client.from("submission_file").select("id").in("storage_path", storagePaths);
    const { data: listed } = await classmate.client.storage
      .from(SUBMISSION_BUCKET)
      .list(`${assignmentId}/${student.id}`);

    expect(rows).toEqual([]);
    expect(files).toEqual([]);
    expect(listed ?? []).toEqual([]);
    expect(await download(classmate, storagePaths[0])).toBeNull();
  });

  it("수강생이 아니면 제출할 수 없다 (다른 학생, 담당 교수)", async () => {
    const { professor, assignmentId } = await assignmentSetup();
    const outsider = await createTestUser();

    for (const user of [outsider, professor]) {
      const upload = await uploadAttempt(user, assignmentId, [{ path: "a.txt", body: "a" }]);
      // Even with a file already in their folder (put there with the secret key), submitting is refused.
      const storagePath = `${assignmentId}/${user.id}/planted/0`;
      await adminClient().storage.from(SUBMISSION_BUCKET).upload(storagePath, new Blob(["a"]));
      const submit = await user.client.rpc("submit_files", {
        target_assignment: assignmentId,
        files: [{ path: "a.txt", storage_path: storagePath }],
      });
      expect(upload.error).not.toBeNull();
      expect(submit.error?.code).toBe("KH003");
    }
  });

  it("제출한 파일은 제출물을 지우거나 다시 제출하지 않고는 Storage에서 따로 지울 수 없다", async () => {
    const { student, assignmentId } = await assignmentSetup();
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "a" }]);

    const { data: removed } = await student.client.storage.from(SUBMISSION_BUCKET).remove(storagePaths);

    expect(removed).toEqual([]);
    expect(await download(student, storagePaths[0])).toBe("a");
  });

  it("같은 파일이나 같은 경로를 두 번 넣으면 제출이 거부된다", async () => {
    const { student, assignmentId } = await assignmentSetup();
    const { files } = await uploadAttempt(student, assignmentId, [
      { path: "a.txt", body: "a" },
      { path: "b.txt", body: "b" },
    ]);

    const sameObject = await student.client.rpc("submit_files", {
      target_assignment: assignmentId,
      files: [files[0], { path: "c.txt", storage_path: files[0].storage_path }],
    });
    const samePath = await student.client.rpc("submit_files", {
      target_assignment: assignmentId,
      files: [files[0], { path: "a.txt", storage_path: files[1].storage_path }],
    });

    expect(sameObject.error?.code).toBe("KH004");
    expect(samePath.error?.code).toBe("KH004");
  });

  it("다른 학생 폴더에 올리거나 남이 올린 파일을 내 제출물로 낼 수 없다", async () => {
    const { professor, course, student, assignmentId } = await assignmentSetup();
    const classmate = await createTestUser();
    await enrollInTestCourse(classmate, professor, course.id);
    const { storagePaths } = await submitFiles(student, assignmentId, [{ path: "a.txt", body: "원본" }]);

    const intoTheirFolder = await classmate.client.storage
      .from(SUBMISSION_BUCKET)
      .upload(`${assignmentId}/${student.id}/x/0`, new Blob(["가짜"]));
    const stealing = await classmate.client.rpc("submit_files", {
      target_assignment: assignmentId,
      files: [{ path: "a.txt", storage_path: storagePaths[0] }],
    });
    const notUploaded = await classmate.client.rpc("submit_files", {
      target_assignment: assignmentId,
      files: [{ path: "a.txt", storage_path: `${assignmentId}/${classmate.id}/none/0` }],
    });

    expect(intoTheirFolder.error).not.toBeNull();
    expect(stealing.error).not.toBeNull();
    expect(notUploaded.error).not.toBeNull();
  });

  it("여러 파일을 폴더 구조와 텍스트·바이너리 구분을 그대로 담아 제출한다", async () => {
    const { student, assignmentId } = await assignmentSetup();

    const { error } = await submitFiles(student, assignmentId, [
      { path: "과제/src/main.py", body: "print(1)", kind: "text" },
      { path: "과제/docs/설계.md", body: "# 설계", kind: "text" },
      { path: "과제/logo.png", body: "PNG", kind: "binary" },
    ]);

    expect(error).toBeNull();
    const { data } = await student.client
      .from("submission_file")
      .select("path, kind, submission!inner(assignment_id)")
      .eq("submission.assignment_id", assignmentId)
      .order("path");
    expect(data?.map((f) => [f.path, f.kind])).toEqual([
      ["과제/docs/설계.md", "text"],
      ["과제/logo.png", "binary"],
      ["과제/src/main.py", "text"],
    ]);
  });
});
