/** The code viewer for one 제출물, optionally opened at one of its files or at one entry of its 제출 이력. */
export function submissionHref(courseId: string, assignmentId: string, submissionId: string, path?: string, historyId?: string) {
  const base = `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`;
  const query = new URLSearchParams();
  if (historyId) query.set("history", historyId);
  if (path) query.set("file", path);
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}

/** Links to each file of one 제출물 (or one entry of its 제출 이력) in the code viewer. */
export function submissionFileHrefs(courseId: string, assignmentId: string, submissionId: string, historyId?: string) {
  return (path: string) => submissionHref(courseId, assignmentId, submissionId, path, historyId);
}
