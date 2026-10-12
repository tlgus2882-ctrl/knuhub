// Creates a 교수 사용자 for testing, without a real mailbox: the email is marked as
// verified and the role is set to professor right away. Uses the secret key from
// .env.local, so run it only on your own machine (docs/adr/0002: admin tasks).
//
//   npm run admin:test-professor -- prof-test@kangnam.ac.kr "테스트 교수"
//
// Prints a generated password once. Sign in at /login with the email and that password.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
  process.exit(1);
}

const email = (process.argv[2] ?? `prof-test-${randomBytes(3).toString("hex")}@kangnam.ac.kr`).toLowerCase();
const name = process.argv[3] ?? "테스트 교수";
if (!email.endsWith("@kangnam.ac.kr")) {
  console.error("The email must end with @kangnam.ac.kr (the signup rule).");
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(12).toString("base64url");

// The signup trigger needs the same fields the signup form sends; professors have no 학번.
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name, student_number: null, phone: "010-0000-0000", privacy_consent: true },
});
if (error) {
  console.error(`Could not create ${email}: ${error.message}`);
  process.exit(1);
}

const { error: roleError } = await admin.from("profile").update({ role: "professor" }).eq("id", data.user.id);
if (roleError) {
  console.error(`Created ${email} but could not make it a professor: ${roleError.message}`);
  console.error("Change profile.role to professor in the Supabase Table Editor.");
  process.exit(1);
}

console.log(`교수 사용자를 만들었어요 (${url})`);
console.log(`  메일: ${email}`);
console.log(`  이름: ${name}`);
console.log(`  비밀번호: ${password}`);
console.log("이 비밀번호는 다시 보여 주지 않아요. 지금 저장해 두세요.");
