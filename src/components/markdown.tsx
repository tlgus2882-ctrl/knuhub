import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders assignment descriptions. Raw HTML in the source is not rendered.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
