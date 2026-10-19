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
          <LoginNotice searchParams={searchParams} />
        </Suspense>
        <LoginForm />
        <p className="text-sm text-muted-foreground">
          처음인가요?{" "}
          <Link href="/signup" className="text-primary underline">
            가입하기
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

async function LoginNotice({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { confirm, expired } = await searchParams;
  if (expired) {
    return <p className="text-sm text-muted-foreground">로그인한 지 1시간이 지나 로그아웃됐어요. 다시 로그인해 주세요.</p>;
  }
  if (confirm !== "failed") return null;

  return (
    <p className="text-sm text-destructive">
      메일 링크를 확인하지 못했어요. 링크가 만료됐거나 이미 쓴 링크일 수 있어요. 가입 인증이라면 같은
      학번으로 먼저 인증한 사용자가 있을 수도 있어요. 다시 시도하거나 관리자에게 문의하세요.
    </p>
  );
}
