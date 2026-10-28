import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A plain GET form to /search?q=…, so results are a shareable, server-rendered page. */
export function SearchBox({ defaultValue, className }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/search" role="search" className={cn("flex gap-2", className)}>
      <Input
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="과목명, 과제명, 학생 이름·학번"
        aria-label="검색어"
        required
      />
      <Button type="submit" variant="outline">
        검색
      </Button>
    </form>
  );
}
