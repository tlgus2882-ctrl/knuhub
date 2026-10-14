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
      <div className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" aria-label="메인으로" className="justify-self-start">
          <Image src="/kangnam-logo.jpg" alt="강남대학교" width={173} height={48} className="h-8 w-auto max-w-none" />
        </Link>
        <div className="flex flex-col items-center text-center">
          <span className="font-brand text-xl font-bold sm:text-2xl tracking-tight text-primary">KNU Hub</span>
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
      {/* On phones these move into the menu so the logo keeps its full size. */}
      <Button size="lg" className="hidden px-4 sm:inline-flex" nativeButton={false} render={<Link href="/profile" />}>
        프로필
      </Button>
      <form action={logOut} className="hidden sm:block">
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
