import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

// Reached from the reset email: /auth/confirm signs the user in, then sends them here.
export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 비밀번호 정하기</CardTitle>
        <CardDescription>앞으로 이 비밀번호로 로그인해요.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
