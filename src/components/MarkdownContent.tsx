import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components, ExtraProps } from 'react-markdown';
import type { ComponentPropsWithoutRef } from 'react';
import { attachmentUrl, openExternal } from '../api';

interface Props {
  body: string;
  attachmentDir: string;
  report: (error: unknown) => void;
}

const sourceBlocks: Components = Object.fromEntries(
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'pre', 'tr'].map((tag) => [
    tag,
    ({ node, children, ...props }: ComponentPropsWithoutRef<'p'> & ExtraProps) => {
      const Tag = tag as 'p';
      return (
        <Tag {...props} data-source-line={node?.position?.start.line}>
          {children}
        </Tag>
      );
    },
  ]),
);

/** Shared safe renderer for reading and editor widgets. */
export function MarkdownContent({ body, attachmentDir, report }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        ...sourceBlocks,
        img: ({ src, alt }) => {
          const url = attachmentUrl(src, attachmentDir);
          return url ? (
            <img src={url} alt={alt || '笔记图片'} loading="lazy" />
          ) : (
            <span className="blocked-image">图片未加载 · 仅显示已保存到本地的图片</span>
          );
        },
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (href) void openExternal(href).catch(report);
            }}
          >
            {children}
          </a>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}
