import { createServerSupabase } from "@/lib/supabase/server";

type Props = { authorId: string; name: string; studentNumber: string | null };

// 작성자 카드 (GLOSSARY.md): name and 학번 are always shown; contact methods only as far as
// the author's 연락처 공개 범위 allows, which author_contacts() decides (docs/adr/0002).
export async function AuthorCard({ authorId, name, studentNumber }: Props) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("author_contacts", { target: authorId });
  const visibleContacts = data?.[0];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
          {name.slice(0, 1)}
        </div>
        <div className="flex flex-col">
          <span className="font-medium">{name}</span>
          <span className="text-sm text-muted-foreground">{studentNumber ?? "학번 없음"}</span>
        </div>
      </div>
      {visibleContacts && (visibleContacts.email || visibleContacts.open_chat_url || visibleContacts.github) && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {visibleContacts.email && (
            <li>
              <a href={`mailto:${visibleContacts.email}`} className="text-primary underline">
                {visibleContacts.email}
              </a>
            </li>
          )}
          {visibleContacts.open_chat_url && (
            <li>
              <a href={visibleContacts.open_chat_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                오픈채팅
              </a>
            </li>
          )}
          {visibleContacts.github && (
            <li>
              <a href={`https://github.com/${visibleContacts.github}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                GitHub @{visibleContacts.github}
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
