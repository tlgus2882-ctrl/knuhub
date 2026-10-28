import { describe, expect, it } from "vitest";
import type { Visibility } from "../../src/app/courses/visibility";
import { enrollInTestCourse, inDays, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { createTestUser, type TestUser } from "../support/supabase";

/** A 제출물 submitted before the 마감일, with every kind of reviewer around it. */
async function reviewSetup(visibility: Visibility = "course") {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [author, classmate, assistant, outsider] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  for (const student of [author, classmate, assistant]) await enrollInTestCourse(student, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const assignmentId = await postTestAssignment(professor, course.id, { visibility });
  await submitFiles(author, assignmentId, [{ path: "main.py", body: "print(1)" }]);

  const { data: submission, error } = await author.client
    .from("submission")
    .select("id")
    .eq("assignment_id", assignmentId)
    .single();
  if (error) throw error;

  const closeDeadline = async () => {
    const { error } = await professor.client.from("assignment").update({ due_at: inDays(-1), graded_at: new Date().toISOString() }).eq("id", assignmentId);
    if (error) throw error;
  };

  return { professor, author, classmate, assistant, outsider, submissionId: submission.id, closeDeadline };
}

async function writeReview(user: TestUser, submissionId: string, body = "변수 이름이 좋아요") {
  return user.client.from("review").insert({ submission_id: submissionId, body }).select("id, author_id").single();
}

async function reviewsSeenBy(user: TestUser, submissionId: string) {
  const { data } = await user.client.from("review").select("body").eq("submission_id", submissionId);
  return (data ?? []).map((r) => r.body);
}

describe("리뷰 쓰기", () => {
  it("볼 수 있는 제출물에는 리뷰를 쓰고, 리뷰에 작성자가 남는다", async () => {
    const { professor, assistant, author, submissionId } = await reviewSetup();

    for (const user of [professor, assistant, author]) {
      const { data, error } = await writeReview(user, submissionId);
      expect(error).toBeNull();
      expect(data?.author_id).toBe(user.id);
    }
  });

  it("볼 수 없는 제출물에는 리뷰를 쓸 수 없다", async () => {
    const { classmate, outsider, submissionId } = await reviewSetup();

    for (const user of [classmate, outsider]) {
      const { error } = await writeReview(user, submissionId);
      expect(error).not.toBeNull();
    }
  });

  it("마감 후 공개되면 같은 과목 수강생도 리뷰를 쓴다", async () => {
    const { classmate, submissionId, closeDeadline } = await reviewSetup("course");
    await closeDeadline();

    const { error } = await writeReview(classmate, submissionId);

    expect(error).toBeNull();
  });

  it("빈 리뷰나 공백·줄바꿈만 있는 리뷰는 쓸 수 없다", async () => {
    const { professor, submissionId } = await reviewSetup();

    for (const body of ["", "   ", "\n\t\r\n"]) {
      const { error } = await writeReview(professor, submissionId, body);
      expect(error, JSON.stringify(body)).not.toBeNull();
    }
  });

  it("다른 사람을 작성자로 내세워 리뷰를 쓸 수 없다", async () => {
    const { professor, author, submissionId } = await reviewSetup();

    const { error } = await professor.client
      .from("review")
      .insert({ submission_id: submissionId, body: "사칭", author_id: author.id });

    expect(error).not.toBeNull();
  });
});

describe("리뷰 고치기·지우기", () => {
  it("리뷰 작성자만 자기 리뷰를 고칠 수 있다", async () => {
    const { professor, assistant, classmate, submissionId, closeDeadline } = await reviewSetup("course");
    const { data: review } = await writeReview(assistant, submissionId, "처음 쓴 리뷰");
    await closeDeadline(); // the classmate can see the review now, but still may not edit it

    const byProfessor = await professor.client.from("review").update({ body: "교수가 고침" }).eq("id", review!.id).select("id");
    const byClassmate = await classmate.client.from("review").update({ body: "동기가 고침" }).eq("id", review!.id).select("id");
    expect(byClassmate.data).toEqual([]);
    const byAuthor = await assistant.client.from("review").update({ body: "고친 리뷰" }).eq("id", review!.id).select("id");

    expect(byProfessor.data).toEqual([]);
    expect(byAuthor.data).toHaveLength(1);
    expect(await reviewsSeenBy(professor, submissionId)).toEqual(["고친 리뷰"]);
  });

  it("리뷰를 다른 제출물로 옮길 수 없다", async () => {
    const { professor, submissionId } = await reviewSetup();
    const other = await reviewSetup();
    const { data: review } = await writeReview(professor, submissionId);

    const { error } = await professor.client
      .from("review")
      .update({ submission_id: other.submissionId })
      .eq("id", review!.id);

    expect(error).not.toBeNull();
  });

  it("다른 과목의 교수는 리뷰를 지울 수 없다", async () => {
    const { author, submissionId } = await reviewSetup();
    const otherProfessor = await createTestUser({ role: "professor" });
    const { data: review } = await writeReview(author, submissionId);

    const { data } = await otherProfessor.client.from("review").delete().eq("id", review!.id).select("id");

    expect(data).toEqual([]);
    expect(await reviewsSeenBy(author, submissionId)).toHaveLength(1);
  });

  it("고치기·지우기 가능 여부를 리뷰와 함께 알려 준다", async () => {
    const { professor, author, submissionId } = await reviewSetup();
    await writeReview(author, submissionId);

    const flags = async (user: TestUser) => {
      const { data } = await user.client.from("review").select("can_edit, can_delete").eq("submission_id", submissionId).single();
      return data;
    };

    expect(await flags(author)).toEqual({ can_edit: true, can_delete: true });
    expect(await flags(professor)).toEqual({ can_edit: false, can_delete: true });
  });

  it("리뷰 작성자와 담당 교수는 지울 수 있고, 다른 사람은 지울 수 없다", async () => {
    const { professor, assistant, author, submissionId } = await reviewSetup();
    const { data: byAuthor } = await writeReview(author, submissionId, "작성자 리뷰");
    const { data: byAssistant } = await writeReview(assistant, submissionId, "조교 리뷰");

    const authorDeletesAssistants = await author.client.from("review").delete().eq("id", byAssistant!.id).select("id");
    const assistantDeletesAuthors = await assistant.client.from("review").delete().eq("id", byAuthor!.id).select("id");
    expect(authorDeletesAssistants.data).toEqual([]);
    expect(assistantDeletesAuthors.data).toEqual([]);

    const own = await author.client.from("review").delete().eq("id", byAuthor!.id).select("id");
    const professorDeletes = await professor.client.from("review").delete().eq("id", byAssistant!.id).select("id");
    expect(own.data).toHaveLength(1);
    expect(professorDeletes.data).toHaveLength(1);
    expect(await reviewsSeenBy(professor, submissionId)).toEqual([]);
  });
});

describe("리뷰 열람", () => {
  it("마감 전 교수·조교가 남긴 리뷰는 제출물이 공개되면 함께 보인다", async () => {
    const { professor, assistant, classmate, outsider, submissionId, closeDeadline } = await reviewSetup("course");
    await writeReview(professor, submissionId, "교수 리뷰");
    await writeReview(assistant, submissionId, "조교 리뷰");

    expect(await reviewsSeenBy(classmate, submissionId)).toEqual([]);

    await closeDeadline();

    expect((await reviewsSeenBy(classmate, submissionId)).sort()).toEqual(["교수 리뷰", "조교 리뷰"]);
    expect(await reviewsSeenBy(outsider, submissionId)).toEqual([]);
  });
});
