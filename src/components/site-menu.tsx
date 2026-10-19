"use client";

import { Menu } from "@base-ui/react/menu";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { logOut } from "@/app/(auth)/actions";
import { buttonVariants } from "@/components/ui/button";

const ITEMS = [
  { href: "/", label: "메인" },
  { href: "/courses", label: "전체 과목 둘러보기" },
  { href: "/search", label: "검색" },
  { href: "/profile", label: "내 프로필" },
  { href: "/updates", label: "업데이트" },
];

const ADMIN_ITEM = { href: "/admin", label: "관리자 페이지" };

const ITEM_CLASS =
  "flex w-full cursor-pointer rounded-md px-3 py-2 text-left outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground";

export function SiteMenu({ isAdmin }: { isAdmin: boolean }) {
  const [loggingOut, startLogOut] = useTransition();

  return (
    <Menu.Root>
      <Menu.Trigger aria-label="메뉴" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
        <MenuIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-40 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none">
            {(isAdmin ? [...ITEMS, ADMIN_ITEM] : ITEMS).map((item) => (
              <Menu.LinkItem
                key={item.href}
                closeOnClick
                render={<Link href={item.href} />}
                className={ITEM_CLASS}
              >
                {item.label}
              </Menu.LinkItem>
            ))}
            {/* The header shows 로그아웃 as a button from sm up; on phones it lives here. */}
            <Menu.Item
              disabled={loggingOut}
              onClick={() => startLogOut(() => logOut())}
              className={`${ITEM_CLASS} text-destructive sm:hidden`}
            >
              {loggingOut ? "로그아웃 중…" : "로그아웃"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
