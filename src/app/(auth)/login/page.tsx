import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>학번(교수님은 학교 메일)과 비밀번호로 로그인해요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense>
          <ConfirmFailedNotice searchParams={searchParams} />
        </Suspense>
        <LoginForm />
        <p className="text-sm text-muted-foreground">
          처음인가요?{" "}
          <Link href="/signup" className="underline">
            가입하기
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

async function ConfirmFailedNotice({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { confirm } = await searchParams;
  if (confirm !== "failed") return null;

  return (
    <p className="text-sm text-destructive">
      메일 인증에 실패했어요. 링크가 만료됐거나, 같은 학번으로 먼저 인증한 사용자가 있을 수 있어요.
      다시 가입하거나 관리자에게 문의하세요.
    </p>
  );
}
