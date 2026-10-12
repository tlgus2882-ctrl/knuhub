import Link from "next/link";
import { WithdrawForm } from "./withdraw-form";

export default function WithdrawPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/profile" className="text-sm text-muted-foreground underline">
        ← 프로필
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">탈퇴</h1>
      <section className="flex flex-col gap-2 rounded-xl border border-destructive/40 p-5 text-sm">
        <p className="font-medium">탈퇴하면 아래 항목이 모두 지워지고 되돌릴 수 없어요.</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>프로필 (이름, 학번, 전화번호, 연락처)</li>
          <li>내가 낸 모든 제출물과 제출 파일</li>
          <li>내가 쓴 리뷰와 내 제출물에 달린 리뷰</li>
          <li>수강 중인 과목과 조교 지정</li>
        </ul>
        <p className="text-muted-foreground">탈퇴한 뒤에는 이 학교 메일과 학번으로 로그인할 수 없어요.</p>
      </section>
      <WithdrawForm />
    </main>
  );
}
