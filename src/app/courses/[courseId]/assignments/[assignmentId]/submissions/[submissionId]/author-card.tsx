// 작성자 카드 (GLOSSARY.md): name and 학번 are always shown. Contact methods come in #18.
export function AuthorCard({ name, studentNumber }: { name: string; studentNumber: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-4">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
        {name.slice(0, 1)}
      </div>
      <div className="flex flex-col">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">{studentNumber ?? "학번 없음"}</span>
      </div>
    </div>
  );
}
