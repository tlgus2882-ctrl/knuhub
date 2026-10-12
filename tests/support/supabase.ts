import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["role"];

export type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  /** null for professors and admins, who have no 학번. */
  studentNumber: string | null;
  phone: string;
  role: Role;
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

/** A 9-digit 학번 unlikely to collide with any other test's. */
export function randomStudentNumber(): string {
  return `2${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

/**
 * Creates a new confirmed user with a random kangnam.ac.kr email, gives them
 * `role` (default 학생), and signs them in.
 */
export async function createTestUser({ role = "student" }: { role?: Role } = {}): Promise<TestUser> {
  const email = `test-${randomUUID()}@kangnam.ac.kr`;
  const password = `pw-${randomUUID()}`;
  const name = `테스트-${randomUUID().slice(0, 8)}`;
  const studentNumber = role === "student" ? randomStudentNumber() : null;
  const phone = `010-${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`;

  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, student_number: studentNumber, phone, privacy_consent: true },
  });
  if (error) throw error;

  if (role !== "student") {
    const { error: roleError } = await admin.from("profile").update({ role }).eq("id", data.user.id);
    if (roleError) throw roleError;
  }

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, email, password, name, studentNumber, phone, role, client };
}
