import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { imageBlockSchema } from '@milkdown/kit/component/image-block';
import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  inlineCodeSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';
import { createTable, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { attachmentUrl } from '../api';
import type { NoteSession } from '../lib/note-session';
import {
  resolveTyporaShortcut,
  TYPORA_SHORTCUT_LABELS,
  type TyporaShortcutAction,
} from '../lib/typora-shortcuts';

const toolbarShortcuts = {
  bold: ['Ctrl+B', 'Control+B'],
  italic: ['Ctrl+I', 'Control+I'],
  strikethrough: ['Alt+Shift+5', 'Alt+Shift+5'],
  code: ['Ctrl+Shift+`', 'Control+Shift+`'],
  link: ['Ctrl+K', 'Control+K'],
} as const;

const topBarHints = [
  ['粗体', TYPORA_SHORTCUT_LABELS.bold, 'Control+B'],
  ['斜体', TYPORA_SHORTCUT_LABELS.italic, 'Control+I'],
  ['删除线', TYPORA_SHORTCUT_LABELS.strikethrough, 'Alt+Shift+5'],
  ['行内代码', TYPORA_SHORTCUT_LABELS.inlineCode, 'Control+Shift+`'],
  ['无序列表', TYPORA_SHORTCUT_LABELS.bulletList, 'Control+Shift+]'],
  ['有序列表', TYPORA_SHORTCUT_LABELS.orderedList, 'Control+Shift+['],
  ['任务列表', '', ''],
  ['链接', TYPORA_SHORTCUT_LABELS.link, 'Control+K'],
  ['图片', TYPORA_SHORTCUT_LABELS.image, 'Control+Shift+I'],
  ['表格', TYPORA_SHORTCUT_LABELS.table, 'Control+T'],
  ['代码块', TYPORA_SHORTCUT_LABELS.codeBlock, 'Control+Shift+K'],
  ['公式块', TYPORA_SHORTCUT_LABELS.mathBlock, 'Control+Shift+M'],
  ['引用', TYPORA_SHORTCUT_LABELS.quote, 'Control+Shift+Q'],
  ['分隔线', '', ''],
] as const;

interface Props {
  body: string;
  attachmentDir: string;
  session: NoteSession;
  importImage: (file?: File) => Promise<string | undefined>;
  report: (error: unknown) => void;
  jumpLine?: number;
  jumpToken?: number;
}

export function TyporaEditor({
  body,
  attachmentDir,
  session,
  importImage,
  report,
  jumpLine,
  jumpToken,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const importImageRef = useRef(importImage);
  const reportRef = useRef(report);
  const [ready, setReady] = useState(false);
  importImageRef.current = importImage;
  reportRef.current = report;

  const syncMarkdown = () => {
    const markdown = crepeRef.current?.getMarkdown();
    if (typeof markdown === 'string' && markdown !== session.getSnapshot().draft?.body) {
      session.edit({ body: markdown });
    }
  };

  const runShortcut = (action: TyporaShortcutAction) => {
    const crepe = crepeRef.current;
    if (!crepe) return;
    crepe.editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      const view = ctx.get(editorViewCtx);
      const setBlock = (nodeType: ReturnType<typeof paragraphSchema.type>, attrs?: Record<string, unknown>) =>
        commands.call(setBlockTypeCommand.key, { nodeType, attrs });

      switch (action.kind) {
        case 'heading':
          if (action.level === 0) setBlock(paragraphSchema.type(ctx));
          else setBlock(headingSchema.type(ctx), { level: action.level });
          break;
        case 'heading-step': {
          const node = view.state.selection.$from.parent;
          if (node.type !== headingSchema.type(ctx)) break;
          const next = Number(node.attrs.level) + action.delta;
          if (next > 6) setBlock(paragraphSchema.type(ctx));
          else setBlock(headingSchema.type(ctx), { level: Math.max(1, next) });
          break;
        }
        case 'bold':
          commands.call(toggleStrongCommand.key);
          break;
        case 'italic':
          commands.call(toggleEmphasisCommand.key);
          break;
        case 'strikethrough':
          commands.call(toggleStrikethroughCommand.key);
          break;
        case 'inline-code':
          if (view.state.selection.empty) {
            const mark = inlineCodeSchema.type(ctx);
            const active = view.state.storedMarks?.some((item) => item.type === mark);
            view.dispatch(
              active ? view.state.tr.removeStoredMark(mark) : view.state.tr.addStoredMark(mark.create()),
            );
          } else {
            commands.call(toggleInlineCodeCommand.key);
          }
          break;
        case 'link':
          commands.call(toggleLinkCommand.key);
          break;
        case 'table':
          commands.call(addBlockTypeCommand.key, { nodeType: createTable(ctx, 3, 3) });
          break;
        case 'code-block':
          setBlock(codeBlockSchema.type(ctx));
          break;
        case 'math-block':
          setBlock(codeBlockSchema.type(ctx), { language: 'LaTeX' });
          break;
        case 'quote':
          commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) });
          break;
        case 'ordered-list':
          commands.call(wrapInBlockTypeCommand.key, { nodeType: orderedListSchema.type(ctx) });
          break;
        case 'bullet-list':
          commands.call(wrapInBlockTypeCommand.key, { nodeType: bulletListSchema.type(ctx) });
          break;
        case 'image':
          commands.call(addBlockTypeCommand.key, { nodeType: imageBlockSchema.type(ctx) });
          break;
        case 'clear-format': {
          const { from, to } = view.state.selection;
          const transaction = view.state.tr.removeMark(from, to);
          if (view.state.storedMarks?.length) transaction.setStoredMarks([]);
          view.dispatch(transaction);
          setBlock(paragraphSchema.type(ctx));
          break;
        }
      }
      view.focus();
    });
  };

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let shortcutObserver: MutationObserver | undefined;
    const crepe = new Crepe({
      root: host.current,
      defaultValue: body,
      features: {
        [CrepeFeature.TopBar]: true,
        [CrepeFeature.AI]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: '写下此刻的想法…',
          mode: 'block',
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: async (file) => {
            const path = await importImageRef.current(file);
            if (!path) throw new Error('没有选择图片');
            return path;
          },
          proxyDomURL: (url) => attachmentUrl(url, attachmentDir) || '',
          inlineUploadButton: '上传图片',
          inlineUploadPlaceholderText: '粘贴图片地址',
          blockUploadButton: '上传图片',
          blockUploadPlaceholderText: '粘贴图片地址',
          blockCaptionPlaceholderText: '添加图片说明',
          blockConfirmButton: '确认',
          onImageLoadError: () => reportRef.current(new Error('图片无法加载，请确认文件仍然存在')),
        },
        [CrepeFeature.LinkTooltip]: {
          editButton: '编辑链接',
          removeButton: '移除链接',
          confirmButton: '确认',
          inputPlaceholder: '粘贴链接地址',
        },
        [CrepeFeature.Toolbar]: {
          boldLabel: '粗体',
          italicLabel: '斜体',
          strikethroughLabel: '删除线',
          codeLabel: '行内代码',
          linkLabel: '链接',
          latexLabel: '公式',
          buildToolbar: (builder) => {
            for (const group of builder.build()) {
              for (const item of group.items) {
                const shortcut = toolbarShortcuts[item.key as keyof typeof toolbarShortcuts];
                if (!shortcut) continue;
                item.shortcut = shortcut[0];
                item.ariaKeyshortcuts = shortcut[1];
              }
            }
          },
        },
        [CrepeFeature.CodeMirror]: {
          searchPlaceholder: '搜索代码语言',
          noResultText: '没有匹配的语言',
        },
        [CrepeFeature.TopBar]: {
          headingOptions: [
            { label: '正文', level: null },
            { label: '一级标题', level: 1 },
            { label: '二级标题', level: 2 },
            { label: '三级标题', level: 3 },
            { label: '四级标题', level: 4 },
            { label: '五级标题', level: 5 },
            { label: '六级标题', level: 6 },
          ],
        },
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (!disposed && markdown !== previous) session.edit({ body: markdown });
      });
      listener.blur(() => syncMarkdown());
    });
    crepeRef.current = crepe;
    void crepe
      .create()
      .then(() => {
        if (disposed) return;
        const decorateShortcutHints = () => {
          const editorHost = host.current;
          if (!editorHost) return;
          const headingButton = editorHost.querySelector<HTMLElement>('.top-bar-heading-button');
          if (headingButton) {
            headingButton.title = '段落样式（Ctrl+0–6）';
            headingButton.setAttribute('aria-label', '段落样式');
          }
          editorHost.querySelectorAll<HTMLElement>('.top-bar-heading-option').forEach((option, level) => {
            const shortcut = TYPORA_SHORTCUT_LABELS.heading[level];
            if (shortcut) {
              option.title = `${option.textContent?.trim() || '段落样式'}（${shortcut}）`;
              option.setAttribute('aria-keyshortcuts', `Control+${level}`);
            }
          });
          editorHost.querySelectorAll<HTMLElement>('.top-bar-item').forEach((button, index) => {
            const hint = topBarHints[index];
            if (!hint) return;
            const [label, shortcut, ariaShortcut] = hint;
            button.title = shortcut ? `${label}（${shortcut}）` : label;
            button.setAttribute('aria-label', label);
            if (ariaShortcut) button.setAttribute('aria-keyshortcuts', ariaShortcut);
          });
        };
        decorateShortcutHints();
        shortcutObserver = new MutationObserver(decorateShortcutHints);
        shortcutObserver.observe(host.current!, { childList: true, subtree: true });
        setReady(true);
      })
      .catch((error) => reportRef.current(error));
    return () => {
      disposed = true;
      shortcutObserver?.disconnect();
      syncMarkdown();
      crepeRef.current = null;
      void crepe.destroy();
    };
    // A note document is keyed by id. Body is deliberately only the initial
    // value so save acknowledgements never recreate the editor or lose focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentDir, session]);

  useEffect(() => {
    if (!ready || !jumpLine) return;
    const source = body.split(/\r?\n/)[jumpLine - 1] || '';
    const heading = source
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/[*_`~[\]]/g, '')
      .trim();
    if (!heading) return;
    const target = [...(host.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6') || [])].find(
      (element) => element.textContent?.trim() === heading,
    );
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.animate([{ background: 'var(--selection)' }, { background: 'transparent' }], {
      duration: 1400,
      easing: 'ease-out',
    });
  }, [body, jumpLine, jumpToken, ready]);

  const handleShortcut = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.ctrlKey && ['s', 'n'].includes(event.key.toLowerCase())) syncMarkdown();
    const action = resolveTyporaShortcut(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    runShortcut(action);
  };

  return (
    <div
      className={`typora-editor-shell ${ready ? 'ready' : ''}`}
      aria-label="Markdown 所见即所得编辑器"
      onCompositionStart={() => session.composition(true)}
      onCompositionEnd={() => {
        session.composition(false);
        queueMicrotask(syncMarkdown);
      }}
      onKeyDownCapture={handleShortcut}
    >
      {!ready && <span className="typora-loading">正在准备编辑器…</span>}
      <div ref={host} />
    </div>
  );
}
