import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { removeStudent, setAssistant } from "../actions";

// Shown only to the course's professor; course_roster() refuses everyone else.
export async function Roster({ courseId }: { courseId: string }) {
  const supabase = await createServerSupabase();
  const { data: roster } = await supabase.rpc("course_roster", { target_course: courseId });

  if (!roster) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">수강생 명단 ({roster.length}명)</h2>
      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 참여한 수강생이 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">학번</th>
                <th className="px-3 py-2 font-medium">학교 메일</th>
                <th className="px-3 py-2 font-medium">조교</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.map((student) => (
                <tr key={student.student_id}>
                  <td className="px-3 py-2">{student.name}</td>
                  <td className="px-3 py-2 font-mono">{student.student_number}</td>
                  <td className="px-3 py-2">{student.email}</td>
                  <td className="px-3 py-2">
                    <form action={setAssistant}>
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="user_id" value={student.student_id} />
                      <input type="hidden" name="assistant" value={String(!student.is_assistant)} />
                      <Button type="submit" size="sm" variant={student.is_assistant ? "default" : "outline"}>
                        {student.is_assistant ? "조교 해제" : "조교로 지정"}
                      </Button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={removeStudent}>
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="student_id" value={student.student_id} />
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        내보내기
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        본인이 입력한 이름·학번이 학교 메일과 맞는지 확인해 주세요. 수강생이 아닌 사람은 내보내고 초대 코드를 새로
        발급하면 돼요.
      </p>
    </section>
  );
}
