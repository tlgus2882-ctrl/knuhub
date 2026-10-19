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

/** Name and 학번 in one rounded box that opens the person's profile page. */
export function UserChip({ userId, name, studentNumber }: { userId: string; name: string; studentNumber: string | null }) {
  return (
    <Link
      href={userHref(userId)}
      className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {name.slice(0, 1)}
      </span>
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">{studentNumber ?? "학번 없음"}</span>
    </Link>
  );
}
