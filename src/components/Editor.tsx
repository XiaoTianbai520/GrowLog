import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Heading2,
  Bold,
  Italic,
  List,
  ListChecks,
  Quote,
  Link,
  Code2,
  Table2,
  ImagePlus,
} from 'lucide-react';
import { attachmentUrl, openExternal } from '../api';
import type { NoteSession } from '../lib/note-session';

export type EditorMode = 'split' | 'edit' | 'read';
interface Props {
  body: string;
  mode: EditorMode;
  attachmentDir: string;
  session: NoteSession;
  importImage: (file?: File) => Promise<string | undefined>;
  report: (e: unknown) => void;
  deleted: boolean;
  jumpLine?: number;
  jumpToken?: number;
}
export function Editor({
  body,
  mode,
  attachmentDir,
  session,
  importImage,
  report,
  deleted,
  jumpLine,
  jumpToken,
}: Props) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const preview = useRef<HTMLElement>(null);
  const [paneDrag, setPaneDrag] = useState(false);
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', backgroundColor: 'transparent', fontSize: '14px' },
        '.cm-scroller': { fontFamily: 'Consolas, "Microsoft YaHei UI", monospace', lineHeight: '1.95' },
        '.cm-content': { padding: '22px 24px 100px', caretColor: 'var(--accent)' },
        '.cm-line': { padding: '0' },
        '&.cm-focused': { outline: 'none' },
        '.cm-cursor': { borderLeftColor: 'var(--accent)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--selection) !important',
        },
        '.cm-gutters': { display: 'none' },
      }),
    ],
    [],
  );
  const insert = (before: string, placeholder: string, after = '') => {
    const view = editor.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to) || placeholder;
    view.dispatch({
      changes: { from, to, insert: before + text + after },
      selection: { anchor: from + before.length, head: from + before.length + text.length },
    });
    view.focus();
  };
  const addImage = async (file?: File) => {
    try {
      const path = await importImage(file);
      if (path) insert('![', '图片', `](${path})`);
    } catch (e) {
      report(e);
    }
  };
  // 拖拽图片释放点即插入点：先落占位符锁定位置，导入完成后原位替换为真实路径。
  const insertImageAt = async (view: NonNullable<ReactCodeMirrorRef['view']>, pos: number, file: File) => {
    const marker = `growlog-uploading-${Math.random().toString(36).slice(2)}`;
    const placeholder = `![图片](${marker})`;
    const replacePlaceholder = (replacement: string) => {
      const at = view.state.doc.toString().indexOf(placeholder);
      if (at < 0) return false;
      view.dispatch({ changes: { from: at, to: at + placeholder.length, insert: replacement } });
      return true;
    };
    view.dispatch({ changes: { from: pos, insert: placeholder } });
    view.focus();
    try {
      const path = await importImage(file);
      if (path) {
        if (!replacePlaceholder(`![图片](${path})`)) report(new Error('图片已导入，但插入位置已被删除'));
      } else {
        replacePlaceholder('');
      }
    } catch (e) {
      replacePlaceholder('');
      report(e);
    }
  };
  const allowFileDrop = (event: DragEvent) => {
    if (deleted) return;
    if (![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    setPaneDrag(true);
  };
  const leavePane = (event: DragEvent) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) return;
    setPaneDrag(false);
  };
  const imageDrop = (event: DragEvent) => {
    setPaneDrag(false);
    if (deleted) return;
    const image = [...event.dataTransfer.files].find((file) => file.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    const view = editor.current?.view;
    if (!view) return;
    const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const pos = coords ?? view.state.doc.length;
    void insertImageAt(view, pos, image);
  };
  const paste = (event: ClipboardEvent) => {
    if (deleted) return;
    const image = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'))?.getAsFile();
    if (image) {
      event.preventDefault();
      void addImage(image);
    }
  };
  useEffect(() => {
    if (!jumpLine) return;
    const frame = requestAnimationFrame(() => {
      const view = editor.current?.view;
      if (view && jumpLine <= view.state.doc.lines) {
        const line = view.state.doc.line(jumpLine);
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        });
      }
      const heading = preview.current?.querySelector<HTMLElement>(`[data-source-line="${jumpLine}"]`);
      heading?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      heading?.animate([{ background: 'var(--selection)' }, { background: 'transparent' }], {
        duration: 1400,
        easing: 'ease-out',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpLine, jumpToken, mode]);

  const heading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
    ({
      node,
      children,
    }: {
      node?: { position?: { start?: { line?: number } } };
      children?: React.ReactNode;
    }) => <Tag data-source-line={node?.position?.start?.line}>{children}</Tag>;
  return (
    <div className="editor-body">
      {!deleted && mode !== 'read' && (
        <div className="format-toolbar" aria-label="Markdown 工具栏">
          <button title="标题" aria-label="插入标题" onClick={() => insert('## ', '标题')}>
            <Heading2 size={17} />
          </button>
          <button title="粗体" aria-label="插入粗体" onClick={() => insert('**', '粗体文字', '**')}>
            <Bold size={16} />
          </button>
          <button title="斜体" aria-label="插入斜体" onClick={() => insert('*', '斜体文字', '*')}>
            <Italic size={16} />
          </button>
          <i />
          <button title="列表" aria-label="插入列表" onClick={() => insert('- ', '列表项')}>
            <List size={17} />
          </button>
          <button title="勾选项" aria-label="插入勾选项" onClick={() => insert('- [ ] ', '待办事项')}>
            <ListChecks size={17} />
          </button>
          <button title="引用" aria-label="插入引用" onClick={() => insert('> ', '引用文字')}>
            <Quote size={16} />
          </button>
          <i />
          <button
            title="链接"
            aria-label="插入链接"
            onClick={() => insert('[', '链接文字', '](https://example.com)')}
          >
            <Link size={16} />
          </button>
          <button title="代码块" aria-label="插入代码块" onClick={() => insert('\n```\n', '代码', '\n```\n')}>
            <Code2 size={17} />
          </button>
          <button
            title="表格"
            aria-label="插入表格"
            onClick={() => insert('\n', '| 标题 | 内容 |\n| --- | --- |\n| 项目 | 记录 |', '\n')}
          >
            <Table2 size={16} />
          </button>
          <button title="插入图片" aria-label="插入图片" onClick={() => void addImage()}>
            <ImagePlus size={17} />
          </button>
          <span className="toolbar-hint">Markdown</span>
        </div>
      )}
      <div className={`editor-panes mode-${mode}`}>
        {mode !== 'read' && (
          <div
            className={`source-pane ${paneDrag ? 'drag-over' : ''}`}
            onPaste={paste}
            onDragOver={allowFileDrop}
            onDragLeave={leavePane}
            onDrop={imageDrop}
            onCompositionStart={() => session.composition(true)}
            onCompositionEnd={() => session.composition(false)}
          >
            <div className="pane-label">编辑</div>
            <CodeMirror
              ref={editor}
              value={body}
              extensions={extensions}
              onChange={(value) => session.edit({ body: value })}
              editable={!deleted}
              placeholder="写下此刻的想法…"
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
                autocompletion: false,
              }}
              theme="none"
              aria-label="Markdown 正文"
            />
          </div>
        )}
        {mode !== 'edit' && (
          <div className="preview-pane">
            <div className="pane-label">{mode === 'read' ? '阅读' : '预览'}</div>
            <article ref={preview} className="markdown-preview" aria-label="笔记预览">
              {body.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    h1: heading('h1'),
                    h2: heading('h2'),
                    h3: heading('h3'),
                    h4: heading('h4'),
                    h5: heading('h5'),
                    h6: heading('h6'),
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
                        onClick={(e) => {
                          e.preventDefault();
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
              ) : (
                <p className="preview-placeholder">
                  想法落在纸上，
                  <br />
                  就有了生长的方向。
                </p>
              )}
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
