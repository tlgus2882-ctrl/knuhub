"use client";

import { Award } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setRecommended } from "./actions";

export function RecommendButton({ submissionId, recommended }: { submissionId: string; recommended: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={recommended ? "default" : "outline"}
        aria-pressed={recommended}
        disabled={pending}
        onClick={() => startTransition(async () => setError((await setRecommended(submissionId, !recommended)).error))}
      >
        <Award aria-hidden />
        {pending ? "저장 중…" : recommended ? "교수 추천 떼기" : "교수 추천 붙이기"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
