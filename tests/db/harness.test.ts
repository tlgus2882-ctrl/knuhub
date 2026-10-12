import { describe, expect, it } from "vitest";
import { anonClient, createTestUser } from "../support/supabase";

describe("test harness", () => {
  it("signs in a freshly created user and sees them as the current user", async () => {
    const user = await createTestUser();

    const { data, error } = await user.client.auth.getUser();

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
    expect(data.user?.email).toBe(user.email);
  });

  it("creates a different user on every call", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
  });

  it("gives an anonymous client no current user", async () => {
    const { data } = await anonClient().auth.getUser();

    expect(data.user).toBeNull();
  });
});
