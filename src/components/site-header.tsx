import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <Link href="/" aria-label="knuhub 메인으로" className="flex items-center gap-3">
          <Image src="/kangnam-logo.jpg" alt="강남대학교" width={173} height={48} className="h-10 w-auto" />
          <span className="text-lg font-semibold tracking-tight text-primary">knuhub</span>
        </Link>
      </div>
    </header>
  );
}
