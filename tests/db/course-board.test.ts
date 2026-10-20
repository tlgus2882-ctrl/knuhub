import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, openTestCourse } from "../support/courses";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

/** A course with its professor, an assistant, a 수강생 and an outsider. */
async function courseWithPeople() {
  const [professor, assistant, student, outsider] = await Promise.all([
    createTestUser({ role: "professor" }),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const course = await openTestCourse(professor);
  for (const user of [assistant, student]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  return { course, professor, assistant, student, outsider };
}

async function writeCoursePost(user: TestUser, courseId: string, isNotice = false) {
  return user.client.from("post").insert({ course_id: courseId, is_notice: isNotice, title: "제목", body: "본문" }).select("id").single();
}

describe("과목 게시판", () => {
  it("그 과목 사람(수강생·조교·담당 교수)만 읽고 쓰며, 말머리는 없다", async () => {
    const { course, professor, assistant, student, outsider } = await courseWithPeople();

    const { data: post, error } = await writeCoursePost(student, course.id);
    expect(error).toBeNull();
    for (const user of [assistant, professor]) {
      expect((await user.client.from("post_comment").insert({ post_id: post!.id, body: "댓글" })).error).toBeNull();
      expect((await user.client.from("post").select("id").eq("id", post!.id)).data).toHaveLength(1);
    }

    expect((await outsider.client.from("post").select("id").eq("id", post!.id)).data).toEqual([]);
    expect((await outsider.client.from("post_comment").select("id").eq("post_id", post!.id)).data).toEqual([]);
    expect((await writeCoursePost(outsider, course.id)).error).not.toBeNull();
    expect((await outsider.client.from("post_comment").insert({ post_id: post!.id, body: "몰래" })).error).not.toBeNull();
    expect((await outsider.client.from("report").insert({ post_id: post!.id, reason: "몰래" })).error).not.toBeNull();
    // 과목 글에는 말머리를 달지 않는다
    expect((await student.client.from("post").insert({ course_id: course.id, category: "free", title: "제목", body: "본문" })).error).not.toBeNull();
    // 과목 글은 메인 게시판 목록에 섞이지 않는다
    expect((await student.client.from("post").select("id").is("course_id", null).eq("id", post!.id)).data).toEqual([]);
  });

  it("교수·조교만 공지를 올리고, 학생은 자기 글을 공지로 바꾸지 못한다", async () => {
    const { course, professor, assistant, student } = await courseWithPeople();

    for (const user of [professor, assistant]) expect((await writeCoursePost(user, course.id, true)).error).toBeNull();
    expect((await writeCoursePost(student, course.id, true)).error).not.toBeNull();

    const { data: own } = await writeCoursePost(student, course.id);
    expect((await student.client.from("post").update({ is_notice: true }).eq("id", own!.id)).error).not.toBeNull();
    // 메인 게시판 글은 공지가 될 수 없다
    expect((await professor.client.from("post").insert({ category: "free", is_notice: true, title: "제목", body: "본문" })).error).not.toBeNull();
  });

  it("글쓴이는 고치고 지우며, 담당 교수·조교는 그 과목 글·댓글을 지우고, 다른 과목 교수는 못 지운다", async () => {
    const { course, professor, assistant, student } = await courseWithPeople();
    const other = await courseWithPeople();
    const { data: post } = await writeCoursePost(student, course.id);
    const { data: comment } = await student.client.from("post_comment").insert({ post_id: post!.id, body: "댓글" }).select("id").single();

    expect((await student.client.from("post").update({ title: "고침" }).eq("id", post!.id).select("id")).data).toHaveLength(1);
    expect((await professor.client.from("post").update({ title: "바꿈" }).eq("id", post!.id).select("id")).data).toEqual([]);
    expect((await other.professor.client.from("post").delete().eq("id", post!.id).select("id")).data).toEqual([]);

    expect((await assistant.client.from("post_comment").delete().eq("id", comment!.id).select("id")).data).toHaveLength(1);
    expect((await professor.client.from("post").delete().eq("id", post!.id).select("id")).data).toHaveLength(1);
  });

  it("과목 게시판 글도 신고하면 관리자가 읽는다", async () => {
    const { course, student, assistant } = await courseWithPeople();
    const admin = await createTestUser({ role: "admin" });
    const { data: post } = await writeCoursePost(student, course.id);

    expect((await assistant.client.from("report").insert({ post_id: post!.id, reason: "도배" })).error).toBeNull();
    const { data } = await admin.client.from("report").select("reason, post(title)").eq("post_id", post!.id);
    expect(data).toEqual([{ reason: "도배", post: { title: "제목" } }]);
  });

  it("교수가 탈퇴하면 과목 게시판 글은 보관하지 않고 지운다", async () => {
    const { course, professor, student } = await courseWithPeople();
    const { data: post } = await writeCoursePost(student, course.id);
    await student.client.from("post_comment").insert({ post_id: post!.id, body: "댓글" });

    expect((await withdrawUser({ userClient: professor.client, adminClient: adminClient() })).error).toBeNull();

    const admin = adminClient();
    expect((await admin.from("archived_course").select("id").eq("id", course.id)).data).toHaveLength(1);
    expect((await admin.from("post").select("id").eq("id", post!.id)).data).toEqual([]);
    expect((await admin.from("post_comment").select("id").eq("post_id", post!.id)).data).toEqual([]);
  });
});
