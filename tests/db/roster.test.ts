import { describe, expect, it } from "vitest";
import { enrollInTestCourse, inviteCodeOf, openTestCourse } from "../support/courses";
import { createTestUser, type TestUser } from "../support/supabase";

async function courseWithStudents(count: number) {
  const professor = await createTestUser({ role: "professor" });
  const course = await openTestCourse(professor);
  const students: TestUser[] = [];
  for (let i = 0; i < count; i++) {
    const student = await createTestUser();
    await enrollInTestCourse(student, professor, course.id);
    students.push(student);
  }
  return { professor, course, students };
}

describe("수강생 명단", () => {
  it("담당 교수는 수강생의 이름, 학번, 학교 메일을 본다", async () => {
    const { professor, course, students } = await courseWithStudents(2);

    const { data, error } = await professor.client.rpc("course_roster", { target_course: course.id });

    expect(error).toBeNull();
    expect(data?.map((row) => row.student_id).sort()).toEqual(students.map((s) => s.id).sort());
    const first = data!.find((row) => row.student_id === students[0].id)!;
    expect(first).toMatchObject({
      name: students[0].name,
      student_number: students[0].studentNumber,
      email: students[0].email,
      is_assistant: false,
    });
  });

  it("명단에는 전화번호가 없다", async () => {
    const { professor, course } = await courseWithStudents(1);

    const { data } = await professor.client.rpc("course_roster", { target_course: course.id });

    expect(Object.keys(data![0])).not.toContain("phone");
    expect(JSON.stringify(data)).not.toContain("010-");
  });

  it("담당 교수가 아니면 수강생 명단을 볼 수 없다", async () => {
    const { course, students } = await courseWithStudents(1);
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const viewer of [students[0], otherProfessor]) {
      const { data, error } = await viewer.client.rpc("course_roster", { target_course: course.id });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });
});

describe("수강생 내보내기", () => {
  it("담당 교수가 내보낸 학생은 더 이상 그 과목의 수강생이 아니다", async () => {
    const { professor, course, students } = await courseWithStudents(2);

    const { error } = await professor.client
      .from("enrollment")
      .delete()
      .eq("course_id", course.id)
      .eq("student_id", students[0].id);

    expect(error).toBeNull();
    const { data: mine } = await students[0].client.from("enrollment").select("course_id");
    expect(mine).toEqual([]);
    const { data: roster } = await professor.client.rpc("course_roster", { target_course: course.id });
    expect(roster?.map((row) => row.student_id)).toEqual([students[1].id]);
  });

  it("담당 교수가 아니면 수강생을 내보낼 수 없다", async () => {
    const { professor, course, students } = await courseWithStudents(2);

    await students[1].client
      .from("enrollment")
      .delete()
      .eq("course_id", course.id)
      .eq("student_id", students[0].id);

    const { data: roster } = await professor.client.rpc("course_roster", { target_course: course.id });
    expect(roster).toHaveLength(2);
  });

  it("내보낸 조교는 조교도 아니게 된다", async () => {
    const { professor, course, students } = await courseWithStudents(1);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: students[0].id });

    await professor.client
      .from("enrollment")
      .delete()
      .eq("course_id", course.id)
      .eq("student_id", students[0].id);

    const { data: role } = await students[0].client.rpc("my_course_role", { target_course: course.id });
    expect(role).toBeNull();
  });
});

describe("초대 코드 재발급", () => {
  it("재발급하면 새 코드로는 참여되고 이전 코드로는 참여할 수 없다", async () => {
    const { professor, course } = await courseWithStudents(0);
    const oldCode = await inviteCodeOf(professor, course.id);

    const { data: newCode, error } = await professor.client.rpc("regenerate_invite_code", {
      target_course: course.id,
    });

    expect(error).toBeNull();
    expect(newCode).not.toBe(oldCode);
    expect(await inviteCodeOf(professor, course.id)).toBe(newCode);

    const late = await createTestUser();
    const withOld = await late.client.rpc("join_course", { code: oldCode });
    const withNew = await late.client.rpc("join_course", { code: newCode! });
    expect(withOld.error?.code).toBe("KH002");
    expect(withNew.data).toBe(course.id);
  });

  it("재발급해도 이미 참여한 수강생은 그대로다", async () => {
    const { professor, course, students } = await courseWithStudents(1);

    await professor.client.rpc("regenerate_invite_code", { target_course: course.id });

    const { data } = await students[0].client.from("enrollment").select("course_id");
    expect(data).toEqual([{ course_id: course.id }]);
  });

  it("담당 교수가 아니면 초대 코드를 재발급할 수 없다", async () => {
    const { professor, course, students } = await courseWithStudents(1);
    const before = await inviteCodeOf(professor, course.id);

    const { error } = await students[0].client.rpc("regenerate_invite_code", { target_course: course.id });

    expect(error).not.toBeNull();
    expect(await inviteCodeOf(professor, course.id)).toBe(before);
  });
});

describe("조교", () => {
  it("담당 교수가 지정한 조교는 그 과목에서만 조교이고 다른 과목에서는 학생이다", async () => {
    const { professor, course, students } = await courseWithStudents(1);
    const otherCourse = await openTestCourse(professor);
    await enrollInTestCourse(students[0], professor, otherCourse.id);

    const { error } = await professor.client
      .from("course_assistant")
      .insert({ course_id: course.id, user_id: students[0].id });

    expect(error).toBeNull();
    const here = await students[0].client.rpc("my_course_role", { target_course: course.id });
    const there = await students[0].client.rpc("my_course_role", { target_course: otherCourse.id });
    expect(here.data).toBe("assistant");
    expect(there.data).toBe("student");
  });

  it("명단에서 조교가 표시된다", async () => {
    const { professor, course, students } = await courseWithStudents(2);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: students[1].id });

    const { data } = await professor.client.rpc("course_roster", { target_course: course.id });

    expect(data?.find((row) => row.student_id === students[1].id)?.is_assistant).toBe(true);
    expect(data?.find((row) => row.student_id === students[0].id)?.is_assistant).toBe(false);
  });

  it("담당 교수는 조교를 해제할 수 있다", async () => {
    const { professor, course, students } = await courseWithStudents(1);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: students[0].id });

    await professor.client
      .from("course_assistant")
      .delete()
      .eq("course_id", course.id)
      .eq("user_id", students[0].id);

    const { data } = await students[0].client.rpc("my_course_role", { target_course: course.id });
    expect(data).toBe("student");
  });

  it("수강생이 아닌 사람은 조교로 지정할 수 없다", async () => {
    const { professor, course } = await courseWithStudents(0);
    const outsider = await createTestUser();

    const { error } = await professor.client
      .from("course_assistant")
      .insert({ course_id: course.id, user_id: outsider.id });

    expect(error).not.toBeNull();
  });

  it("조교와 다른 교수는 조교를 지정할 수 없다", async () => {
    const { professor, course, students } = await courseWithStudents(2);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: students[0].id });
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const actor of [students[0], otherProfessor]) {
      const { error } = await actor.client
        .from("course_assistant")
        .insert({ course_id: course.id, user_id: students[1].id });
      expect(error).not.toBeNull();
    }
    const { data } = await students[1].client.rpc("my_course_role", { target_course: course.id });
    expect(data).toBe("student");
  });

  it("조교와 다른 교수는 조교를 해제할 수 없다", async () => {
    const { professor, course, students } = await courseWithStudents(2);
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: students[0].id });
    await professor.client.from("course_assistant").insert({ course_id: course.id, user_id: students[1].id });
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const actor of [students[0], otherProfessor]) {
      await actor.client
        .from("course_assistant")
        .delete()
        .eq("course_id", course.id)
        .eq("user_id", students[1].id);
    }

    const { data } = await students[1].client.rpc("my_course_role", { target_course: course.id });
    expect(data).toBe("assistant");
  });

  it("담당 교수에게 과목 역할은 professor다", async () => {
    const { professor, course } = await courseWithStudents(0);

    const { data } = await professor.client.rpc("my_course_role", { target_course: course.id });

    expect(data).toBe("professor");
  });
});
