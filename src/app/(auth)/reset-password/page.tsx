import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PASSWORD_RESET_COOKIE } from "@/lib/auth/password-reset-cookie";
import { ResetPasswordForm } from "./reset-password-form";

// Reached from the reset email via /auth/confirm, which marks the visit as a reset.
export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 비밀번호 정하기</CardTitle>
        <CardDescription>앞으로 이 비밀번호로 로그인해요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ResetPasswordGate />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function ResetPasswordGate() {
  if (!(await cookies()).has(PASSWORD_RESET_COOKIE)) {
    return (
      <p className="text-sm text-muted-foreground">
        재설정 링크로 들어와야 비밀번호를 바꿀 수 있어요.{" "}
        <Link href="/forgot-password" className="text-primary underline">
          재설정 링크 받기
        </Link>
      </p>
    );
  }
  return <ResetPasswordForm />;
}
