"use client";

import { Heart } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setLiked, type LikeTarget } from "./actions";

export function LikeButton({ target, count, liked }: { target: LikeTarget; count: number; liked: boolean }) {
  const [state, setState] = useOptimistic({ count, liked });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      setState({ liked: !state.liked, count: state.count + (state.liked ? -1 : 1) });
      setError((await setLiked(target, !state.liked)).error);
    });

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" aria-pressed={state.liked} onClick={toggle}>
        <Heart className={state.liked ? "fill-red-500 text-red-500" : undefined} aria-hidden />
        좋아요 {state.count}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
