"use client";

import { useState } from "react";

// "의심만 보기" for the 제출 현황 표: rows that are not 의심 hide themselves under data-filter.
export function StatusFilter({ suspiciousCount, children }: { suspiciousCount: number; children: React.ReactNode }) {
  const [onlySuspicious, setOnlySuspicious] = useState(false);

  return (
    <div data-filter={onlySuspicious ? "suspicious" : "all"} className="group/status flex flex-col gap-2">
      {suspiciousCount > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlySuspicious} onChange={(e) => setOnlySuspicious(e.target.checked)} />
          의심만 보기 ({suspiciousCount}명)
        </label>
      )}
      {children}
    </div>
  );
}
