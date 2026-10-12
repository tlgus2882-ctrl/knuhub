import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>가입하기</CardTitle>
          <CardDescription>강남대 학교 메일로 가입해요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SignupForm />
          <p className="text-sm text-muted-foreground">
            이미 계정이 있나요?{" "}
            <Link href="/login" className="underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
