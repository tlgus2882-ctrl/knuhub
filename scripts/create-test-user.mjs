// Creates a 교수 or 관리자 사용자 for testing, without a real mailbox: the email is
// marked as verified and the role is set right away. Uses the secret key from
// .env.local, so run it only on your own machine (docs/adr/0002: admin tasks).
//
//   npm run admin:test-professor -- prof-test@kangnam.ac.kr "테스트 교수"
//   npm run admin:test-admin -- admin-test@kangnam.ac.kr "테스트 관리자"
//   npm run admin:test-professor -- --reset-password prof-test@kangnam.ac.kr   (lost the password)
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

const ROLE_LABEL = { professor: "교수", admin: "관리자" };

const args = process.argv.slice(2);
const roleAt = args.indexOf("--role");
const role = roleAt >= 0 ? args.splice(roleAt, 2)[1] : "professor";
if (!Object.hasOwn(ROLE_LABEL, role)) {
  console.error(`--role must be one of: ${Object.keys(ROLE_LABEL).join(", ")}`);
  process.exit(1);
}
const resetPassword = args[0] === "--reset-password";
if (resetPassword) args.shift();

const prefix = role === "admin" ? "admin-test" : "prof-test";
const email = (args[0] ?? `${prefix}-${randomBytes(3).toString("hex")}@kangnam.ac.kr`).toLowerCase();
const name = args[1] ?? `테스트 ${ROLE_LABEL[role]}`;
if (!email.endsWith("@kangnam.ac.kr")) {
  console.error("The email must end with @kangnam.ac.kr (the signup rule).");
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
// Letters and digits only, without look-alikes (0/O, 1/l/I), so it survives being copied by hand.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const password = Array.from(randomBytes(16), (byte) => ALPHABET[byte % ALPHABET.length]).join("");

if (resetPassword) {
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No user with ${email} in ${url}.`);
    process.exit(1);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) {
    console.error(`Could not reset the password of ${email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`비밀번호를 새로 만들었어요 (${url})`);
  console.log(`  메일: ${email}`);
  console.log(`  비밀번호: ${password}`);
  console.log("이 비밀번호는 다시 보여 주지 않아요. 지금 저장해 두세요.");
  process.exit(0);
}

// The signup trigger needs the same fields the signup form sends; professors and admins have no 학번.
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

const { error: roleError } = await admin.from("profile").update({ role }).eq("id", data.user.id);
if (roleError) {
  console.error(`Created ${email} but could not set its role to ${role}: ${roleError.message}`);
  console.error(`Change profile.role to ${role} in the Supabase Table Editor.`);
  process.exit(1);
}

console.log(`${ROLE_LABEL[role]} 사용자를 만들었어요 (${url})`);
console.log(`  메일: ${email}`);
console.log(`  이름: ${name}`);
console.log(`  비밀번호: ${password}`);
console.log("이 비밀번호는 다시 보여 주지 않아요. 지금 저장해 두세요.");

async function findUserByEmail(target) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found || data.users.length < 1000) return found ?? null;
  }
}
