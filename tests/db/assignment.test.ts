import { describe, expect, it } from "vitest";
import { enrollInTestCourse, openTestCourse } from "../support/courses";
import { createTestUser, type TestUser } from "../support/supabase";

const nextWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

async function courseSetup() {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const student = await createTestUser();
  await enrollInTestCourse(student, professor, course.id);
  return { professor, course, student };
}

async function postAssignment(actor: TestUser, courseId: string, fields: Record<string, unknown> = {}) {
  return actor.client
    .from("assignment")
    .insert({ course_id: courseId, title: "1주차 과제", description: "## 요구사항", due_at: nextWeek(), ...fields })
    .select("id, title, description, due_at, visibility")
    .single();
}

describe("과제 만들기", () => {
  it("담당 교수는 과제를 만들 수 있고 공개 범위를 고르지 않으면 수강생 공개가 된다", async () => {
    const { professor, course } = await courseSetup();

    const { data, error } = await postAssignment(professor, course.id);

    expect(error).toBeNull();
    expect(data?.visibility).toBe("course");
  });

  it("공개 범위는 비공개, 수강생 공개, 학내 공개 중에서 고를 수 있다", async () => {
    const { professor, course } = await courseSetup();

    for (const visibility of ["private", "course", "campus"] as const) {
      const { data } = await postAssignment(professor, course.id, { visibility });
      expect(data?.visibility).toBe(visibility);
    }
  });

  it("세 가지 외의 공개 범위는 정할 수 없다", async () => {
    const { professor, course } = await courseSetup();

    const { error } = await postAssignment(professor, course.id, { visibility: "public" });

    expect(error).not.toBeNull();
  });

  it("그 과목의 조교도 과제를 만들 수 있다", async () => {
    const { professor, course, student } = await courseSetup();
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: student.id });

    const { error } = await postAssignment(student, course.id);

    expect(error).toBeNull();
  });

  it("학생과 다른 과목의 교수는 과제를 만들 수 없다", async () => {
    const { course, student } = await courseSetup();
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const actor of [student, otherProfessor]) {
      const { error } = await postAssignment(actor, course.id);
      expect(error).not.toBeNull();
    }
  });

  it("다른 과목의 조교는 이 과목에 과제를 만들 수 없다", async () => {
    const { professor, course } = await courseSetup();
    const otherCourse = await openTestCourse(professor);
    const assistant = await createTestUser();
    await enrollInTestCourse(assistant, professor, otherCourse.id);
    await professor.client.from("course_assistant").insert({ course_id: otherCourse.id, user_id: assistant.id });

    const { error } = await postAssignment(assistant, course.id);

    expect(error).not.toBeNull();
  });
});

describe("과제 고치기", () => {
  it("담당 교수는 제목, 설명, 마감일, 공개 범위를 언제든 바꿀 수 있다", async () => {
    const { professor, course } = await courseSetup();
    const { data: assignment } = await postAssignment(professor, course.id);
    const newDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await professor.client
      .from("assignment")
      .update({ title: "1주차 과제 (수정)", description: "바뀐 설명", due_at: newDue, visibility: "campus" })
      .eq("id", assignment!.id);

    expect(error).toBeNull();
    const { data } = await professor.client
      .from("assignment")
      .select("title, description, due_at, visibility")
      .eq("id", assignment!.id)
      .single();
    expect(data).toMatchObject({ title: "1주차 과제 (수정)", description: "바뀐 설명", visibility: "campus" });
    expect(new Date(data!.due_at).toISOString()).toBe(newDue);
  });

  it("그 과목의 조교도 과제를 고칠 수 있다", async () => {
    const { professor, course, student } = await courseSetup();
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: student.id });
    const { data: assignment } = await postAssignment(professor, course.id);

    const { data } = await student.client
      .from("assignment")
      .update({ title: "조교가 고침" })
      .eq("id", assignment!.id)
      .select("title");

    expect(data).toEqual([{ title: "조교가 고침" }]);
  });

  it("마감이 지난 뒤에도 마감일과 공개 범위를 바꿀 수 있다", async () => {
    const { professor, course } = await courseSetup();
    const { data: assignment } = await postAssignment(professor, course.id, {
      due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    const { data } = await professor.client
      .from("assignment")
      .update({ due_at: nextWeek(), visibility: "private" })
      .eq("id", assignment!.id)
      .select("visibility");

    expect(data).toEqual([{ visibility: "private" }]);
  });

  it("학생은 과제를 고칠 수 없다", async () => {
    const { professor, course, student } = await courseSetup();
    const { data: assignment } = await postAssignment(professor, course.id);

    await student.client.from("assignment").update({ title: "학생이 바꿈" }).eq("id", assignment!.id);

    const { data } = await professor.client.from("assignment").select("title").eq("id", assignment!.id).single();
    expect(data?.title).toBe("1주차 과제");
  });

  it("과제를 다른 과목으로 옮길 수 없다", async () => {
    const { professor, course } = await courseSetup();
    const otherCourse = await openTestCourse(professor);
    const { data: assignment } = await postAssignment(professor, course.id);

    const { error } = await professor.client
      .from("assignment")
      .update({ course_id: otherCourse.id })
      .eq("id", assignment!.id);

    expect(error).not.toBeNull();
  });
});

describe("과제 보기", () => {
  it("수강생은 과목의 과제 목록과 내용, 마감일을 본다", async () => {
    const { professor, course, student } = await courseSetup();
    const { data: assignment } = await postAssignment(professor, course.id);

    const { data } = await student.client
      .from("assignment")
      .select("id, title, description, due_at")
      .eq("course_id", course.id);

    expect(data).toEqual([
      { id: assignment!.id, title: "1주차 과제", description: "## 요구사항", due_at: assignment!.due_at },
    ]);
  });
});
