/** "2026-2학기 · 01분반" — how a course's semester and section read everywhere. */
export function courseTerm(course: { semester: string; section: string }): string {
  return `${semesterLabel(course.semester)} · ${sectionLabel(course.section)}`;
}

/** "2026-2학기". The semester is typed freely, so don't double an existing "학기". */
export function semesterLabel(semester: string): string {
  return semester.endsWith("학기") ? semester : `${semester}학기`;
}

/** "01분반" */
export function sectionLabel(section: string): string {
  return section.endsWith("분반") ? section : `${section}분반`;
}
