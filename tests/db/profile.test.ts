import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { enrollInTestCourse, inDays, moveDeadline, openTestCourse, postTestAssignment } from "../support/courses";
import { submitFiles } from "../support/submissions";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

const bioOf = async (viewer: TestUser, id: string) =>
  (await viewer.client.from("profile").select("bio").eq("id", id).single()).data?.bio;

describe("학생 프로필", () => {
  it("본인만 자기소개를 쓰고 고치며, 로그인한 누구나 읽는다", async () => {
    const [student, other] = await Promise.all([createTestUser(), createTestUser()]);

    expect((await student.client.from("profile").update({ bio: "자료구조 좋아해요" }).eq("id", student.id)).error).toBeNull();
    expect(await bioOf(other, student.id)).toBe("자료구조 좋아해요");

    await other.client.from("profile").update({ bio: "바꿈" }).eq("id", student.id);
    expect(await bioOf(student, student.id)).toBe("자료구조 좋아해요");
  });

  it("프로필의 제출물 목록에는 보는 사람이 볼 수 있는 제출물만 나온다 (공개 범위 규칙 그대로)", async () => {
    const professor = await createTestUser({ role: "professor" });
    const [author, classmate, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    const course = await openTestCourse(professor);
    for (const user of [author, classmate]) await enrollInTestCourse(user, professor, course.id);
    const campus = await postTestAssignment(professor, course.id, { visibility: "campus" });
    const closed = await postTestAssignment(professor, course.id, { visibility: "private" });
    for (const id of [campus, closed]) await submitFiles(author, id, [{ path: "main.py", body: "print(1)" }]);
    const listed = async (viewer: TestUser) =>
      ((await viewer.client.from("submission").select("assignment_id").eq("student_id", author.id)).data ?? []).map((r) => r.assignment_id).sort();

    // 마감 전에는 본인과 담당 교수만
    expect(await listed(classmate)).toEqual([]);
    expect(await listed(author)).toEqual([campus, closed].sort());

    for (const id of [campus, closed]) await moveDeadline(professor, id, inDays(-1));
    expect(await listed(classmate)).toEqual([campus]);
    expect(await listed(outsider)).toEqual([campus]);
    expect(await listed(professor)).toEqual([campus, closed].sort());
  });

  it("검색에서 이름·학번으로 학생과 교수의 프로필을 찾는다 (관리자는 나오지 않는다)", async () => {
    const [student, professor, admin, viewer] = await Promise.all([
      createTestUser(),
      createTestUser({ role: "professor" }),
      createTestUser({ role: "admin" }),
      createTestUser(),
    ]);
    const profilesFor = async (query: string) =>
      ((await viewer.client.rpc("search", { query })).data ?? []).filter((r) => r.kind === "profile").map((r) => r.user_id);

    expect(await profilesFor(student.name)).toEqual([student.id]);
    expect(await profilesFor(student.studentNumber!)).toEqual([student.id]);
    expect(await profilesFor(professor.name)).toEqual([professor.id]);
    expect(await profilesFor(admin.name)).toEqual([]);
  });

  it("탈퇴하면 자기소개도 지워진다", async () => {
    const student = await createTestUser();
    await student.client.from("profile").update({ bio: "안녕" }).eq("id", student.id);

    expect((await withdrawUser({ userClient: student.client, adminClient: adminClient() })).error).toBeNull();

    expect((await adminClient().from("profile").select("bio").eq("id", student.id)).data).toEqual([]);
  });
});
