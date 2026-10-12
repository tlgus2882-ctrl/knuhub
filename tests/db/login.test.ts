import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { resolveLoginEmail } from "@/lib/auth/resolve-login-email";
import { adminClient, anonClient, createTestUser, randomStudentNumber } from "../support/supabase";

describe("학번 로그인", () => {
  it("학번과 비밀번호로 로그인된다", async () => {
    const user = await createTestUser();

    const email = await resolveLoginEmail(adminClient, user.studentNumber!);
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: email!,
      password: user.password,
    });

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
  });

  it("메일과 비밀번호로도 로그인된다", async () => {
    const user = await createTestUser();

    const email = await resolveLoginEmail(adminClient, ` ${user.email.toUpperCase()} `);
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: email!,
      password: user.password,
    });

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
  });

  it("없는 학번이면 메일을 찾지 못한다", async () => {
    expect(await resolveLoginEmail(adminClient, randomStudentNumber())).toBeNull();
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

    expect(await resolveLoginEmail(adminClient, studentNumber)).toBeNull();
  });

  it("로그인 전 브라우저에서는 학번으로 메일을 찾을 수 없다", async () => {
    const user = await createTestUser();

    await expect(resolveLoginEmail(anonClient, user.studentNumber!)).rejects.toThrow();
  });

  it("로그인한 다른 학생도 학번으로 메일을 찾을 수 없다", async () => {
    const user = await createTestUser();
    const other = await createTestUser();

    await expect(resolveLoginEmail(() => other.client, user.studentNumber!)).rejects.toThrow();
  });
});

describe("비밀번호 재설정", () => {
  it("학번으로 재설정을 요청하면 가입한 학교 메일로 재설정 메일이 간다", async () => {
    const user = await createTestUser();

    const email = await resolveLoginEmail(adminClient, user.studentNumber!);
    const { error } = await anonClient().auth.resetPasswordForEmail(email!);

    expect(error).toBeNull();
    expect((await latestMailTo(user.email))?.subject).toBe("[knuhub] 비밀번호 재설정");
  });

  it("재설정 메일의 링크를 다른 기기에서 열어도 새 비밀번호를 정하고 그 비밀번호로 로그인한다", async () => {
    const user = await createTestUser();
    await anonClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: "http://localhost:3000/auth/confirm",
    });
    const link = new URL(linkIn((await latestMailTo(user.email))!.html));

    // A fresh client stands in for another browser or a phone's mail app.
    const otherDevice = anonClient();
    const { error: verifyError } = await otherDevice.auth.verifyOtp({
      type: "recovery",
      token_hash: link.searchParams.get("token_hash")!,
    });
    const newPassword = `new-${randomUUID()}`;
    const { error: updateError } = await otherDevice.auth.updateUser({ password: newPassword });
    const login = await anonClient().auth.signInWithPassword({ email: user.email, password: newPassword });

    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe("recovery");
    expect(verifyError).toBeNull();
    expect(updateError).toBeNull();
    expect(login.data.user?.id).toBe(user.id);
  });
});

describe("가입 인증 메일", () => {
  it("인증 링크를 다른 기기에서 열어도 인증이 끝난다", async () => {
    const email = `link-${randomUUID()}@kangnam.ac.kr`;
    const studentNumber = randomStudentNumber();
    await anonClient().auth.signUp({
      email,
      password: `pw-${randomUUID()}`,
      options: {
        emailRedirectTo: "http://localhost:3000/auth/confirm",
        data: { name: "링크", student_number: studentNumber, phone: "010-0000-0000", privacy_consent: true },
      },
    });
    const link = new URL(linkIn((await latestMailTo(email))!.html));

    const { error } = await anonClient().auth.verifyOtp({
      type: "email",
      token_hash: link.searchParams.get("token_hash")!,
    });

    expect(link.pathname).toBe("/auth/confirm");
    expect(error).toBeNull();
    expect(await resolveLoginEmail(adminClient, studentNumber)).toBe(email);
  });
});

async function latestMailTo(email: string): Promise<{ subject: string; html: string } | null> {
  const { mailpitUrl } = inject("supabase");
  const query = encodeURIComponent(`to:${email}`);
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${query}&limit=1`);
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    if (messages.length > 0) {
      const message = await fetch(`${mailpitUrl}/api/v1/message/${messages[0].ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      return { subject: messages[0].Subject, html: HTML };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

function linkIn(html: string): string {
  const href = html.match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error("No link in email");
  return href.replaceAll("&amp;", "&");
}
