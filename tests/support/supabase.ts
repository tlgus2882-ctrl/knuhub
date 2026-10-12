import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  /** Client signed in as this user: every query runs under RLS as them. */
  client: SupabaseClient<Database>;
};

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Client with no signed-in user. */
export function anonClient(): SupabaseClient<Database> {
  const { url, publishableKey } = inject("supabase");
  return createClient<Database>(url, publishableKey, noSession);
}

/** Client that bypasses RLS. Only for arranging test data, never for assertions about access. */
export function adminClient(): SupabaseClient<Database> {
  const { url, secretKey } = inject("supabase");
  return createClient<Database>(url, secretKey, noSession);
}

/** Creates a new confirmed user with a random kangnam.ac.kr email and signs them in. */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@kangnam.ac.kr`;
  const password = `pw-${randomUUID()}`;

  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, email, password, client };
}
