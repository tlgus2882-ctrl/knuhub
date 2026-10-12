import { describe, expect, it } from "vitest";
import { inviteCodeOf, openTestCourse } from "../support/courses";
import { createTestUser } from "../support/supabase";

describe("과목 개설", () => {
  it("교수는 과목을 열 수 있고, 연 교수가 담당 교수가 된다", async () => {
    const professor = await createTestUser({ role: "professor" });

    const course = await openTestCourse(professor);

    const { data } = await professor.client
      .from("course")
      .select("professor_id")
      .eq("id", course.id)
      .single();
    expect(data?.professor_id).toBe(professor.id);
  });

  it("학생은 과목을 열 수 없다", async () => {
    const student = await createTestUser();

    await expect(openTestCourse(student)).rejects.toBeTruthy();
  });

  it("교수는 다른 교수를 담당 교수로 정해 과목을 열 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const other = await createTestUser({ role: "professor" });

    const { error } = await professor.client
      .from("course")
      .insert({ name: "사칭", semester: "2026-2", section: "01", professor_id: other.id });

    expect(error).not.toBeNull();
  });

  it("같은 과목명이라도 학기나 분반이 다르면 별개의 과목으로 열린다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const first = await openTestCourse(professor, { semester: "2026-2", section: "01" });

    const otherSection = await openTestCourse(professor, { name: first.name, section: "02" });
    const otherSemester = await openTestCourse(professor, { name: first.name, semester: "2027-1" });

    expect(new Set([first.id, otherSection.id, otherSemester.id]).size).toBe(3);
  });

  it("과목명, 학기, 분반이 모두 같은 과목은 또 열 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const first = await openTestCourse(professor);

    await expect(
      openTestCourse(professor, { name: first.name, semester: first.semester, section: first.section }),
    ).rejects.toBeTruthy();
  });
});

describe("초대 코드", () => {
  it("과목을 열면 초대 코드가 발급된다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);

    expect(await inviteCodeOf(professor, course.id)).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("담당 교수가 아니면 초대 코드를 볼 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const student = await createTestUser();
    const otherProfessor = await createTestUser({ role: "professor" });

    for (const viewer of [student, otherProfessor]) {
      const { data } = await viewer.client
        .from("course_invite")
        .select("invite_code")
        .eq("course_id", course.id);
      expect(data).toEqual([]);
    }
  });
});

describe("초대 코드로 참여", () => {
  it("학생이 초대 코드를 입력하면 승인 없이 수강생이 된다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const student = await createTestUser();

    const { data: joined, error } = await student.client.rpc("join_course", {
      code: await inviteCodeOf(professor, course.id),
    });

    expect(error).toBeNull();
    expect(joined).toBe(course.id);
    const { data } = await student.client.from("enrollment").select("course_id");
    expect(data).toEqual([{ course_id: course.id }]);
  });

  it("초대 코드는 대소문자와 앞뒤 공백을 가리지 않는다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const student = await createTestUser();
    const code = await inviteCodeOf(professor, course.id);

    const { data: joined } = await student.client.rpc("join_course", {
      code: ` ${code.toLowerCase()} `,
    });

    expect(joined).toBe(course.id);
  });

  it("잘못된 초대 코드로는 참여할 수 없다", async () => {
    const student = await createTestUser();

    const { error } = await student.client.rpc("join_course", { code: "NOPE0000" });

    expect(error).not.toBeNull();
    const { data } = await student.client.from("enrollment").select("course_id");
    expect(data).toEqual([]);
  });

  it("같은 코드를 두 번 입력해도 한 번만 참여된다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const student = await createTestUser();
    const code = await inviteCodeOf(professor, course.id);

    await student.client.rpc("join_course", { code });
    const { error } = await student.client.rpc("join_course", { code });

    expect(error).toBeNull();
    const { data } = await student.client.from("enrollment").select("course_id");
    expect(data).toHaveLength(1);
  });

  it("교수는 초대 코드로 수강생이 될 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const otherProfessor = await createTestUser({ role: "professor" });

    const { error } = await otherProfessor.client.rpc("join_course", {
      code: await inviteCodeOf(professor, course.id),
    });

    expect(error).not.toBeNull();
  });

  it("초대 코드 없이 수강 기록을 직접 넣을 수 없다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const course = await openTestCourse(professor);
    const student = await createTestUser();

    const { error } = await student.client
      .from("enrollment")
      .insert({ course_id: course.id, student_id: student.id });

    expect(error).not.toBeNull();
  });
});

describe("내 과목 목록", () => {
  it("학생은 자기가 참여한 과목만 수강 목록에서 본다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const joinedCourse = await openTestCourse(professor);
    await openTestCourse(professor);
    const student = await createTestUser();
    const classmate = await createTestUser();
    const code = await inviteCodeOf(professor, joinedCourse.id);
    await student.client.rpc("join_course", { code });
    await classmate.client.rpc("join_course", { code });

    const { data } = await student.client.from("enrollment").select("course_id, student_id");

    expect(data).toEqual([{ course_id: joinedCourse.id, student_id: student.id }]);
  });

  it("교수는 자기가 담당하는 과목을 찾을 수 있다", async () => {
    const professor = await createTestUser({ role: "professor" });
    const mine = await openTestCourse(professor);
    const other = await createTestUser({ role: "professor" });
    await openTestCourse(other);

    const { data } = await professor.client.from("course").select("id").eq("professor_id", professor.id);

    expect(data).toEqual([{ id: mine.id }]);
  });
});
