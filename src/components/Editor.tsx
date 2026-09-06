import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { markdownEnter } from '../lib/live-markdown';
import { MarkdownContent } from './MarkdownContent';
import { TyporaEditor } from './TyporaEditor';
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
import type { NoteSession } from '../lib/note-session';
import {
  resolveTyporaShortcut,
  TYPORA_SHORTCUT_LABELS,
  type TyporaShortcutAction,
} from '../lib/typora-shortcuts';

export type EditorMode = 'live' | 'source' | 'read';
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
      markdown({ base: markdownLanguage }),
      Prec.highest(keymap.of([{ key: 'Enter', run: markdownEnter }])),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', backgroundColor: 'transparent', fontSize: '14px' },
        '.cm-scroller': {
          fontFamily: 'Consolas, "Microsoft YaHei UI", monospace',
          lineHeight: '1.95',
          overflow: 'auto',
        },
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
    [mode, attachmentDir, report],
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
  const runSourceShortcut = (action: TyporaShortcutAction) => {
    const view = editor.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const wrap = (before: string, placeholder: string, after = '') => insert(before, placeholder, after);
    const replaceLines = (transform: (line: string) => string) => {
      const start = view.state.doc.lineAt(from).from;
      const end = view.state.doc.lineAt(to).to;
      const replacement = view.state.sliceDoc(start, end).split('\n').map(transform).join('\n');
      view.dispatch({ changes: { from: start, to: end, insert: replacement } });
      view.focus();
    };

    switch (action.kind) {
      case 'heading':
        replaceLines((line) => {
          const plain = line.replace(/^\s{0,3}#{1,6}\s+/, '');
          return action.level ? `${'#'.repeat(action.level)} ${plain}` : plain;
        });
        break;
      case 'heading-step':
        replaceLines((line) => {
          const match = line.match(/^(\s{0,3})(#{1,6})\s+(.*)$/);
          if (!match) return line;
          const next = match[2].length + action.delta;
          return next > 6
            ? `${match[1]}${match[3]}`
            : `${match[1]}${'#'.repeat(Math.max(1, next))} ${match[3]}`;
        });
        break;
      case 'bold':
        wrap('**', '粗体文字', '**');
        break;
      case 'italic':
        wrap('*', '斜体文字', '*');
        break;
      case 'strikethrough':
        wrap('~~', '删除线文字', '~~');
        break;
      case 'inline-code':
        wrap('`', '代码', '`');
        break;
      case 'link':
        wrap('[', '链接文字', '](https://example.com)');
        break;
      case 'table':
        wrap('\n', '| 标题 | 内容 |\n| --- | --- |\n| 项目 | 记录 |', '\n');
        break;
      case 'code-block':
        wrap('\n```\n', '代码', '\n```\n');
        break;
      case 'math-block':
        wrap('\n$$\n', '公式', '\n$$\n');
        break;
      case 'quote':
        replaceLines((line) => `> ${line.replace(/^>\s?/, '')}`);
        break;
      case 'ordered-list':
        replaceLines((line) => `1. ${line.replace(/^\d+\.\s+/, '')}`);
        break;
      case 'bullet-list':
        replaceLines((line) => `- ${line.replace(/^[-+*]\s+/, '')}`);
        break;
      case 'image':
        void addImage();
        break;
      case 'clear-format':
        if (selected) {
          const plain = selected
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/(\*\*|__|~~|`)/g, '')
            .replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$)/g, '$1');
          view.dispatch({ changes: { from, to, insert: plain } });
          view.focus();
        } else {
          replaceLines((line) => line.replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+\.)\s+/, ''));
        }
        break;
    }
  };
  const sourceShortcut = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const action = resolveTyporaShortcut(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    runSourceShortcut(action);
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

  return (
    <div className="editor-body">
      {!deleted && mode === 'source' && (
        <div className="format-toolbar" aria-label="Markdown 工具栏">
          <button
            title={`二级标题（${TYPORA_SHORTCUT_LABELS.heading[2]}）`}
            aria-label="插入二级标题"
            aria-keyshortcuts="Control+2"
            onClick={() => insert('## ', '标题')}
          >
            <Heading2 size={17} />
          </button>
          <button
            title={`粗体（${TYPORA_SHORTCUT_LABELS.bold}）`}
            aria-label="插入粗体"
            aria-keyshortcuts="Control+B"
            onClick={() => insert('**', '粗体文字', '**')}
          >
            <Bold size={16} />
          </button>
          <button
            title={`斜体（${TYPORA_SHORTCUT_LABELS.italic}）`}
            aria-label="插入斜体"
            aria-keyshortcuts="Control+I"
            onClick={() => insert('*', '斜体文字', '*')}
          >
            <Italic size={16} />
          </button>
          <i />
          <button
            title={`无序列表（${TYPORA_SHORTCUT_LABELS.bulletList}）`}
            aria-label="插入无序列表"
            aria-keyshortcuts="Control+Shift+]"
            onClick={() => insert('- ', '列表项')}
          >
            <List size={17} />
          </button>
          <button title="勾选项" aria-label="插入勾选项" onClick={() => insert('- [ ] ', '待办事项')}>
            <ListChecks size={17} />
          </button>
          <button
            title={`引用（${TYPORA_SHORTCUT_LABELS.quote}）`}
            aria-label="插入引用"
            aria-keyshortcuts="Control+Shift+Q"
            onClick={() => insert('> ', '引用文字')}
          >
            <Quote size={16} />
          </button>
          <i />
          <button
            title={`链接（${TYPORA_SHORTCUT_LABELS.link}）`}
            aria-label="插入链接"
            aria-keyshortcuts="Control+K"
            onClick={() => insert('[', '链接文字', '](https://example.com)')}
          >
            <Link size={16} />
          </button>
          <button
            title={`代码块（${TYPORA_SHORTCUT_LABELS.codeBlock}）`}
            aria-label="插入代码块"
            aria-keyshortcuts="Control+Shift+K"
            onClick={() => insert('\n```\n', '代码', '\n```\n')}
          >
            <Code2 size={17} />
          </button>
          <button
            title={`表格（${TYPORA_SHORTCUT_LABELS.table}）`}
            aria-label="插入表格"
            aria-keyshortcuts="Control+T"
            onClick={() => insert('\n', '| 标题 | 内容 |\n| --- | --- |\n| 项目 | 记录 |', '\n')}
          >
            <Table2 size={16} />
          </button>
          <button
            title={`插入图片（${TYPORA_SHORTCUT_LABELS.image}）`}
            aria-label="插入图片"
            aria-keyshortcuts="Control+Shift+I"
            onClick={() => void addImage()}
          >
            <ImagePlus size={17} />
          </button>
          <span className="toolbar-hint">Markdown</span>
        </div>
      )}
      <div className={`editor-panes mode-${mode}`}>
        {mode === 'live' && (
          <TyporaEditor
            body={body}
            attachmentDir={attachmentDir}
            session={session}
            importImage={importImage}
            report={report}
            jumpLine={jumpLine}
            jumpToken={jumpToken}
          />
        )}
        {mode === 'source' && (
          <div
            className={`source-pane ${paneDrag ? 'drag-over' : ''}`}
            onPaste={paste}
            onDragOver={allowFileDrop}
            onDragLeave={leavePane}
            onDrop={imageDrop}
            onCompositionStart={() => session.composition(true)}
            onCompositionEnd={() => session.composition(false)}
            onKeyDownCapture={sourceShortcut}
          >
            <div className="pane-label">Markdown 源码</div>
            <CodeMirror
              className="editor-host"
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
        {mode === 'read' && (
          <div className="preview-pane">
            <div className="pane-label">阅读</div>
            <article ref={preview} className="markdown-preview" aria-label="笔记预览">
              {body.trim() ? (
                <MarkdownContent body={body} attachmentDir={attachmentDir} report={report} />
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
