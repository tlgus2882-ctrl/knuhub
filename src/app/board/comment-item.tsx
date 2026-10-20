"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserLink } from "@/components/user-link";
import { CommentForm } from "./comment-form";
import { DeleteButton } from "./delete-button";
import { ReportButton } from "./report-button";

type Props = {
  comment: { id: string; body: string; authorId: string; authorName: string; writtenAt: string; edited: boolean };
  canEdit: boolean;
  canDelete: boolean;
};

export function CommentItem({ comment, canEdit, canDelete }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <li id={`comment-${comment.id}`} className="flex flex-col gap-2 p-4">
      <p className="text-sm">
        <UserLink userId={comment.authorId} name={comment.authorName} />{" "}
        <span className="text-muted-foreground">
          · {comment.writtenAt}
          {comment.edited && " (고침)"}
        </span>
      </p>
      {editing ? (
        <CommentForm comment={comment} onDone={() => setEditing(false)} />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
      )}
      {!editing && (
        <div className="flex flex-wrap items-start gap-2">
          {canEdit && (
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(true)}>
              고치기
            </Button>
          )}
          {canDelete && <DeleteButton target={{ comment_id: comment.id }} />}
          {!canEdit && <ReportButton target={{ comment_id: comment.id }} />}
        </div>
      )}
    </li>
  );
}
