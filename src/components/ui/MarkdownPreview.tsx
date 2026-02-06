"use client";

import { useRef, useCallback } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { toggleCheckbox } from "@/lib/checkbox-utils";

interface MarkdownPreviewProps {
  content: string;
  onChange?: (content: string) => void;
}

export default function MarkdownPreview({
  content,
  onChange,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      if (!onChange || !containerRef.current) return;
      const allCheckboxes = containerRef.current.querySelectorAll(
        'input[type="checkbox"]'
      );
      const index = Array.from(allCheckboxes).indexOf(e.currentTarget);
      if (index >= 0) {
        onChange(toggleCheckbox(content, index));
      }
    },
    [content, onChange]
  );

  const components: Components = {
    input: (props) => {
      if (props.type === "checkbox") {
        return (
          <input
            type="checkbox"
            checked={props.checked}
            disabled={!onChange}
            onClick={handleCheckboxClick}
            readOnly
            className={onChange ? "cursor-pointer" : ""}
          />
        );
      }
      return <input {...props} />;
    },
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="prose-custom" ref={containerRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
