/** "2026-2학기 · 01분반" — how a course's semester and section read everywhere. */
export function courseTerm(course: { semester: string; section: string }): string {
  return `${course.semester}학기 · ${course.section}분반`;
}
