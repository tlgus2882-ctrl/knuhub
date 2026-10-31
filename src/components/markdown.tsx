import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders markdown (과제 descriptions, notebook cells). Raw HTML in the source is not rendered.
 * `images` maps URLs the source uses (a notebook's `attachment:plot.png`) to data URLs; any other
 * URL goes through react-markdown's safe default, which drops data: and javascript: links.
 */
export function Markdown({ children, images }: { children: string; images?: Record<string, string> }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (images && Object.hasOwn(images, url) ? images[url] : defaultUrlTransform(url))}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
