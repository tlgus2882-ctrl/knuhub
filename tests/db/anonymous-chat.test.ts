import { describe, expect, it } from "vitest";
import { withdrawUser } from "../../src/lib/withdrawal/withdraw-user";
import { adminClient, anonClient, createTestUser, type TestUser } from "../support/supabase";

const send = (user: TestUser, body: string) => user.client.rpc("send_chat_message", { message: body }).single();

describe("익명 채팅", () => {
  it("로그인한 사용자만 보내고, 최근 메시지에는 작성자 없이 채팅 별명만 보인다", async () => {
    const [sender, reader] = await Promise.all([createTestUser(), createTestUser()]);

    const { data: sent, error } = await send(sender, "  안녕하세요  ");
    expect(error).toBeNull();
    expect(sent).toMatchObject({ body: "안녕하세요" });
    expect(Object.keys(sent!).sort()).toEqual(["alias", "body", "created_at", "id"]);
    expect((await anonClient().rpc("send_chat_message", { message: "몰래" })).error).not.toBeNull();

    const { data: recent } = await reader.client.rpc("recent_chat_messages");
    const mine = (await sender.client.rpc("recent_chat_messages")).data!.find((m) => m.id === sent!.id);
    expect(recent!.find((m) => m.id === sent!.id)).toEqual({ ...sent, mine: false });
    expect(mine).toMatchObject({ mine: true });
    expect(JSON.stringify(recent)).not.toContain(sender.id);
    expect((await anonClient().rpc("recent_chat_messages")).error).not.toBeNull();

    // 채팅 메시지 표는 직접 읽거나 고치거나 지우지 못한다 (보낸 사람도)
    expect((await sender.client.from("chat_message").select("id").eq("id", sent!.id)).data ?? []).toEqual([]);
    expect((await sender.client.from("chat_message").delete().eq("id", sent!.id).select("id")).data ?? []).toEqual([]);
    expect((await adminClient().from("chat_message").select("id").eq("id", sent!.id)).data).toHaveLength(1);
  });

  it("100자를 넘거나 5초 안에 다시 보내면 거부한다", async () => {
    const user = await createTestUser();
    expect((await send(user, "가".repeat(101))).error?.code).toBe("KH020");
    expect((await send(user, "   ")).error?.code).toBe("KH020");
    expect((await send(user, "가".repeat(100))).error).toBeNull();
    expect((await send(user, "또")).error?.code).toBe("KH021");
  });

  it("채팅 별명은 그날 처음 보낸 순서대로 붙고, 같은 날에는 그대로이며, 날이 바뀌면 새로 붙는다", async () => {
    const [first, second] = await Promise.all([createTestUser(), createTestUser()]);
    const { data: a } = await send(first, "첫째");
    const { data: b } = await send(second, "둘째");
    expect(b!.alias).toBeGreaterThan(a!.alias);

    await sentLongAgo(first);
    expect((await send(first, "다시")).data!.alias).toBe(a!.alias);

    // 어제 받은 별명이면 오늘은 새 번호를 받는다
    await adminClient().from("chat_alias").update({ day: "2000-01-01" }).eq("user_id", first.id);
    await sentLongAgo(first);
    const { data: next } = await send(first, "새날");
    expect(next!.alias).not.toBe(a!.alias);
    expect(next!.alias).toBeGreaterThan(b!.alias);
  });

  it("채팅 메시지는 한 번씩 신고하고, 관리자만 신고된 메시지의 실제 작성자를 보고 지운다", async () => {
    const [author, reporter, admin] = await Promise.all([createTestUser(), createTestUser(), createTestUser({ role: "admin" })]);
    const { data: reported } = await send(author, "신고될 메시지");
    const { data: quiet } = await send(reporter, "평범한 메시지");

    // 신고되지 않은 메시지의 작성자는 관리자도 못 보고, 스스로 신고해서 볼 수도 없다
    expect((await admin.client.from("chat_message").select("id").eq("id", quiet!.id)).data).toEqual([]);
    await admin.client.from("report").insert({ chat_message_id: quiet!.id, reason: "몰래" });
    expect((await admin.client.from("chat_message").select("id").eq("id", quiet!.id)).data).toEqual([]);

    const report = () => reporter.client.from("report").insert({ chat_message_id: reported!.id, reason: "욕설·비방" });
    expect((await report()).error).toBeNull();
    expect((await report()).error?.code).toBe("23505");

    const { data: seen } = await admin.client
      .from("report")
      .select("reason, chat_message(alias, body, author:profile(name, student_number))")
      .eq("chat_message_id", reported!.id)
      .single();
    expect(seen).toEqual({
      reason: "욕설·비방",
      chat_message: { alias: reported!.alias, body: "신고될 메시지", author: { name: author.name, student_number: author.studentNumber } },
    });
    expect((await reporter.client.from("chat_message").select("id").eq("id", reported!.id)).data).toEqual([]);
    expect((await reporter.client.from("chat_message").delete().eq("id", reported!.id).select("id")).data).toEqual([]);

    // 신고를 닫으면 다시 가려진다
    const { data: other } = await send(admin, "닫힐 신고");
    await reporter.client.from("report").insert({ chat_message_id: other!.id, reason: "도배" });
    expect((await admin.client.from("chat_message").select("id").eq("id", other!.id)).data).toHaveLength(1);
    await admin.client.from("report").update({ closed_at: new Date().toISOString() }).eq("chat_message_id", other!.id);
    expect((await admin.client.from("chat_message").select("id").eq("id", other!.id)).data).toEqual([]);

    expect((await admin.client.from("chat_message").delete().eq("id", reported!.id).select("id")).data).toHaveLength(1);
    expect((await reporter.client.rpc("recent_chat_messages")).data!.map((m) => m.id)).not.toContain(reported!.id);
    expect((await adminClient().from("report").select("id").eq("chat_message_id", reported!.id)).data).toEqual([]);
  });

  it("정리는 3일 지난 메시지를 지우되 처리되지 않은 신고가 걸린 것은 남기고, 탈퇴하면 메시지와 신고가 함께 지워진다", async () => {
    const [author, reporter] = await Promise.all([createTestUser(), createTestUser()]);
    const { data: old } = await send(author, "오래된 메시지");
    await sentLongAgo(author);
    const { data: kept } = await send(author, "신고된 오래된 메시지");
    await reporter.client.from("report").insert({ chat_message_id: kept!.id, reason: "도배" });
    await sentLongAgo(author);
    const { data: fresh } = await send(reporter, "새 메시지");

    expect((await reporter.client.rpc("purge_chat_messages")).error).not.toBeNull();
    expect((await adminClient().rpc("purge_chat_messages")).error).toBeNull();
    const left = async () => (await adminClient().from("chat_message").select("id").in("id", [old!.id, kept!.id, fresh!.id])).data!.map((m) => m.id).sort();
    expect(await left()).toEqual([kept!.id, fresh!.id].sort());

    expect((await withdrawUser({ userClient: author.client, adminClient: adminClient() })).error).toBeNull();
    expect(await left()).toEqual([fresh!.id]);
    expect((await adminClient().from("report").select("id").eq("chat_message_id", kept!.id)).data).toEqual([]);
  });
});

/** Moves `user`'s messages back in time so the 5-second limit lets them send again. */
async function sentLongAgo(user: TestUser) {
  await adminClient().from("chat_message").update({ created_at: "2000-01-01T00:00:00Z" }).eq("author_id", user.id);
}
