import { describe, expect, it } from "vitest";
import { enrollInTestCourse, openTestCourse } from "../support/courses";
import type { ContactVisibility } from "../../src/app/profile/contact-visibility";
import { createTestUser, type TestUser } from "../support/supabase";

/** An owner enrolled in a course, with viewers around them. */
async function contactSetup(visibility: ContactVisibility) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const [owner, classmate, assistant, outsider] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  for (const student of [owner, classmate, assistant]) await enrollInTestCourse(student, professor, course.id);
  await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: assistant.id });
  const otherProfessor = await createTestUser({ role: "professor" });

  const { error } = await owner.client.from("profile_contact").upsert({
    id: owner.id,
    show_email: true,
    open_chat_url: "https://open.kakao.com/o/abc123",
    github: "knu-dev",
    contact_visibility: visibility,
  });
  if (error) throw error;

  const viewers = { owner, professor, assistant, classmate, outsider, otherProfessor };
  const removeFromCourse = async (student: TestUser) => {
    const { error } = await professor.client.from("enrollment").delete().eq("course_id", course.id).eq("student_id", student.id);
    if (error) throw error;
  };
  /** Names of the viewers who get the owner's contact methods from the DB. */
  const whoSeesContacts = async () => {
    const names: string[] = [];
    for (const [name, user] of Object.entries(viewers)) {
      const { data, error } = await user.client.rpc("author_contacts", { target: owner.id });
      if (error) throw error;
      if (data.length) names.push(name);
    }
    return names;
  };
  return { ...viewers, whoSeesContacts, removeFromCourse };
}

async function contactsOf(viewer: TestUser, owner: TestUser) {
  const { data } = await viewer.client.rpc("author_contacts", { target: owner.id });
  return data ?? [];
}

describe("프로필 수정", () => {
  it("본인은 이름을 고칠 수 있지만 학번과 전화번호는 고칠 수 없다", async () => {
    const user = await createTestUser();

    const rename = await user.client.from("profile").update({ name: "새 이름" }).eq("id", user.id).select("name");
    const number = await user.client.from("profile").update({ student_number: "999999999" }).eq("id", user.id);
    const role = await user.client.from("profile").update({ role: "professor" }).eq("id", user.id);
    const phone = await user.client.from("profile_private").update({ phone: "010-0000-0000" }).eq("id", user.id);

    expect(rename.data).toEqual([{ name: "새 이름" }]);
    expect(number.error).not.toBeNull();
    expect(role.error).not.toBeNull();
    expect(phone.error).not.toBeNull();
  });

  it("다른 사람의 이름이나 연락 수단은 고칠 수 없다", async () => {
    const [user, other] = await Promise.all([createTestUser(), createTestUser()]);

    const rename = await other.client.from("profile").update({ name: "가짜" }).eq("id", user.id).select("id");
    const contact = await other.client.from("profile_contact").upsert({ id: user.id, github: "evil" });

    expect(rename.data).toEqual([]);
    expect(contact.error).not.toBeNull();
  });

  it("빈 이름, 카카오 오픈채팅이 아닌 링크, 잘못된 GitHub 아이디는 저장되지 않는다", async () => {
    const user = await createTestUser();

    const blank = await user.client.from("profile").update({ name: "  " }).eq("id", user.id);
    const badLink = await user.client.from("profile_contact").upsert({ id: user.id, open_chat_url: "https://evil.example/x" });
    const badGithub = await user.client.from("profile_contact").upsert({ id: user.id, github: "not a name!" });
    const longGithub = await user.client.from("profile_contact").upsert({ id: user.id, github: "a-".repeat(20) + "b" });

    expect(blank.error).not.toBeNull();
    expect(badLink.error).not.toBeNull();
    expect(badGithub.error).not.toBeNull();
    expect(longGithub.error).not.toBeNull();
  });
});

describe("프로필 저장", () => {
  it("이름과 연락 수단을 한 번에 저장하고, 하나라도 잘못되면 아무것도 바뀌지 않는다", async () => {
    const user = await createTestUser();
    const save = (fields: { new_name: string; github: string }) =>
      user.client.rpc("update_my_profile", { ...fields, show_email: false, contact_visibility: "public" });

    expect((await save({ new_name: "바뀐 이름", github: "knu-dev" })).error).toBeNull();
    expect((await save({ new_name: "또 바뀐 이름", github: "not a name!" })).error).not.toBeNull();

    const { data: profile } = await user.client.from("profile").select("name").eq("id", user.id).single();
    const { data: contact } = await user.client.from("profile_contact").select("github").eq("id", user.id).single();
    expect(profile?.name).toBe("바뀐 이름");
    expect(contact?.github).toBe("knu-dev");

    await user.client.rpc("update_my_profile", { new_name: "바뀐 이름", show_email: false, contact_visibility: "public" });
    const { data: cleared } = await user.client.from("profile_contact").select("github").eq("id", user.id).single();
    expect(cleared?.github).toBeNull();
  });
});

describe("연락처 공개 범위", () => {
  it("전체면 모든 사용자에게 연락 수단이 보이고, 학교 메일도 함께 나온다", async () => {
    const { owner, outsider, whoSeesContacts } = await contactSetup("public");

    expect(await whoSeesContacts()).toEqual(["owner", "professor", "assistant", "classmate", "outsider", "otherProfessor"]);
    expect(await contactsOf(outsider, owner)).toEqual([
      { email: owner.email, open_chat_url: "https://open.kakao.com/o/abc123", github: "knu-dev" },
    ]);
  });

  it("수강생이면 같은 과목 수강생·교수·조교에게만 보인다", async () => {
    const { whoSeesContacts } = await contactSetup("course");

    expect(await whoSeesContacts()).toEqual(["owner", "professor", "assistant", "classmate"]);
  });

  it("과목에서 내보내진 학생에게는 수강생 공개 연락처가 더는 보이지 않는다", async () => {
    const { classmate, removeFromCourse, whoSeesContacts } = await contactSetup("course");

    await removeFromCourse(classmate);

    expect(await whoSeesContacts()).toEqual(["owner", "professor", "assistant"]);
  });

  it("누가 나와 같은 과목인지 직접 물어볼 수는 없다 (수강생 명단이 새지 않게)", async () => {
    const { owner, classmate } = await contactSetup("course");

    const { error } = await classmate.client.rpc("shares_course_with", { other: owner.id });

    expect(error).not.toBeNull();
  });

  it("비공개면 본인 말고는 아무에게도 보이지 않는다", async () => {
    const { whoSeesContacts } = await contactSetup("private");

    expect(await whoSeesContacts()).toEqual(["owner"]);
  });

  it("교수의 연락처도 수강생 공개면 그 과목 수강생에게 보인다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const [student, outsider] = await Promise.all([createTestUser(), createTestUser()]);
    await enrollInTestCourse(student, professor, course.id);
    await professor.client.from("profile_contact").upsert({ id: professor.id, github: "prof-kim", contact_visibility: "course" });

    expect(await contactsOf(student, professor)).toHaveLength(1);
    expect(await contactsOf(outsider, professor)).toEqual([]);
  });

  it("학교 메일은 본인이 공개하기로 한 경우에만 나온다", async () => {
    const owner = await createTestUser();
    const viewer = await createTestUser();
    await owner.client.from("profile_contact").upsert({ id: owner.id, github: "knu-dev", contact_visibility: "public" });

    expect(await contactsOf(viewer, owner)).toEqual([{ email: null, open_chat_url: null, github: "knu-dev" }]);
  });

  it("다른 사람의 연락처 설정은 직접 읽을 수 없다 (DB 함수가 허용한 것만 나간다)", async () => {
    const { owner, classmate } = await contactSetup("public");

    const { data } = await classmate.client.from("profile_contact").select("*").eq("id", owner.id);

    expect(data).toEqual([]);
  });
});
