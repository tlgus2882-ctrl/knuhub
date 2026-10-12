import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>메일을 확인해 주세요</CardTitle>
        <CardDescription>학교 메일로 인증 링크를 보냈어요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>링크를 누르면 가입이 끝나고 바로 로그인돼요. 휴대폰에서 열어도 돼요.</p>
        <p>
          인증을 마쳤다면{" "}
          <Link href="/login" className="underline">
            로그인
          </Link>
          하세요.
        </p>
      </CardContent>
    </Card>
  );
}
