import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { adminClient, anonClient, createTestUser, type TestUser } from "../support/supabase";

async function writePost(user: TestUser, category: "free" | "question" | "career" | "info" | "etc" = "free") {
  const { data, error } = await user.client.from("post").insert({ category, title: "제목", body: "본문" }).select("id").single();
  expect(error).toBeNull();
  return data!.id;
}

async function writeComment(user: TestUser, postId: string) {
  const { data, error } = await user.client.from("post_comment").insert({ post_id: postId, body: "댓글" }).select("id").single();
  expect(error).toBeNull();
  return data!.id;
}

describe("메인 게시판", () => {
  it("로그인한 누구나(학생·교수) 말머리를 골라 글을 쓰고 댓글을 달며, 작성자 이름과 함께 읽는다", async () => {
    const [student, professor] = await Promise.all([createTestUser(), createTestUser({ role: "professor" })]);

    const postId = await writePost(student, "question");
    await writeComment(professor, postId);

    const { data } = await professor.client
      .from("post")
      .select("category, title, profile(name), post_comment(body, profile(name))")
      .eq("id", postId)
      .single();
    expect(data).toEqual({
      category: "question",
      title: "제목",
      profile: { name: student.name },
      post_comment: [{ body: "댓글", profile: { name: professor.name } }],
    });
  });

  it("말머리 없는 글, 빈 제목은 받지 않고, 로그인하지 않으면 읽지도 쓰지도 못한다", async () => {
    const student = await createTestUser();

    expect((await student.client.from("post").insert({ title: "제목", body: "본문" } as never)).error).not.toBeNull();
    expect((await student.client.from("post").insert({ category: "free", title: "  ", body: "본문" })).error).not.toBeNull();

    await writePost(student);
    expect((await anonClient().from("post").select("id")).data ?? []).toEqual([]);
    expect((await anonClient().from("post").insert({ category: "free", title: "제목", body: "본문" })).error).not.toBeNull();

    // 다른 사람 이름으로 글·댓글·신고를 쓸 수 없다
    const other = await createTestUser();
    const postId = await writePost(other);
    expect((await student.client.from("post").insert({ author_id: other.id, category: "free", title: "제목", body: "본문" } as never)).error).not.toBeNull();
    expect((await student.client.from("post_comment").insert({ author_id: other.id, post_id: postId, body: "댓글" } as never)).error).not.toBeNull();
    expect((await student.client.from("report").insert({ reporter_id: other.id, post_id: postId, reason: "광고" } as never)).error).not.toBeNull();
    expect((await anonClient().from("report").insert({ post_id: postId, reason: "광고" })).error).not.toBeNull();
  });

  it("말머리로 모아 본다", async () => {
    const student = await createTestUser();
    const careerId = await writePost(student, "career");
    const freeId = await writePost(student, "free");

    const { data } = await student.client.from("post").select("id").eq("category", "career").in("id", [careerId, freeId]);
    expect(data).toEqual([{ id: careerId }]);
  });

  it("글쓴이만 자기 글·댓글을 고치고, 글쓴이와 관리자만 지운다", async () => {
    const [author, other, professor, admin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ role: "professor" }),
      createTestUser({ role: "admin" }),
    ]);
    const postId = await writePost(author);
    const commentId = await writeComment(author, postId);

    for (const user of [other, professor, admin]) {
      expect((await user.client.from("post").update({ title: "바꿈" }).eq("id", postId).select("id")).data).toEqual([]);
      expect((await user.client.from("post_comment").update({ body: "바꿈" }).eq("id", commentId).select("id")).data).toEqual([]);
    }
    for (const user of [other, professor]) {
      expect((await user.client.from("post").delete().eq("id", postId).select("id")).data).toEqual([]);
      expect((await user.client.from("post_comment").delete().eq("id", commentId).select("id")).data).toEqual([]);
    }

    expect((await author.client.from("post").update({ title: "고침", category: "info" }).eq("id", postId).select("id")).data).toHaveLength(1);
    expect((await author.client.from("post_comment").update({ body: "고침" }).eq("id", commentId).select("id")).data).toHaveLength(1);
    // 다른 사람 이름으로 바꿔 달 수 없다
    expect((await author.client.from("post").update({ author_id: other.id } as never).eq("id", postId)).error).not.toBeNull();

    expect((await admin.client.from("post_comment").delete().eq("id", commentId).select("id")).data).toHaveLength(1);
    expect((await admin.client.from("post").delete().eq("id", postId).select("id")).data).toHaveLength(1);

    const ownPost = await writePost(author);
    expect((await author.client.from("post").delete().eq("id", ownPost).select("id")).data).toHaveLength(1);
  });

  it("글이나 댓글을 신고하면 관리자만 읽고, 관리자가 신고를 닫는다", async () => {
    const [author, reporter, other, admin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ role: "admin" }),
    ]);
    const postId = await writePost(author);
    const commentId = await writeComment(author, postId);

    // 신고한 사람도 신고 목록은 못 보므로 돌려받지 않는다
    const { error } = await reporter.client.from("report").insert([
      { post_id: postId, reason: "광고" },
      { comment_id: commentId, reason: "욕설" },
    ]);
    expect(error).toBeNull();
    const ofTargets = (client: TestUser["client"]) => client.from("report").select("id").or(`post_id.eq.${postId},comment_id.eq.${commentId}`);
    // 같은 글을 두 번 신고하지 않는다
    expect((await reporter.client.from("report").insert({ post_id: postId, reason: "또" })).error?.code).toBe("23505");
    // 글과 댓글 중 정확히 하나를 신고한다
    expect((await reporter.client.from("report").insert({ reason: "대상 없음" })).error).not.toBeNull();

    for (const user of [author, reporter, other]) {
      expect((await ofTargets(user.client)).data).toEqual([]);
      expect((await user.client.from("report").update({ closed_at: new Date().toISOString() }).eq("post_id", postId).select("id")).data).toEqual([]);
    }

    const { data: seen } = await admin.client
      .from("report")
      .select("reason, profile(name)")
      .or(`post_id.eq.${postId},comment_id.eq.${commentId}`)
      .order("reason");
    expect(seen).toEqual([
      { reason: "광고", profile: { name: reporter.name } },
      { reason: "욕설", profile: { name: reporter.name } },
    ]);
    const closed = await admin.client.from("report").update({ closed_at: new Date().toISOString() }).eq("comment_id", commentId).select("id");
    expect(closed.data).toHaveLength(1);

    // 관리자가 글을 지우면 그 글과 댓글에 대한 신고도 함께 사라진다
    await admin.client.from("post").delete().eq("id", postId);
    expect((await ofTargets(admin.client)).data).toEqual([]);
  });

  it("탈퇴하면 그 사람의 글·댓글이 지워진다 (학생·교수 모두)", async () => {
    const [student, professor, other] = await Promise.all([createTestUser(), createTestUser({ role: "professor" }), createTestUser()]);
    const otherPost = await writePost(other);
    const studentPost = await writePost(student);
    const professorPost = await writePost(professor);
    const comments = [await writeComment(student, otherPost), await writeComment(professor, otherPost)];

    for (const user of [student, professor]) {
      expect((await withdrawUser({ userClient: user.client, adminClient: adminClient() })).error).toBeNull();
    }

    const admin = adminClient();
    expect((await admin.from("post").select("id").in("id", [studentPost, professorPost, otherPost])).data).toEqual([{ id: otherPost }]);
    expect((await admin.from("post_comment").select("id").in("id", comments)).data).toEqual([]);
  });
});
