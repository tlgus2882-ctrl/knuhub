/** "2026-2학기 · 01분반" — how a course's semester and section read everywhere. */
export function courseTerm(course: { semester: string; section: string }): string {
  return `${semesterLabel(course.semester)} · ${sectionLabel(course.section)}`;
}

/** Terms of a year in calendar order; a semester is "<year>-<term>" (DB: course_semester_format). */
export const SEMESTER_TERMS = ["1", "여름", "2", "겨울"] as const;

/** "2026" + "여름" → "2026-여름" */
export function semesterOf(year: string, term: string): string | null {
  return /^[0-9]{4}$/.test(year) && (SEMESTER_TERMS as readonly string[]).includes(term) ? `${year}-${term}` : null;
}

/** Newest semester first: 2027-1, 2026-겨울, 2026-2, 2026-여름, 2026-1. Older free-text ones go last. */
export function compareSemestersNewestFirst(a: string, b: string): number {
  return semesterRank(b) - semesterRank(a) || b.localeCompare(a, "ko");
}

function semesterRank(semester: string): number {
  const [year, term] = semester.split("-");
  const index = (SEMESTER_TERMS as readonly string[]).indexOf(term);
  return /^[0-9]{4}$/.test(year) && index >= 0 ? Number(year) * 10 + index : -1;
}

/** "2026-2학기". Courses opened before the format was fixed may already end in "학기". */
export function semesterLabel(semester: string): string {
  return semester.endsWith("학기") ? semester : `${semester}학기`;
}

/** "01분반" */
export function sectionLabel(section: string): string {
  return section.endsWith("분반") ? section : `${section}분반`;
}
