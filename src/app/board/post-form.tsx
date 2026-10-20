"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPost, updatePost, type BoardFormState } from "./actions";
import { CATEGORIES, CATEGORY_LABEL, type PostCategory } from "./categories";

const initial: BoardFormState = { error: null };

type Post = {
  id: string;
  course_id: string | null;
  category: PostCategory | null;
  is_notice: boolean;
  title: string;
  body: string;
};

type Props = {
  post?: Post;
  /** A new post on this course's 과목 게시판 (no 말머리); the 메인 게시판 when absent. */
  courseId?: string | null;
  defaultCategory?: PostCategory | null;
  /** 교수·조교 of the course may post a 공지. */
  canNotice?: boolean;
};

/** Writes a new post, or edits `post` when given. */
export function PostForm({ post, courseId = post?.course_id, defaultCategory, canNotice }: Props) {
  const [state, action, pending] = useActionState(post ? updatePost : createPost, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      {post && <input type="hidden" name="post_id" value={post.id} />}
      {courseId ? (
        <>
          <input type="hidden" name="course_id" value={courseId} />
          {canNotice && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_notice" defaultChecked={post?.is_notice} className="size-4" />
              공지로 올리기 (목록 위에 따로 보여요)
            </label>
          )}
        </>
      ) : (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">말머리</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <label
                key={category}
                className="cursor-pointer rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name="category"
                  value={category}
                  required
                  defaultChecked={(post?.category ?? defaultCategory) === category}
                  className="sr-only"
                />
                {CATEGORY_LABEL[category]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" required maxLength={200} defaultValue={post?.title} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">내용</Label>
        <textarea
          id="body"
          name="body"
          rows={10}
          required
          maxLength={20000}
          defaultValue={post?.body}
          className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "저장 중…" : post ? "고친 내용 저장" : "글 올리기"}
      </Button>
    </form>
  );
}
