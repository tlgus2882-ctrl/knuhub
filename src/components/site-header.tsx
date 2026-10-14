import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { logOut } from "@/app/(auth)/actions";
import { SiteMenu } from "@/components/site-menu";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        <Link href="/" aria-label="메인으로" className="ml-4 justify-self-start">
          <Image src="/kangnam-logo.jpg" alt="강남대학교" width={173} height={48} className="h-10 w-auto" />
        </Link>
        <div className="flex flex-col items-center text-center">
          <span className="font-brand text-2xl font-bold tracking-tight text-primary">KNU Hub</span>
          <span className="hidden text-xs text-muted-foreground sm:block">강남대 과제 공유 & 리뷰 플랫폼</span>
        </div>
        <div className="justify-self-end">
          <Suspense>
            <AccountActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function AccountActions() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <Button size="lg" className="px-4" nativeButton={false} render={<Link href="/profile" />}>
        프로필
      </Button>
      <form action={logOut}>
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="px-4 hover:border-destructive! hover:bg-destructive! hover:text-white!"
        >
          로그아웃
        </Button>
      </form>
      <SiteMenu />
    </div>
  );
}
