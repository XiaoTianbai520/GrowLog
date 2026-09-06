import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { attachmentUrl } from '../api';
import type { NoteSession } from '../lib/note-session';

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

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
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
        if (!disposed) setReady(true);
      })
      .catch((error) => reportRef.current(error));
    return () => {
      disposed = true;
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

  const syncBeforeShortcut = (event: KeyboardEvent) => {
    if (event.ctrlKey && ['s', 'n'].includes(event.key.toLowerCase())) syncMarkdown();
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
      onKeyDownCapture={syncBeforeShortcut}
    >
      {!ready && <span className="typora-loading">正在准备编辑器…</span>}
      <div ref={host} />
    </div>
  );
}
