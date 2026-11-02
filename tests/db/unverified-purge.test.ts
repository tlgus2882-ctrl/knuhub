import { describe, expect, it } from "vitest";
import { adminClient, createTestUser, randomStudentNumber } from "../support/supabase";

async function createUnverified() {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: `unverified-${crypto.randomUUID().slice(0, 8)}@kangnam.ac.kr`,
    password: "pw-123456",
    email_confirm: false,
    user_metadata: { name: "미인증", student_number: randomStudentNumber(), phone: "010-1234-5678", privacy_consent: true },
  });
  if (error) throw error;
  return data.user.id;
}

const candidates = async (maxAge: string) => {
  const { data, error } = await adminClient().rpc("unverified_users_to_purge", { max_age: maxAge });
  if (error) throw error;
  return data.map((r) => r.id);
};

describe("메일 인증 안 한 사용자 정리", () => {
  it("메일 인증을 하지 않고 정한 시간이 지난 사용자만 지울 대상이다 (인증한 사용자·관리자는 아니다)", async () => {
    const [unverified, verified, admin] = await Promise.all([createUnverified(), createTestUser(), createTestUser({ role: "admin" })]);

    // 지금 기준으로 이미 지난 것처럼(-1시간) 물어 보면 방금 만든 미인증 사용자가 들어간다
    const now = await candidates("-1 hour");
    expect(now).toContain(unverified);
    expect(now).not.toContain(verified.id);
    expect(now).not.toContain(admin.id);
    // 24시간이 지나지 않았으니 실제 기준으로는 아직 아니다
    expect(await candidates("24 hours")).not.toContain(unverified);
  });

  it("정리는 24시간 기준으로 지우고 몇 명 지웠는지 돌려주며, 방금 가입한 미인증 사용자는 남긴다", async () => {
    const unverified = await createUnverified();

    const { data: removed, error } = await adminClient().rpc("purge_unverified_users");
    expect(error).toBeNull();
    expect(typeof removed).toBe("number");
    expect((await adminClient().auth.admin.getUserById(unverified)).data.user?.id).toBe(unverified);
  });

  it("로그인한 사용자(관리자 포함)는 정리 함수를 부르지 못한다", async () => {
    const admin = await createTestUser({ role: "admin" });
    expect((await admin.client.rpc("purge_unverified_users")).error).not.toBeNull();
    expect((await admin.client.rpc("unverified_users_to_purge", { max_age: "-1 hour" })).error).not.toBeNull();
  });

  it("관리자 사용자 목록에 메일 인증 여부가 보인다", async () => {
    const [admin, verified] = await Promise.all([createTestUser({ role: "admin" }), createTestUser()]);
    const unverified = await createUnverified();
    const rowOf = async (id: string) => {
      const { data: profile } = await adminClient().from("profile").select("name").eq("id", id).single();
      const { data } = await admin.client.rpc("admin_list_users", { query: profile!.name });
      return data!.find((r) => r.id === id)!;
    };

    expect((await rowOf(verified.id)).email_confirmed_at).not.toBeNull();
    expect((await rowOf(unverified)).email_confirmed_at).toBeNull();
  });
});
