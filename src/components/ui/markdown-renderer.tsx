"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ComponentPropsWithoutRef } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 헤딩
          h1: ({ children, ...props }: ComponentPropsWithoutRef<"h1">) => (
            <h1 className="mb-3 mt-4 text-xl font-bold first:mt-0" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
            <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0" {...props}>{children}</h3>
          ),
          // 단락
          p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => (
            <p className="mb-2 leading-relaxed last:mb-0" {...props}>{children}</p>
          ),
          // 리스트
          ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
            <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
            <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0" {...props}>{children}</ol>
          ),
          li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => (
            <li className="leading-relaxed" {...props}>{children}</li>
          ),
          // 인라인 코드
          code: ({ children, className: codeClass, ...props }: ComponentPropsWithoutRef<"code">) => {
            const isBlock = codeClass?.includes("language-");
            if (isBlock) {
              return (
                <code className={`${codeClass ?? ""} text-sm`} {...props}>{children}</code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          },
          // 코드 블록
          pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => (
            <pre
              className="mb-3 mt-2 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm last:mb-0"
              {...props}
            >
              {children}
            </pre>
          ),
          // 인용구
          blockquote: ({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
            <blockquote
              className="mb-2 border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground last:mb-0"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // 굵게 / 기울임
          strong: ({ children, ...props }: ComponentPropsWithoutRef<"strong">) => (
            <strong className="font-semibold" {...props}>{children}</strong>
          ),
          em: ({ children, ...props }: ComponentPropsWithoutRef<"em">) => (
            <em className="italic" {...props}>{children}</em>
          ),
          // 구분선
          hr: (props: ComponentPropsWithoutRef<"hr">) => (
            <hr className="my-4 border-border" {...props} />
          ),
          // 테이블
          table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-sm" {...props}>{children}</table>
            </div>
          ),
          thead: ({ children, ...props }: ComponentPropsWithoutRef<"thead">) => (
            <thead className="border-b bg-muted/50" {...props}>{children}</thead>
          ),
          th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
            <th className="px-3 py-2 text-left font-semibold" {...props}>{children}</th>
          ),
          td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
            <td className="border-b border-border px-3 py-2" {...props}>{children}</td>
          ),
          // 링크
          a: ({ children, href, ...props }: ComponentPropsWithoutRef<"a">) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
