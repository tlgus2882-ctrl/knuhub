/**
 * The code viewer for one 제출물, optionally opened at one of its files or at one entry of its 제출 이력.
 * `source` shows a notebook (.ipynb) as its JSON with line numbers instead of as cells; `page` opens a PDF at that page.
 */
export function submissionHref(
  courseId: string,
  assignmentId: string,
  submissionId: string,
  path?: string,
  historyId?: string,
  source?: boolean,
  page?: number,
) {
  const base = `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`;
  const query = new URLSearchParams();
  if (historyId) query.set("history", historyId);
  if (path) query.set("file", path);
  if (source) query.set("view", "source");
  if (page) query.set("page", String(page));
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}

/** Links to each file of one 제출물 (or one entry of its 제출 이력) in the code viewer. */
export function submissionFileHrefs(courseId: string, assignmentId: string, submissionId: string, historyId?: string) {
  return (path: string) => submissionHref(courseId, assignmentId, submissionId, path, historyId);
}

/**
 * Compares two versions of one 제출물. A version is a 제출 이력 entry id, or `undefined` for the 지금 제출물.
 * Without `from`, the screen compares `to` with the version just before it.
 */
export function submissionCompareHref(courseId: string, assignmentId: string, submissionId: string, from?: string, to?: string) {
  const base = `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/compare`;
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}
