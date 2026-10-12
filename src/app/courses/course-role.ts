// What my_course_role() returns: my relation to one course (null = none).
export type CourseRole = "professor" | "assistant" | "student";

export function asCourseRole(value: string | null): CourseRole | null {
  return value === "professor" || value === "assistant" || value === "student" ? value : null;
}
