"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPost, updatePost, type BoardFormState } from "./actions";
import { CATEGORIES, CATEGORY_LABEL, type PostCategory } from "./categories";

const initial: BoardFormState = { error: null };

type Post = { id: string; category: PostCategory; title: string; body: string };

/** Writes a new post, or edits `post` when given. */
export function PostForm({ post, defaultCategory }: { post?: Post; defaultCategory?: PostCategory | null }) {
  const [state, action, pending] = useActionState(post ? updatePost : createPost, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      {post && <input type="hidden" name="post_id" value={post.id} />}
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
