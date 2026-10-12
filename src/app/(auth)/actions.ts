"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SignupMetadata } from "@/lib/auth/signup-metadata";
import { createServerSupabase } from "@/lib/supabase/server";

export type AuthFormState = { error: string | null };

const SCHOOL_DOMAIN = "@kangnam.ac.kr";

// The DB trigger is the real guard for these rules (docs/adr/0002). These
// checks only exist to show a clear message before calling Supabase.
export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = normalizedEmail(form);
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin");
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
      emailRedirectTo: `${siteUrl}/auth/confirm`,
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
  const email = normalizedEmail(form);
  const password = String(form.get("password") ?? "");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "메일 인증을 먼저 마쳐 주세요. 학교 메일함을 확인하세요." };
    }
    return { error: "메일 또는 비밀번호가 맞지 않습니다." };
  }

  redirect("/");
}

export async function logOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

function normalizedEmail(form: FormData): string {
  return String(form.get("email") ?? "").trim().toLowerCase();
}
