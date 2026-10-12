import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>학교 메일과 비밀번호로 로그인해요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          <p className="text-sm text-muted-foreground">
            처음인가요?{" "}
            <Link href="/signup" className="underline">
              가입하기
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
