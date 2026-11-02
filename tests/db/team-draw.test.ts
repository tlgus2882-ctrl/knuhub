import { describe, expect, it } from "vitest";
import type { Json as AnyJson } from "../../src/lib/supabase/database.types";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, inDays, openTestCourse } from "../support/courses";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

type Json = NonNullable<AnyJson>;

const QUESTIONS = [
  { title: "코딩 역량", kind: "choice", options: ["상", "중", "하"] },
  { title: "자신의 강점", kind: "text" },
];

/** A course with its professor, an assistant, two 수강생 and an outsider. */
async function courseWithPeople() {
  const [professor, assistant, student, classmate, outsider] = await Promise.all([
    createTestUser({ role: "professor" }),
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  const course = await openTestCourse(professor);
  for (const user of [assistant, student, classmate]) await enrollInTestCourse(user, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  return { course, professor, assistant, student, classmate, outsider };
}

function createDraw(user: TestUser, courseId: string, fields: { mode?: "random" | "survey"; survey_due_at?: string; questions?: Json } = {}) {
  const mode = fields.mode ?? "survey";
  return user.client.rpc("create_team_draw", {
    target_course: courseId,
    title: "팀 프로젝트 팀 추첨",
    body: "설문에 답해 주세요",
    mode,
    team_size: 2,
    criteria: "역량이 고르게",
    questions: fields.questions ?? (mode === "survey" ? QUESTIONS : []),
    survey_due_at: fields.survey_due_at ?? (mode === "survey" ? inDays(3) : undefined),
  });
}

describe("팀 추첨", () => {
  it("담당 교수만 올리고, 과목 게시판에 공지처럼 보이며, 그 과목 사람만 읽는다", async () => {
    const { course, professor, assistant, student, outsider } = await courseWithPeople();
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const user of [assistant, student, outsider, otherProfessor]) expect((await createDraw(user, course.id)).error).not.toBeNull();
    const { data: postId, error } = await createDraw(professor, course.id);
    expect(error).toBeNull();

    const { data: post } = await student.client.from("post").select("is_notice, team_draw(mode, team_size)").eq("id", postId!).single();
    expect(post).toMatchObject({ is_notice: true, team_draw: { mode: "survey", team_size: 2 } });
    expect((await outsider.client.from("team_draw").select("post_id").eq("post_id", postId!)).data).toEqual([]);
  });

  it("설문 응답은 마감 전에 내고 고치며, 본인과 담당 교수만 읽는다", async () => {
    const { course, professor, assistant, student, classmate, outsider } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id);
    const answer = (user: TestUser, answers: Json) => user.client.from("survey_response").upsert({ post_id: postId!, answers });

    expect((await answer(student, ["상", "발표"])).error).toBeNull();
    expect((await answer(student, ["중", "문서 정리"])).error).toBeNull();
    expect((await answer(outsider, ["상", "몰래"])).error).not.toBeNull();
    // 모든 문항에 답하고, 객관식은 보기 중 하나다
    for (const bad of [["상"], ["최상", "발표"], ["상", " "]]) expect((await answer(classmate, bad)).error?.code).toBe("KH019");

    const read = (user: TestUser) => user.client.from("survey_response").select("user_id, answers").eq("post_id", postId!);
    expect((await read(student)).data).toEqual([{ user_id: student.id, answers: ["중", "문서 정리"] }]);
    expect((await read(professor)).data).toEqual([{ user_id: student.id, answers: ["중", "문서 정리"] }]);
    for (const user of [assistant, classmate]) expect((await read(user)).data).toEqual([]);

    // 응답이 들어오면 문항은 잠기고, 기간과 팀당 인원은 고친다
    const update = (fields: { questions?: Json; team_size?: number; survey_due_at?: string }) =>
      professor.client.from("team_draw").update(fields).eq("post_id", postId!).select("post_id");
    expect((await update({ questions: [QUESTIONS[1]] })).error?.code).toBe("KH018");
    expect((await update({ team_size: 3, survey_due_at: inDays(5) })).data).toHaveLength(1);
    expect((await student.client.from("team_draw").update({ team_size: 9 }).eq("post_id", postId!).select("post_id")).data).toEqual([]);

    // 마감이 지나면 응답을 고칠 수 없다
    await adminClient().from("team_draw").update({ survey_due_at: inDays(-1) }).eq("post_id", postId!);
    expect((await answer(student, ["하", "발표"])).error).not.toBeNull();
    expect((await answer(classmate, ["하", "발표"])).error).not.toBeNull();
  });

  it("마감이 지난 뒤에는 그 과목 사람 한 명만 추첨을 맡고, 그 전에는 담당 교수만 맡는다", async () => {
    const { course, professor, student, classmate, outsider } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id);
    const claim = (user: TestUser) => user.client.rpc("claim_team_draw", { target_post: postId! });

    expect((await claim(student)).data).toBeNull();
    await adminClient().from("team_draw").update({ survey_due_at: inDays(-1) }).eq("post_id", postId!);
    expect((await claim(outsider)).data).toBeNull();
    const claims = await Promise.all([claim(student), claim(classmate)]);
    expect(claims.map((c) => c.data !== null).sort()).toEqual([false, true]);
    expect((await claim(professor)).data).toBeNull();

    // 담당 교수는 마감 전에도 바로 마감하고 맡는다
    const { data: early } = await createDraw(professor, course.id);
    const { data: claimedAt } = await professor.client.rpc("claim_team_draw", { target_post: early! });
    expect(claimedAt).not.toBeNull();
    const { data: closed } = await student.client.from("team_draw").select("status, survey_due_at").eq("post_id", early!).single();
    expect(closed!.status).toBe("drawing");
    // A second's slack for the DB container's clock
    expect(Date.parse(closed!.survey_due_at!)).toBeLessThan(Date.now() + 1000);
    expect((await student.client.rpc("finish_team_draw", { target_post: early!, claimed_at: claimedAt!, teams: [] })).error).not.toBeNull();
    expect((await finish(early!, claimedAt!, null)).data).toBe(true);
    expect((await student.client.from("team_draw").select("status").eq("post_id", early!).single()).data!.status).toBe("failed");
  });

  it("결과는 공개 전에는 교수·조교만, 공개 뒤에는 그 과목 사람이 보며, 공개 뒤에는 다시 추첨하지 못한다", async () => {
    const { course, professor, assistant, student, classmate } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id, { mode: "random" });
    const { data: guest } = await professor.client.from("team_member").insert({ post_id: postId!, course_id: course.id, guest_name: "청강생" }).select("id").single();
    expect(guest).not.toBeNull();

    await draw(professor, postId!, [[`u:${student.id}`, `g:${guest!.id}`], [`u:${classmate.id}`]], "근거");

    const members = (user: TestUser) => user.client.from("team_member").select("team_no, user_id, guest_name").eq("post_id", postId!).order("team_no");
    expect((await members(assistant)).data).toHaveLength(3);
    expect((await members(student)).data).toEqual([]);
    expect((await student.client.rpc("publish_team_draw", { target_post: postId! })).error).not.toBeNull();
    // AI 편성 근거는 담당 교수만
    expect((await professor.client.from("team_draw_note").select("rationale").eq("post_id", postId!)).data).toEqual([{ rationale: "근거" }]);
    expect((await assistant.client.from("team_draw_note").select("rationale").eq("post_id", postId!)).data).toEqual([]);

    expect((await professor.client.rpc("publish_team_draw", { target_post: postId! })).error).toBeNull();
    const published = (await members(student)).data;
    expect(published).toHaveLength(3);
    expect(published).toEqual(
      expect.arrayContaining([
        { team_no: 1, user_id: student.id, guest_name: null },
        { team_no: 1, user_id: null, guest_name: "청강생" },
        { team_no: 2, user_id: classmate.id, guest_name: null },
      ]),
    );
    expect((await professor.client.rpc("claim_team_draw", { target_post: postId! })).error?.code).toBe("KH017");
    expect((await professor.client.from("team_draw").update({ team_size: 3 }).eq("post_id", postId!)).error?.code).toBe("KH017");

    // 공개 뒤에도 옮기기·빼기·더하기는 되고, 마지막 수정 시각이 남는다
    const editedAt = async () => (await student.client.from("team_draw").select("edited_at").eq("post_id", postId!).single()).data!.edited_at;
    expect(await editedAt()).toBeNull();
    expect((await professor.client.from("team_member").update({ team_no: 2 }).eq("user_id", student.id).select("id")).data).toHaveLength(1);
    expect(await editedAt()).not.toBeNull();
    expect((await professor.client.from("team_member").delete().eq("id", guest!.id).select("id")).data).toHaveLength(1);
    expect((await professor.client.from("team_member").insert({ post_id: postId!, course_id: course.id, team_no: 1, guest_name: "복학생" })).error).toBeNull();
    expect((await student.client.from("team_member").update({ team_no: 1 }).eq("user_id", student.id).select("id")).data).toEqual([]);
    expect((await student.client.from("team_member").insert({ post_id: postId!, course_id: course.id, team_no: 1, guest_name: "몰래" })).error).not.toBeNull();
  });

  it("수강생이 과목에서 빠지면 팀에서도 빠지고, 교수가 탈퇴하면 팀 추첨도 지워진다", async () => {
    const { course, professor, student, classmate } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id, { mode: "random" });
    await draw(professor, postId!, [[`u:${student.id}`, `u:${classmate.id}`]]);

    await professor.client.from("enrollment").delete().eq("course_id", course.id).eq("student_id", student.id);
    const { data: left } = await professor.client.from("team_member").select("user_id").eq("post_id", postId!);
    expect(left).toEqual([{ user_id: classmate.id }]);

    expect((await withdrawUser({ userClient: professor.client, adminClient: adminClient() })).error).toBeNull();
    expect((await adminClient().from("team_draw").select("post_id").eq("post_id", postId!)).data).toEqual([]);
    expect((await adminClient().from("team_member").select("id").eq("post_id", postId!)).data).toEqual([]);
  });

  it("추첨 대상은 조교와 뺀 수강생을 빼고 이름만 더한 사람을 더하며, 조교는 설문에 응답하지 못한다", async () => {
    const { course, professor, assistant, student, classmate } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id);
    await professor.client.from("team_draw").update({ excluded: [classmate.id] }).eq("post_id", postId!);
    const { data: guest } = await professor.client.from("team_member").insert({ post_id: postId!, course_id: course.id, guest_name: "청강생" }).select("id").single();
    await student.client.from("survey_response").insert({ post_id: postId!, answers: ["상", "발표"] });
    expect((await assistant.client.from("survey_response").insert({ post_id: postId!, answers: ["상", "발표"] })).error).not.toBeNull();

    const { data: people } = await adminClient().rpc("team_draw_people", { target_post: postId! });
    expect(people).toHaveLength(2);
    expect(people).toEqual(
      expect.arrayContaining([
        { key: `u:${student.id}`, answers: ["상", "발표"] },
        { key: `g:${guest!.id}`, answers: null },
      ]),
    );
    expect((await professor.client.rpc("team_draw_people", { target_post: postId! })).error).not.toBeNull();
  });

  it("실패하면 이전 결과를 지우고, 늦게 끝난 추첨은 다른 사람이 다시 맡았거나 공개한 결과를 건드리지 못한다", async () => {
    const { course, professor, student, classmate } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id, { mode: "random" });
    await draw(professor, postId!, [[`u:${student.id}`, `u:${classmate.id}`]]);
    await draw(professor, postId!, null);
    expect((await professor.client.from("team_member").select("id").eq("post_id", postId!)).data).toEqual([]);

    // A slow draw whose claim has been taken over since
    const { data: stale } = await professor.client.rpc("claim_team_draw", { target_post: postId! });
    await adminClient().from("team_draw").update({ drawing_started_at: inDays(-1) }).eq("post_id", postId!);
    await draw(professor, postId!, [[`u:${student.id}`], [`u:${classmate.id}`]]);
    await professor.client.rpc("publish_team_draw", { target_post: postId! });
    expect((await finish(postId!, stale!, null)).data).toBe(false);
    const { data: after } = await student.client.from("team_draw").select("status").eq("post_id", postId!).single();
    expect(after!.status).toBe("published");
    expect((await student.client.from("team_member").select("id").eq("post_id", postId!)).data).toHaveLength(2);
  });

  it("팀 추첨 글에는 댓글은 달지만 좋아요와 신고는 없다", async () => {
    const { course, professor, student } = await courseWithPeople();
    const { data: postId } = await createDraw(professor, course.id);

    expect((await student.client.from("post_comment").insert({ post_id: postId!, body: "팀 바꿔 주세요" })).error).toBeNull();
    expect((await student.client.from("post_like").insert({ post_id: postId! })).error).not.toBeNull();
    expect((await student.client.from("report").insert({ post_id: postId!, reason: "신고" })).error).not.toBeNull();
  });
});

/** Ends a claimed draw as the server does, with `teams` of member keys (null = failed). */
function finish(postId: string, claimedAt: string, teams: string[][] | null, rationale?: string) {
  return adminClient().rpc("finish_team_draw", { target_post: postId, claimed_at: claimedAt, teams, rationale });
}

/** Claims the draw as `user` and ends it with `teams`; returns when it was claimed. */
async function draw(user: TestUser, postId: string, teams: string[][] | null, rationale?: string) {
  const { data: claimedAt, error } = await user.client.rpc("claim_team_draw", { target_post: postId });
  if (error || !claimedAt) throw error ?? new Error("not claimed");
  await finish(postId, claimedAt, teams, rationale);
  return claimedAt;
}
