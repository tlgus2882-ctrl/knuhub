import Link from "next/link";
import { cn } from "cn";

export function userHref(userId: string) {
  return `/users/${userId}`;
}

/** A person's name that opens their profile page. */
export function UserLink({ userId, name, className }: { userId: string; name: string; className?: string }) {
  return (
    <Link href={userHref(userId)} className={cn("font-medium text-primary hover:underline", className)}>
      {name}
    </Link>
  );
}
