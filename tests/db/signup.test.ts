import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, randomStudentNumber } from "../support/supabase";

function signUpInput(overrides: Record<string, unknown> = {}) {
  return {
    email: `signup-${randomUUID()}@kangnam.ac.kr`,
    password: `pw-${randomUUID()}`,
    data: {
      name: "홍길동",
      student_number: randomStudentNumber(),
      phone: "010-1234-5678",
      privacy_consent: true,
      ...overrides,
    },
  };
}

async function signUp(input: ReturnType<typeof signUpInput>) {
  const { email, password, data } = input;
  return anonClient().auth.signUp({ email, password, options: { data } });
}

describe("가입", () => {
  it("강남대 메일로 가입할 수 있다", async () => {
    const { error } = await signUp(signUpInput());

    expect(error).toBeNull();
  });

  it("강남대가 아닌 메일로는 가입할 수 없다", async () => {
    const input = { ...signUpInput(), email: `outsider-${randomUUID()}@gmail.com` };

    const { error } = await signUp(input);

    expect(error).not.toBeNull();
  });

  it("개인정보 수집 동의 없이는 가입할 수 없다", async () => {
    const { error } = await signUp(signUpInput({ privacy_consent: false }));

    expect(error).not.toBeNull();
  });

  it("이미 쓰인 학번으로는 가입할 수 없다", async () => {
    const taken = await createTestUser();

    const { error } = await signUp(signUpInput({ student_number: taken.studentNumber }));

    expect(error).not.toBeNull();
  });

  it("가입 전에 학번이 이미 쓰였는지 확인할 수 있다", async () => {
    const taken = await createTestUser();

    const { data: isTaken } = await anonClient().rpc("student_number_taken", {
      candidate: taken.studentNumber!,
    });
    const { data: isFree } = await anonClient().rpc("student_number_taken", {
      candidate: randomStudentNumber(),
    });

    expect(isTaken).toBe(true);
    expect(isFree).toBe(false);
  });

  it("인증하지 않은 가입은 학번을 차지하지 않는다", async () => {
    const studentNumber = randomStudentNumber();
    await signUp(signUpInput({ student_number: studentNumber }));

    const { error } = await signUp(signUpInput({ student_number: studentNumber }));
    const { data: taken } = await anonClient().rpc("student_number_taken", {
      candidate: studentNumber,
    });

    expect(error).toBeNull();
    expect(taken).toBe(false);
  });

  it("같은 학번으로 먼저 인증한 사람이 학번을 갖고, 나중 사람은 인증할 수 없다", async () => {
    const studentNumber = randomStudentNumber();
    const first = await signUp(signUpInput({ student_number: studentNumber }));
    const second = await signUp(signUpInput({ student_number: studentNumber }));
    const admin = adminClient();

    const confirmFirst = await admin.auth.admin.updateUserById(first.data.user!.id, {
      email_confirm: true,
    });
    const confirmSecond = await admin.auth.admin.updateUserById(second.data.user!.id, {
      email_confirm: true,
    });

    expect(confirmFirst.error).toBeNull();
    expect(confirmSecond.error).not.toBeNull();
    const { data: owner } = await admin
      .from("profile")
      .select("id")
      .eq("student_number", studentNumber)
      .single();
    expect(owner?.id).toBe(first.data.user!.id);
  });

  it("가입할 때 역할을 넣어도 학생으로 가입된다", async () => {
    const input = signUpInput({ role: "professor" });
    const { data } = await signUp(input);

    const { data: profile } = await adminClient()
      .from("profile")
      .select("role")
      .eq("id", data.user!.id)
      .single();

    expect(profile?.role).toBe("student");
  });

  it("교수는 학번 없이 가입할 수 있다", async () => {
    const { error } = await signUp(signUpInput({ student_number: null }));

    expect(error).toBeNull();
  });
});

describe("로그인", () => {
  it("메일 인증 전에는 로그인할 수 없다", async () => {
    const input = signUpInput();
    await signUp(input);

    const { error } = await anonClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    expect(error?.code).toBe("email_not_confirmed");
  });

  it("메일 인증 후에는 메일과 비밀번호로 로그인할 수 있다", async () => {
    const input = signUpInput();
    const { data } = await signUp(input);
    await adminClient().auth.admin.updateUserById(data.user!.id, { email_confirm: true });

    const { data: session, error } = await anonClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    expect(error).toBeNull();
    expect(session.user?.id).toBe(data.user!.id);
  });

  it("가입 후 메일을 강남대가 아닌 주소로 바꿀 수 없다", async () => {
    const user = await createTestUser();

    const { error } = await user.client.auth.updateUser({ email: `moved-${randomUUID()}@gmail.com` });

    expect(error).not.toBeNull();
  });
});

describe("역할과 학번", () => {
  it("가입한 사용자는 학생 역할이고 이름과 학번이 프로필에 있다", async () => {
    const user = await createTestUser();

    const { data } = await user.client
      .from("profile")
      .select("name, student_number, role")
      .eq("id", user.id)
      .single();

    expect(data).toEqual({ name: user.name, student_number: user.studentNumber, role: "student" });
  });

  it("사용자는 자기 역할을 바꿀 수 없다", async () => {
    const user = await createTestUser();

    await user.client.from("profile").update({ role: "professor" }).eq("id", user.id);

    const { data } = await user.client.from("profile").select("role").eq("id", user.id).single();
    expect(data?.role).toBe("student");
  });

  it("사용자는 자기 학번을 바꿀 수 없다", async () => {
    const user = await createTestUser();

    await user.client
      .from("profile")
      .update({ student_number: randomStudentNumber() })
      .eq("id", user.id);

    const { data } = await user.client
      .from("profile")
      .select("student_number")
      .eq("id", user.id)
      .single();
    expect(data?.student_number).toBe(user.studentNumber);
  });
});

describe("전화번호", () => {
  async function phoneSeenBy(viewer: Awaited<ReturnType<typeof createTestUser>>, ownerId: string) {
    const { data } = await viewer.client
      .from("profile_private")
      .select("phone")
      .eq("id", ownerId)
      .maybeSingle();
    return data?.phone ?? null;
  }

  it("관리자는 다른 사용자의 전화번호를 읽을 수 있다", async () => {
    const owner = await createTestUser();
    const admin = await createTestUser({ role: "admin" });

    expect(await phoneSeenBy(admin, owner.id)).toBe(owner.phone);
  });

  it("본인은 자기 전화번호를 읽을 수 있다", async () => {
    const owner = await createTestUser();

    expect(await phoneSeenBy(owner, owner.id)).toBe(owner.phone);
  });

  it("다른 학생은 전화번호를 읽을 수 없다", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();

    expect(await phoneSeenBy(other, owner.id)).toBeNull();
  });

  it("교수는 전화번호를 읽을 수 없다", async () => {
    const owner = await createTestUser();
    const professor = await createTestUser({ role: "professor" });

    expect(await phoneSeenBy(professor, owner.id)).toBeNull();
  });
});
