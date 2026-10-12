import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenCourseForm } from "./open-course-form";

export default function OpenCoursePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>과목 열기</CardTitle>
          <CardDescription>과목을 열면 학생들에게 나눠 줄 초대 코드가 생겨요.</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenCourseForm />
        </CardContent>
      </Card>
    </main>
  );
}
