import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { ASSIGNMENT_FILE_BUCKET, attachFile, downloadAttachment } from "../support/assignment-files";
import { enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

async function attachmentSetup() {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [student, assistant, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  for (const user of [student, assistant]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const otherProfessor = await createTestUser({ role: "professor" });
  const assignmentId = await postTestAssignment(professor, course.id, { visibility: "campus" });
  return { professor, student, assistant, outsider, otherProfessor, course, assignmentId };
}

async function attachmentsSeenBy(user: TestUser, assignmentId: string) {
  const { data } = await user.client.from("assignment_file").select("name, size").eq("assignment_id", assignmentId);
  return data ?? [];
}

describe("과제 첨부파일", () => {
  it("담당 교수가 첨부한 파일을 그 과목 수강생이 목록에서 보고 내려받는다", async () => {
    const { professor, student, assignmentId } = await attachmentSetup();

    const { error, storagePath } = await attachFile(professor, assignmentId, "과제 안내.pdf", "PDF 내용");

    expect(error).toBeNull();
    expect(await attachmentsSeenBy(student, assignmentId)).toEqual([
      { name: "과제 안내.pdf", size: Buffer.byteLength("PDF 내용") },
    ]);
    expect(await downloadAttachment(student, storagePath)).toBe("PDF 내용");
  });

  it("그 과목의 조교도 첨부하고 지울 수 있다", async () => {
    const { assistant, student, assignmentId } = await attachmentSetup();

    const { error, fileId, storagePath } = await attachFile(assistant, assignmentId, "예제.zip", "zip");
    const detach = await assistant.client.rpc("detach_assignment_file", { target_file: fileId! });
    const { data: removed } = await assistant.client.storage.from(ASSIGNMENT_FILE_BUCKET).remove([detach.data!]);

    expect(error).toBeNull();
    expect(detach.error).toBeNull();
    expect(removed).toHaveLength(1);
    expect(await attachmentsSeenBy(student, assignmentId)).toEqual([]);
    expect(await downloadAttachment(student, storagePath)).toBeNull();
  });

  it("학생, 다른 과목의 교수, 수강생이 아닌 사용자는 첨부할 수 없다", async () => {
    const { student, outsider, otherProfessor, assignmentId } = await attachmentSetup();

    for (const user of [student, outsider, otherProfessor]) {
      const { error } = await attachFile(user, assignmentId, "가짜.txt", "x");
      expect(error).not.toBeNull();
    }
  });

  it("남이 올린 파일을 첨부하거나, 담당이 아닌 사람이 첨부파일을 지울 수 없다", async () => {
    const { professor, student, assignmentId } = await attachmentSetup();
    const other = await attachmentSetup();
    const { fileId, storagePath } = await attachFile(professor, assignmentId, "안내.txt", "원본");

    const steal = await other.professor.client.rpc("attach_assignment_file", {
      target_assignment: other.assignmentId,
      storage_path: storagePath,
      name: "훔친 파일",
    });
    const detach = await student.client.rpc("detach_assignment_file", { target_file: fileId! });
    const { data: removed } = await student.client.storage.from(ASSIGNMENT_FILE_BUCKET).remove([storagePath]);

    expect(steal.error).not.toBeNull();
    expect(detach.error).not.toBeNull();
    expect(removed ?? []).toEqual([]);
    expect(await downloadAttachment(student, storagePath)).toBe("원본");
  });

  it("그 과목 사람이 아니면 학내 공개 과제라도 첨부파일 목록과 파일을 볼 수 없다", async () => {
    const { professor, outsider, otherProfessor, assignmentId } = await attachmentSetup();
    const { storagePath } = await attachFile(professor, assignmentId, "안내.txt", "수업 자료");

    for (const user of [outsider, otherProfessor]) {
      expect(await attachmentsSeenBy(user, assignmentId)).toEqual([]);
      expect(await downloadAttachment(user, storagePath)).toBeNull();
    }
  });

  it("교수가 탈퇴해서 과목이 보관되면 첨부파일 목록도 함께 보관된다", async () => {
    const { professor, assignmentId } = await attachmentSetup();
    const { storagePath } = await attachFile(professor, assignmentId, "안내.txt", "보관될 자료");

    await withdrawUser({ userClient: professor.client, adminClient: adminClient() });

    const { data } = await adminClient()
      .from("archived_assignment_file")
      .select("name, storage_path")
      .eq("assignment_id", assignmentId);
    expect(data).toEqual([{ name: "안내.txt", storage_path: storagePath }]);
  });

  it("담당 교수가 첨부파일을 지우면 목록과 파일이 모두 사라진다", async () => {
    const { professor, student, assignmentId } = await attachmentSetup();
    const { fileId, storagePath } = await attachFile(professor, assignmentId, "안내.txt", "x");

    const { data: removedPath } = await professor.client.rpc("detach_assignment_file", { target_file: fileId! });
    const { data: removed } = await professor.client.storage.from(ASSIGNMENT_FILE_BUCKET).remove([removedPath!]);

    expect(removed).toHaveLength(1);
    expect(await attachmentsSeenBy(student, assignmentId)).toEqual([]);
    expect(await downloadAttachment(professor, storagePath)).toBeNull();
  });

  it("이미 첨부된 파일이나 같은 과목의 다른 과제 파일을 다시 첨부할 수 없고, 원래 첨부는 그대로다", async () => {
    const { professor, student, course, assignmentId } = await attachmentSetup();
    const otherAssignmentId = await postTestAssignment(professor, course.id);
    const { storagePath } = await attachFile(professor, assignmentId, "안내.txt", "원본");

    const again = await professor.client.rpc("attach_assignment_file", {
      target_assignment: assignmentId,
      storage_path: storagePath,
      name: "또.txt",
    });
    const elsewhere = await professor.client.rpc("attach_assignment_file", {
      target_assignment: otherAssignmentId,
      storage_path: storagePath,
      name: "옮김.txt",
    });

    expect(again.error).not.toBeNull();
    expect(elsewhere.error).not.toBeNull();
    expect(await attachmentsSeenBy(student, assignmentId)).toEqual([{ name: "안내.txt", size: 6 }]);
    expect(await downloadAttachment(student, storagePath)).toBe("원본");
  });

  it("과목에서 내보내진 학생은 첨부파일을 더 볼 수 없다", async () => {
    const { professor, student, course, assignmentId } = await attachmentSetup();
    const { storagePath } = await attachFile(professor, assignmentId, "안내.txt", "x");

    await professor.client.from("enrollment").delete().eq("course_id", course.id).eq("student_id", student.id);

    expect(await attachmentsSeenBy(student, assignmentId)).toEqual([]);
    expect(await downloadAttachment(student, storagePath)).toBeNull();
  });

  it("조교가 탈퇴해도 그 조교가 올린 첨부파일은 수업 자료로 남는다", async () => {
    const { assistant, student, assignmentId } = await attachmentSetup();
    const { storagePath } = await attachFile(assistant, assignmentId, "예제.txt", "예제");

    await withdrawUser({ userClient: assistant.client, adminClient: adminClient() });

    expect(await attachmentsSeenBy(student, assignmentId)).toEqual([{ name: "예제.txt", size: 6 }]);
    expect(await downloadAttachment(student, storagePath)).toBe("예제");
  });
});
