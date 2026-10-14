"use client";

import { Menu } from "@base-ui/react/menu";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const ITEMS = [
  { href: "/", label: "메인" },
  { href: "/courses", label: "과목 둘러보기" },
  { href: "/search", label: "검색" },
  { href: "/profile", label: "내 프로필" },
];

export function SiteMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label="메뉴" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
        <MenuIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-40 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none">
            {ITEMS.map((item) => (
              <Menu.LinkItem
                key={item.href}
                closeOnClick
                render={<Link href={item.href} />}
                className="flex cursor-pointer rounded-md px-3 py-2 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                {item.label}
              </Menu.LinkItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
