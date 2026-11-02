"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { drawTeams } from "./actions";

type Props = {
  postId: string;
  /** Start the draw as soon as the page opens (설문 마감 passed, or a new 무작위 팀 추첨). */
  auto: boolean;
  /** The professor's buttons; `label` is the main one ("지금 마감하고 추첨", "다시 추첨" …). */
  buttons: { label: string; random?: boolean }[];
};

// The server never draws on its own: whoever opens the post first after the 마감 runs it from here.
export function DrawControls({ postId, auto, buttons }: Props) {
  const router = useRouter();
  const [drawing, startDraw] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const draw = (random = false) =>
    startDraw(async () => {
      setError(null);
      const outcome = await drawTeams(postId, random);
      setError(outcome.error);
      router.refresh();
    });

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      draw();
    }
    // Runs once per page open; `draw` is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <div className="flex flex-col gap-2">
      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {buttons.map((b, i) => (
            <Button key={b.label} type="button" size="sm" variant={i === 0 ? "default" : "outline"} disabled={drawing} onClick={() => draw(b.random)}>
              {b.label}
            </Button>
          ))}
        </div>
      )}
      {drawing && (
        <p className="text-sm text-muted-foreground" role="status">
          팀을 나누는 중이에요. 잠시만 기다려 주세요…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
