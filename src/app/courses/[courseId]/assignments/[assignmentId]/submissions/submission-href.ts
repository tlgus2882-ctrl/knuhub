/** The code viewer for one 제출물, optionally opened at one of its files or at one 제출 이력 version. */
export function submissionHref(courseId: string, assignmentId: string, submissionId: string, path?: string, version?: string) {
  const base = `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`;
  const query = new URLSearchParams();
  if (version) query.set("version", version);
  if (path) query.set("file", path);
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}

/** Links to each file of one 제출물 (or one of its 제출 이력 versions) in the code viewer. */
export function submissionFileHrefs(courseId: string, assignmentId: string, submissionId: string, version?: string) {
  return (path: string) => submissionHref(courseId, assignmentId, submissionId, path, version);
}
