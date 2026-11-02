"use client";

import { useEffect, useState } from "react";
import { hasPdfHeader } from "@/lib/submissions/pdf";

const MESSAGE = {
  loading: "PDF를 불러오는 중…",
  failed: "PDF를 불러오지 못했어요. 내려받아서 확인해 주세요.",
  notPdf: "바이너리 파일이라 미리 볼 수 없어요. 내려받아서 확인해 주세요.",
};

/**
 * A 제출물's PDF in the browser's own viewer, opened at `page`. Stored objects are octet-stream, which
 * the browser would download instead of showing, so the bytes are loaded as an application/pdf blob.
 * A file named .pdf without the %PDF header is not shown, as in AI 검토.
 */
export function PdfView({ url, page }: { url: string; page?: number }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [state, setState] = useState<keyof typeof MESSAGE>("loading");

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
      .then((bytes) => {
        if (cancelled) return;
        if (!hasPdfHeader(new Uint8Array(bytes))) return setState("notPdf");
        created = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setBlobUrl(created);
      })
      .catch(() => !cancelled && setState("failed"));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (!blobUrl) return <p className="rounded-lg border p-6 text-sm text-muted-foreground">{MESSAGE[state]}</p>;
  return <iframe src={page ? `${blobUrl}#page=${page}` : blobUrl} title="PDF 보기" className="h-[75vh] w-full rounded-lg border" />;
}
