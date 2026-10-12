"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveLoginEmail } from "@/lib/auth/resolve-login-email";
import type { SignupMetadata } from "@/lib/auth/signup-metadata";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export type AuthFormState = { error: string | null; notice?: string };

const SCHOOL_DOMAIN = "@kangnam.ac.kr";

// The DB trigger is the real guard for these rules (docs/adr/0002). These
// checks only exist to show a clear message before calling Supabase.
export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const studentNumber = String(form.get("student_number") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const consent = form.get("privacy_consent") === "on";

  if (!email.endsWith(SCHOOL_DOMAIN)) {
    return { error: "강남대 메일(@kangnam.ac.kr)로만 가입할 수 있습니다." };
  }
  if (!name || !phone || !password) {
    return { error: "이름, 전화번호, 비밀번호를 모두 입력해 주세요." };
  }
  if (studentNumber && !/^[0-9]{6,12}$/.test(studentNumber)) {
    return { error: "학번은 숫자 6~12자리로 입력해 주세요." };
  }
  if (!consent) {
    return { error: "개인정보 수집에 동의해야 가입할 수 있습니다." };
  }

  const supabase = await createServerSupabase();

  if (studentNumber) {
    const { data: taken } = await supabase.rpc("student_number_taken", {
      candidate: studentNumber,
    });
    if (taken) {
      return { error: "이미 쓰인 학번입니다. 관리자에게 문의하세요." };
    }
  }

  const metadata: SignupMetadata = {
    name,
    student_number: studentNumber || null,
    phone,
    privacy_consent: true,
  };
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
      data: metadata,
    },
  });

  if (error) {
    console.error("signUp failed", { code: error.code, status: error.status, message: error.message });
    return { error: "가입하지 못했습니다. 입력값을 확인하거나 관리자에게 문의하세요." };
  }

  redirect("/signup/check-email");
}

export async function logIn(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const identifier = String(form.get("identifier") ?? "");
  const password = String(form.get("password") ?? "");
  const wrong = { error: "학번(또는 메일)이나 비밀번호가 맞지 않습니다." };

  const email = await resolveLoginEmail(createAdminSupabase(), identifier);
  if (!email) return wrong;

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "메일 인증을 먼저 마쳐 주세요. 학교 메일함을 확인하세요." };
    }
    return wrong;
  }

  redirect("/");
}

export async function logOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

// Always answers the same way so the form can't be used to find out who has an account.
export async function requestPasswordReset(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const identifier = String(form.get("identifier") ?? "");
  const email = await resolveLoginEmail(createAdminSupabase(), identifier);

  if (email) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
    });
    if (error) console.error("resetPasswordForEmail failed", { status: error.status, message: error.message });
  }

  return {
    error: null,
    notice: "가입된 사용자라면 학교 메일로 재설정 링크를 보냈어요. 메일함을 확인해 주세요.",
  };
}

export async function updatePassword(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("password_confirm") ?? "");

  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다." };
  if (password !== confirm) return { error: "두 비밀번호가 같지 않습니다." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "비밀번호를 바꾸지 못했습니다. 재설정 링크를 다시 요청해 주세요." };
  }

  redirect("/");
}

async function siteUrl(): Promise<string> {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";
}
