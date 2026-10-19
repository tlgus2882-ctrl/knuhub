import Link from "next/link";
import { UPDATES } from "./updates";

export default function UpdatesPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground underline hover:text-primary">
        ← 처음으로
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">업데이트</h1>
      <ol className="flex flex-col gap-4">
        {UPDATES.map((update) => (
          <li key={`${update.date} ${update.title}`} className="rounded-lg border p-4">
            <time dateTime={update.date} className="text-sm text-muted-foreground">
              {update.date.replaceAll("-", ".")}
            </time>
            <h2 className="mt-1 font-semibold">{update.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {update.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}
