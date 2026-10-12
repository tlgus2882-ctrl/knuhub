/** The code viewer for one 제출물, optionally opened at one of its files. */
export function submissionHref(courseId: string, assignmentId: string, submissionId: string, path?: string) {
  const base = `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`;
  return path ? `${base}?file=${encodeURIComponent(path)}` : base;
}

/** Links to each file of one 제출물 in the code viewer. */
export function submissionFileHrefs(courseId: string, assignmentId: string, submissionId: string) {
  return (path: string) => submissionHref(courseId, assignmentId, submissionId, path);
}
