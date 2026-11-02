import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asCourseRole } from "@/app/courses/course-role";
import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Question } from "@/lib/team-draw/form-teams";
import { formatKst } from "@/lib/time";
import { addTeamMember, moveTeamMember, publishTeamDraw, removeTeamMember, setExcluded } from "./actions";
import { DrawControls } from "./draw-controls";
import { SurveyForm } from "./survey-form";

type TeamDrawStatus = Database["public"]["Enums"]["team_draw_status"];

type Member = { id: string; team_no: number | null; user_id: string | null; guest_name: string | null; profile: { name: string } | null };

const memberName = (m: Member) => m.profile?.name ?? m.guest_name ?? "알 수 없음";

/** The 팀 추첨 part of its post: the 설문, the draw, and the teams, by who is looking. */
export async function TeamDrawPanel({ postId, courseId }: { postId: string; courseId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: draw }, { data: role }, { data: claims }, { data: members }] = await Promise.all([
    supabase.from("team_draw").select("mode, team_size, questions, survey_due_at, status, excluded, edited_at").eq("post_id", postId).single(),
    supabase.rpc("my_course_role", { target_course: courseId }),
    supabase.auth.getClaims(),
    supabase.from("team_member").select("id, team_no, user_id, guest_name, profile(name)").eq("post_id", postId).order("team_no"),
  ]);
  if (!draw) return null;
  await connection();

  // Only which parts to show: RLS decides what each person may read and change (docs/adr/0002).
  const me = claims?.claims.sub;
  const myRole = asCourseRole(role);
  const professor = myRole === "professor";
  const questions = draw.questions as Question[];
  const surveyOpen = draw.mode === "survey" && draw.status === "open" && new Date(draw.survey_due_at!) > new Date();
  const placed = (members ?? []).filter((m) => m.team_no !== null);
  const guests = (members ?? []).filter((m) => m.user_id === null);
  const teamCount = Math.max(0, ...placed.map((m) => m.team_no!));

  return (
    <section className="flex flex-col gap-5 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">
        {draw.mode === "survey" ? "설문을 받아 AI가 나눠요" : "무작위로 나눠요"} · 팀당 {draw.team_size}명
        {draw.survey_due_at && ` · 설문 마감 ${formatKst(draw.survey_due_at)}`}
      </p>

      {surveyOpen && myRole === "student" && <MySurvey postId={postId} questions={questions} me={me} />}
      <Status status={draw.status} surveyOpen={surveyOpen} staff={professor || myRole === "assistant"} />

      {professor && draw.status !== "published" && (
        <DrawControls
          postId={postId}
          auto={draw.status === "open" && (draw.mode === "random" || !surveyOpen)}
          buttons={drawButtons(draw.status, draw.mode, surveyOpen)}
        />
      )}
      {/* After the 마감 anyone in the course may start the draw; the professor's controls above do it for them. */}
      {!professor && myRole && draw.status === "open" && draw.mode === "survey" && !surveyOpen && (
        <DrawControls postId={postId} auto buttons={[]} />
      )}

      {placed.length > 0 && (
        <Teams
          members={placed}
          teamCount={teamCount}
          editable={professor}
          editedAt={draw.status === "published" ? draw.edited_at : null}
        />
      )}

      {professor && (
        <>
          {draw.status === "drafted" && (
            <form action={publishTeamDraw} className="flex flex-col gap-1">
              <input type="hidden" name="post_id" value={postId} />
              <Button type="submit" className="self-start">
                결과 공개하기
              </Button>
              <p className="text-xs text-muted-foreground">공개하면 수강생이 모든 팀을 봐요. 공개한 뒤에는 다시 추첨할 수 없고, 사람을 옮기고 빼고 더할 수만 있어요.</p>
            </form>
          )}
          {placed.length > 0 && <AddToTeam postId={postId} courseId={courseId} teamCount={teamCount} members={members ?? []} />}
          {draw.status !== "published" && (
            <Targets postId={postId} courseId={courseId} excluded={draw.excluded} guests={guests} drawn={draw.status === "drafted"} />
          )}
          {draw.mode === "survey" && <Note postId={postId} />}
          {draw.mode === "survey" && <Responses postId={postId} questions={questions} />}
          {draw.status !== "published" && (
            <Link href={`/board/${postId}/edit`} className="self-start text-sm text-muted-foreground hover:underline">
              설정 고치기
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function drawButtons(status: TeamDrawStatus, mode: Database["public"]["Enums"]["team_draw_mode"], surveyOpen: boolean): { label: string; random?: boolean }[] {
  if (status === "open") return surveyOpen ? [{ label: "지금 마감하고 추첨" }] : [];
  if (status === "failed") return mode === "survey" ? [{ label: "다시 시도" }, { label: "무작위로 나누기", random: true }] : [{ label: "다시 시도" }];
  if (status === "drafted") return mode === "survey" ? [{ label: "다시 추첨" }, { label: "무작위로 다시 나누기", random: true }] : [{ label: "다시 추첨" }];
  // drawing: a draw that died more than 5 minutes ago can be taken again
  return [{ label: "다시 시도" }];
}

function Status({ status, surveyOpen, staff }: { status: TeamDrawStatus; surveyOpen: boolean; staff: boolean }) {
  let text: string | null = null;
  if (surveyOpen || status === "published") text = null;
  else if (status === "drawing") text = "팀을 나누는 중이에요.";
  else if (!staff) text = status === "open" ? "아직 팀을 나누지 않았어요. 나누고 공개되면 여기에 팀이 보여요." : "교수님이 결과를 확인하고 있어요. 공개되면 여기에 팀이 보여요.";
  else if (status === "failed") text = "AI가 팀을 나누지 못했어요.";
  else if (status === "drafted") text = "아직 공개 전이에요. 담당 교수와 조교만 이 결과를 봐요.";
  return text && <p className="text-sm">{text}</p>;
}

async function MySurvey({ postId, questions, me }: { postId: string; questions: Question[]; me: string | undefined }) {
  const supabase = await createServerSupabase();
  const { data: mine } = await supabase.from("survey_response").select("answers").eq("post_id", postId).eq("user_id", me ?? "").maybeSingle();
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">설문</h2>
      <p className="text-xs text-muted-foreground">응답은 나와 담당 교수만 봐요. 응답하지 않으면 남은 자리에 무작위로 들어가요.</p>
      <SurveyForm postId={postId} questions={questions} answers={(mine?.answers as string[] | undefined) ?? null} />
    </div>
  );
}

type TeamsProps = { members: Member[]; teamCount: number; editable: boolean; editedAt: string | null };

function Teams({ members, teamCount, editable, editedAt }: TeamsProps) {
  const teams = Array.from({ length: teamCount }, (_, i) => members.filter((m) => m.team_no === i + 1));
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">팀 ({teams.filter((t) => t.length).length}팀)</h2>
      {editedAt && <p className="text-xs text-muted-foreground">마지막 수정 {formatKst(editedAt)}</p>}
      <ol className="grid gap-3 sm:grid-cols-2">
        {teams.map(
          (team, i) =>
            team.length > 0 && (
              <li key={i} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">{i + 1}팀</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {team.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        {memberName(m)}
                        {m.guest_name && <span className="ml-1 text-xs text-muted-foreground">(이름만)</span>}
                      </span>
                      {editable && <MemberActions member={m} teamCount={teamCount} />}
                    </li>
                  ))}
                </ul>
              </li>
            ),
        )}
      </ol>
    </div>
  );
}

function MemberActions({ member, teamCount }: { member: Member; teamCount: number }) {
  return (
    <>
      <form action={moveTeamMember} className="flex items-center gap-1">
        <input type="hidden" name="member_id" value={member.id} />
        <select name="team_no" aria-label={`${memberName(member)} 옮길 팀`} defaultValue={member.team_no ?? 1} className="h-7 rounded-md border border-input bg-transparent px-1 text-xs">
          {Array.from({ length: teamCount + 1 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i === teamCount ? "새 팀" : `${i + 1}팀`}
            </option>
          ))}
        </select>
        <Button type="submit" size="xs" variant="outline">
          옮기기
        </Button>
      </form>
      <form action={removeTeamMember}>
        <input type="hidden" name="member_id" value={member.id} />
        <Button type="submit" size="xs" variant="ghost" className="text-destructive">
          빼기
        </Button>
      </form>
    </>
  );
}

/** Puts a 수강생 who is in no team, or a name typed in, into a team. */
async function AddToTeam({ postId, courseId, teamCount, members }: { postId: string; courseId: string; teamCount: number; members: Member[] }) {
  const supabase = await createServerSupabase();
  const { data: roster } = await supabase.rpc("course_roster", { target_course: courseId });
  const inTeam = new Set(members.map((m) => m.user_id));
  const free = (roster ?? []).filter((s) => !inTeam.has(s.student_id));
  return (
    <form action={addTeamMember} className="flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="post_id" value={postId} />
      <input type="hidden" name="course_id" value={courseId} />
      <select name="team_no" aria-label="더할 팀" className="h-8 rounded-lg border border-input bg-transparent px-2">
        {Array.from({ length: teamCount + 1 }, (_, i) => (
          <option key={i} value={i + 1}>
            {i === teamCount ? "새 팀" : `${i + 1}팀`}
          </option>
        ))}
      </select>
      <select name="user_id" aria-label="더할 수강생" className="h-8 rounded-lg border border-input bg-transparent px-2">
        <option value="">수강생 고르기</option>
        {free.map((s) => (
          <option key={s.student_id} value={s.student_id}>
            {s.name} ({s.student_number})
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">또는</span>
      <Input name="guest_name" placeholder="이름만 더하기" maxLength={50} className="w-36" />
      <Button type="submit" size="sm" variant="outline">
        팀에 더하기
      </Button>
    </form>
  );
}

type TargetsProps = { postId: string; courseId: string; excluded: string[]; guests: Member[]; drawn: boolean };

/** 추첨 대상: every 수강생 but 조교, minus those taken out, plus names added by hand. */
async function Targets({ postId, courseId, excluded, guests, drawn }: TargetsProps) {
  const supabase = await createServerSupabase();
  const { data: roster } = await supabase.rpc("course_roster", { target_course: courseId });
  const students = (roster ?? []).filter((s) => !s.is_assistant);
  const out = new Set(excluded);
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        추첨 대상 ({students.filter((s) => !out.has(s.student_id)).length + guests.length}명)
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <p className="text-xs text-muted-foreground">
          추첨하는 시점의 수강생 전원(조교 제외)이 대상이에요. 체크를 풀면 대상에서 빠져요.
          {drawn && " 바꾼 대상은 다시 추첨해야 결과에 반영돼요."}
        </p>
        {students.length > 0 && (
          <form action={setExcluded} className="flex flex-col gap-2">
            <input type="hidden" name="post_id" value={postId} />
            {/* The checked boxes are the whole new list of who is taken out. */}
            <ul className="grid gap-1 sm:grid-cols-2">
              {students.map((s) => (
                <li key={s.student_id}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="excluded" value={s.student_id} defaultChecked={out.has(s.student_id)} className="size-4" />
                    빼기 · {s.name} ({s.student_number})
                  </label>
                </li>
              ))}
            </ul>
            <Button type="submit" size="sm" variant="outline" className="self-start">
              대상 저장
            </Button>
          </form>
        )}
        {guests.length > 0 && (
          <ul className="flex flex-col gap-1">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                {g.guest_name} <span className="text-xs text-muted-foreground">(이름만)</span>
                <form action={removeTeamMember}>
                  <input type="hidden" name="member_id" value={g.id} />
                  <Button type="submit" size="xs" variant="ghost" className="text-destructive">
                    빼기
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addTeamMember} className="flex items-center gap-2">
          <input type="hidden" name="post_id" value={postId} />
          <input type="hidden" name="course_id" value={courseId} />
          <Input name="guest_name" placeholder="가입하지 않은 사람 이름" maxLength={50} required className="w-48" />
          <Button type="submit" size="sm" variant="outline">
            이름 더하기
          </Button>
        </form>
      </div>
    </details>
  );
}

/** AI 편성 근거: RLS shows it to the professor only. */
async function Note({ postId }: { postId: string }) {
  const supabase = await createServerSupabase();
  const { data: note } = await supabase.from("team_draw_note").select("rationale").eq("post_id", postId).maybeSingle();
  if (!note) return null;
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-sm">
      <p className="mb-1 text-xs font-medium text-muted-foreground">AI 편성 근거 (담당 교수만 봐요)</p>
      <p className="whitespace-pre-wrap">{note.rationale}</p>
    </div>
  );
}

/** Every 설문 응답, for the professor (RLS shows each student only their own). */
async function Responses({ postId, questions }: { postId: string; questions: Question[] }) {
  const supabase = await createServerSupabase();
  const { data: responses } = await supabase.from("survey_response").select("user_id, answers, profile(name)").eq("post_id", postId);
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">설문 응답 ({responses?.length ?? 0}명)</summary>
      {responses?.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">이름</th>
                {questions.map((q, i) => (
                  <th key={i} className="py-1 pr-3 font-medium">
                    {q.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {responses.map((r) => (
                <tr key={r.user_id}>
                  <td className="py-1 pr-3 whitespace-nowrap">{r.profile?.name ?? "알 수 없음"}</td>
                  {(r.answers as string[]).map((a, i) => (
                    <td key={i} className="py-1 pr-3 whitespace-pre-wrap">
                      {a}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">아직 응답이 없어요.</p>
      )}
    </details>
  );
}
