"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { logOut } from "@/app/(auth)/actions";
import { buttonVariants } from "@/components/ui/button";
import { readTheme, setTheme, type ThemeChoice } from "@/lib/theme";

const ITEMS = [
  { href: "/", label: "메인" },
  { href: "/board", label: "메인 게시판" },
  { href: "/courses", label: "전체 과목 둘러보기" },
  { href: "/search", label: "검색" },
  { href: "/profile", label: "내 프로필" },
  { href: "/updates", label: "업데이트" },
];

const ADMIN_ITEM = { href: "/admin", label: "관리자 페이지" };

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
  { value: "system", label: "시스템 설정" },
];

const ITEM_CLASS =
  "flex w-full cursor-pointer rounded-md px-3 py-2 text-left outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground";

/** Signed out, only the 화면 테마 is offered. */
export function SiteMenu({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  const [loggingOut, startLogOut] = useTransition();
  // Read when the menu opens: localStorage is not there on the server.
  const [theme, setThemeState] = useState<ThemeChoice>("system");

  return (
    <Menu.Root onOpenChange={(open) => open && setThemeState(readTheme())}>
      <Menu.Trigger aria-label="메뉴" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
        <MenuIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-40 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none">
            {signedIn &&
              (isAdmin ? [...ITEMS, ADMIN_ITEM] : ITEMS).map((item) => (
                <Menu.LinkItem key={item.href} closeOnClick render={<Link href={item.href} />} className={ITEM_CLASS}>
                  {item.label}
                </Menu.LinkItem>
              ))}
            <Menu.Group className={signedIn ? "mt-1 border-t pt-1" : undefined}>
              <Menu.GroupLabel className="px-3 py-1 text-xs text-muted-foreground">화면 테마</Menu.GroupLabel>
              <Menu.RadioGroup
                value={theme}
                onValueChange={(value: ThemeChoice) => {
                  setThemeState(value);
                  setTheme(value);
                }}
              >
                {THEMES.map((t) => (
                  <Menu.RadioItem key={t.value} value={t.value} closeOnClick className={`${ITEM_CLASS} items-center justify-between`}>
                    {t.label}
                    <Menu.RadioItemIndicator>
                      <Check className="size-4" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            {/* The header shows 로그아웃 as a button from sm up; on phones it lives here. */}
            {signedIn && (
              <Menu.Item
                disabled={loggingOut}
                onClick={() => startLogOut(() => logOut())}
                className={`${ITEM_CLASS} text-destructive sm:hidden`}
              >
                {loggingOut ? "로그아웃 중…" : "로그아웃"}
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
