import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { resolveLoginEmail } from "@/lib/auth/resolve-login-email";
import { adminClient, anonClient, createTestUser, randomStudentNumber } from "../support/supabase";

describe("학번 로그인", () => {
  it("학번과 비밀번호로 로그인된다", async () => {
    const user = await createTestUser();

    const email = await resolveLoginEmail(adminClient(), user.studentNumber!);
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: email!,
      password: user.password,
    });

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
  });

  it("메일과 비밀번호로도 로그인된다", async () => {
    const user = await createTestUser();

    const email = await resolveLoginEmail(adminClient(), ` ${user.email.toUpperCase()} `);
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: email!,
      password: user.password,
    });

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
  });

  it("없는 학번이면 메일을 찾지 못한다", async () => {
    expect(await resolveLoginEmail(adminClient(), randomStudentNumber())).toBeNull();
  });

  it("인증하지 않은 가입의 학번으로는 메일을 찾지 못한다", async () => {
    const studentNumber = randomStudentNumber();
    await anonClient().auth.signUp({
      email: `pending-${randomUUID()}@kangnam.ac.kr`,
      password: `pw-${randomUUID()}`,
      options: {
        data: { name: "대기", student_number: studentNumber, phone: "010-0000-0000", privacy_consent: true },
      },
    });

    expect(await resolveLoginEmail(adminClient(), studentNumber)).toBeNull();
  });

  it("로그인 전 브라우저에서는 학번으로 메일을 찾을 수 없다", async () => {
    const user = await createTestUser();

    await expect(resolveLoginEmail(anonClient(), user.studentNumber!)).rejects.toThrow();
  });

  it("로그인한 다른 학생도 학번으로 메일을 찾을 수 없다", async () => {
    const user = await createTestUser();
    const other = await createTestUser();

    await expect(resolveLoginEmail(other.client, user.studentNumber!)).rejects.toThrow();
  });
});

describe("비밀번호 재설정", () => {
  it("재설정을 요청하면 가입한 학교 메일로 재설정 메일이 간다", async () => {
    const user = await createTestUser();

    const { error } = await anonClient().auth.resetPasswordForEmail(user.email);

    expect(error).toBeNull();
    expect(await latestSubjectTo(user.email)).toBe("[knuhub] 비밀번호 재설정");
  });

  it("재설정 링크로 들어온 사용자는 새 비밀번호를 정하고 그 비밀번호로 로그인한다", async () => {
    const user = await createTestUser();
    const newPassword = `new-${randomUUID()}`;

    const { error } = await user.client.auth.updateUser({ password: newPassword });
    const login = await anonClient().auth.signInWithPassword({ email: user.email, password: newPassword });

    expect(error).toBeNull();
    expect(login.data.user?.id).toBe(user.id);
  });
});

async function latestSubjectTo(email: string): Promise<string | null> {
  const { mailpitUrl } = inject("supabase");
  const query = encodeURIComponent(`to:${email}`);
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${query}&limit=1`);
    const { messages } = (await res.json()) as { messages: { Subject: string }[] };
    if (messages.length > 0) return messages[0].Subject;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
