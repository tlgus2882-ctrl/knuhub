import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>비밀번호 재설정</CardTitle>
        <CardDescription>가입한 학교 메일로 재설정 링크를 보내 드려요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForgotPasswordForm />
        <Link href="/login" className="text-sm text-muted-foreground underline">
          로그인으로 돌아가기
        </Link>
      </CardContent>
    </Card>
  );
}
