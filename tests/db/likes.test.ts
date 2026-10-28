import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { closeAndGrade, enrollInTestCourse, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

/** A campus-visible 제출물 by `author`, still before its 마감일 (so only author and staff see it). */
async function submissionSetup() {
  const professor = await createTestUser({ role: "professor" });
  const [author, classmate] = await Promise.all([createTestUser(), createTestUser()]);
  const course = await openTestCourse(professor);
  for (const user of [author, classmate]) await enrollInTestCourse(user, professor, course.id);
  const assignmentId = await postTestAssignment(professor, course.id, { visibility: "campus" });
  await submitFiles(author, assignmentId, [{ path: "main.py", body: "print(1)" }]);
  const { data } = await author.client.from("submission").select("id").eq("assignment_id", assignmentId).single();
  return { professor, author, classmate, course, assignmentId, submissionId: data!.id };
}

const likeCount = async (viewer: TestUser, submissionId: string) =>
  (await viewer.client.from("submission_like").select("user_id").eq("submission_id", submissionId)).data?.length ?? 0;

describe("좋아요", () => {
  it("볼 수 있는 제출물에만 한 번 누르고, 다시 눌러 취소한다", async () => {
    const { professor, author, classmate, assignmentId, submissionId } = await submissionSetup();

    // 마감 전이라 같은 반 학생은 볼 수 없다: 누르지도 개수를 보지도 못한다
    expect((await classmate.client.from("submission_like").insert({ submission_id: submissionId })).error).not.toBeNull();

    await closeAndGrade(professor, assignmentId);
    expect((await classmate.client.from("submission_like").insert({ submission_id: submissionId })).error).toBeNull();
    expect((await classmate.client.from("submission_like").insert({ submission_id: submissionId })).error?.code).toBe("23505");
    expect((await author.client.from("submission_like").insert({ submission_id: submissionId })).error).toBeNull();
    expect(await likeCount(professor, submissionId)).toBe(2);

    // 남의 좋아요는 못 지우고, 내 좋아요만 취소한다
    await author.client.from("submission_like").delete().eq("submission_id", submissionId).eq("user_id", classmate.id);
    expect(await likeCount(author, submissionId)).toBe(2);
    await classmate.client.from("submission_like").delete().eq("submission_id", submissionId);
    expect(await likeCount(author, submissionId)).toBe(1);
  });

  it("볼 수 없게 된 제출물의 좋아요 수는 보이지 않는다", async () => {
    const { professor, classmate, assignmentId, submissionId } = await submissionSetup();
    await closeAndGrade(professor, assignmentId);
    await classmate.client.from("submission_like").insert({ submission_id: submissionId });

    await professor.client.from("assignment").update({ visibility: "private" }).eq("id", assignmentId);
    expect(await likeCount(classmate, submissionId)).toBe(0);
    expect(await likeCount(professor, submissionId)).toBe(1);
  });

  it("게시판 글도 읽을 수 있는 사람만 한 번 누르고 취소한다", async () => {
    const { course, professor, classmate } = await submissionSetup();
    const outsider = await createTestUser();
    const { data: post } = await classmate.client.from("post").insert({ course_id: course.id, title: "제목", body: "본문" }).select("id").single();

    expect((await professor.client.from("post_like").insert({ post_id: post!.id })).error).toBeNull();
    expect((await professor.client.from("post_like").insert({ post_id: post!.id })).error?.code).toBe("23505");
    expect((await outsider.client.from("post_like").insert({ post_id: post!.id })).error).not.toBeNull();
    expect((await outsider.client.from("post_like").select("user_id").eq("post_id", post!.id)).data).toEqual([]);
    expect((await classmate.client.from("post_like").select("user_id").eq("post_id", post!.id)).data).toEqual([{ user_id: professor.id }]);

    await professor.client.from("post_like").delete().eq("post_id", post!.id);
    expect((await classmate.client.from("post_like").select("user_id").eq("post_id", post!.id)).data).toEqual([]);
  });

  it("다른 사람 이름으로 누를 수 없고, 탈퇴하면 그 사람의 좋아요가 지워진다", async () => {
    const { professor, author, classmate, assignmentId, submissionId } = await submissionSetup();
    await closeAndGrade(professor, assignmentId);

    expect((await classmate.client.from("submission_like").insert({ submission_id: submissionId, user_id: author.id } as never)).error).not.toBeNull();
    await classmate.client.from("submission_like").insert({ submission_id: submissionId });
    expect((await withdrawUser({ userClient: classmate.client, adminClient: adminClient() })).error).toBeNull();
    expect(await likeCount(professor, submissionId)).toBe(0);
  });
});
