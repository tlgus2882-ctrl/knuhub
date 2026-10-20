import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { adminClient, createTestUser, type TestUser } from "../support/supabase";

const BUCKET = "profile-files";
const MB = 1024 * 1024;

async function upload(user: TestUser, owner: string, bytes: number) {
  const path = `${owner}/${randomUUID()}`;
  const { error } = await user.client.storage.from(BUCKET).upload(path, new Uint8Array(bytes));
  return { path, error };
}

async function addFile(user: TestUser, bytes: number, name = "포트폴리오.pdf") {
  const { path, error } = await upload(user, user.id, bytes);
  if (error) throw error;
  return { path, ...(await user.client.rpc("add_profile_file", { storage_path: path, file_name: name })) };
}

describe("프로필 파일", () => {
  it("본인 폴더에 올린 파일을 로그인한 누구나 보고 내려받는다", async () => {
    const [owner, viewer] = await Promise.all([createTestUser(), createTestUser({ role: "professor" })]);
    const { path, error } = await addFile(owner, 10);
    expect(error).toBeNull();

    const { data: rows } = await viewer.client.from("profile_file").select("name, size").eq("owner_id", owner.id);
    expect(rows).toEqual([{ name: "포트폴리오.pdf", size: 10 }]);
    expect((await viewer.client.storage.from(BUCKET).download(path)).error).toBeNull();
  });

  it("남의 폴더에는 올리지 못하고, 남의 파일을 지우거나 내 것으로 등록하지 못한다", async () => {
    const [owner, other] = await Promise.all([createTestUser(), createTestUser()]);
    expect((await upload(other, owner.id, 10)).error).not.toBeNull();

    const { path } = await addFile(owner, 10);
    expect((await other.client.rpc("add_profile_file", { storage_path: path, file_name: "훔침" })).error?.code).toBe("KH016");
    await other.client.from("profile_file").delete().eq("storage_path", path);
    await other.client.storage.from(BUCKET).remove([path]);
    expect((await owner.client.from("profile_file").select("id").eq("storage_path", path)).data).toHaveLength(1);
    expect((await other.client.storage.from(BUCKET).download(path)).error).toBeNull();

    // 본인은 지운다
    expect((await owner.client.from("profile_file").delete().eq("storage_path", path).select("id")).data).toHaveLength(1);
  });

  it("등록하지 않은 파일은 남이 내려받지 못한다", async () => {
    const [owner, other] = await Promise.all([createTestUser(), createTestUser()]);
    const { path } = await upload(owner, owner.id, 10);

    expect((await other.client.storage.from(BUCKET).download(path)).error).not.toBeNull();
  });

  it("파일 하나가 20MB를 넘거나, 한 사람의 파일이 합쳐서 50MB를 넘으면 거절된다", async () => {
    const owner = await createTestUser();

    expect((await upload(owner, owner.id, 20 * MB + 1)).error).not.toBeNull();
    for (let i = 0; i < 2; i++) expect((await addFile(owner, 20 * MB)).error).toBeNull();
    expect((await addFile(owner, 10 * MB)).error).toBeNull(); // 정확히 50MB
    expect((await addFile(owner, 1)).error?.code).toBe("KH015");
  });

  it("탈퇴하면 프로필 파일이 Storage에서도 지워진다", async () => {
    const owner = await createTestUser();
    const { path } = await addFile(owner, 10);

    expect((await withdrawUser({ userClient: owner.client, adminClient: adminClient() })).error).toBeNull();

    const { data } = await adminClient().storage.from(BUCKET).list(owner.id);
    expect(data ?? []).toEqual([]);
    expect((await adminClient().from("profile_file").select("id").eq("storage_path", path)).data).toEqual([]);
  });
});
