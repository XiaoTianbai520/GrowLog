import { FileText, FolderTree, Sprout } from 'lucide-react';
import type { Note } from '../types';
import { noteTitle } from '../lib/format';
import { markdownHeadings, type MarkdownHeading } from '../lib/markdown-headings';

interface Props {
  folderName: string;
  notes: Note[];
  open: (note: Note, line?: number) => void;
}

function HeadingBranch({
  heading,
  note,
  open,
}: {
  heading: MarkdownHeading;
  note: Note;
  open: Props['open'];
}) {
  return (
    <li>
      <button
        className="mind-node heading-node"
        onClick={() => open(note, heading.line)}
        title={`跳转到第 ${heading.line} 行`}
      >
        <span>{heading.text}</span>
        <small>H{heading.level}</small>
      </button>
      {heading.children.length > 0 && (
        <ul>
          {heading.children.map((child) => (
            <HeadingBranch key={child.id} heading={child} note={note} open={open} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MindMap({ folderName, notes, open }: Props) {
  const outlines = notes.map((note) => ({ note, headings: markdownHeadings(note.body) }));
  const headingCount = outlines.reduce((sum, item) => sum + countHeadings(item.headings), 0);

  return (
    <section className="mind-map" aria-label={`${folderName} 思维导图`}>
      <header className="mind-map-header">
        <div>
          <span className="eyebrow">自动生长的目录</span>
          <h2>{folderName}</h2>
          <p>Markdown 标题就是分枝。点击任意节点，回到它在笔记中的位置。</p>
        </div>
        <div className="mind-map-stats" aria-label={`${notes.length} 篇笔记，${headingCount} 个标题`}>
          <span>
            <strong>{notes.length}</strong> 篇笔记
          </span>
          <i />
          <span>
            <strong>{headingCount}</strong> 个标题
          </span>
        </div>
      </header>
      {notes.length ? (
        <div className="mind-map-canvas">
          <div className="mind-tree">
            <div className="mind-root">
              <Sprout size={17} />
              <span>{folderName}</span>
            </div>
            <ul className="mind-notes">
              {outlines.map(({ note, headings }) => (
                <li key={note.id}>
                  <button className="mind-node note-node" onClick={() => open(note)} title="打开笔记正文">
                    <FileText size={14} />
                    <span>{noteTitle(note.title)}</span>
                  </button>
                  {headings.length ? (
                    <ul>
                      {headings.map((heading) => (
                        <HeadingBranch key={heading.id} heading={heading} note={note} open={open} />
                      ))}
                    </ul>
                  ) : (
                    <span className="mind-leaf-empty">暂无 Markdown 标题</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mind-map-empty">
          <FolderTree size={31} strokeWidth={1.4} />
          <h3>这个文件夹还没有分枝</h3>
          <p>新建笔记并写下 Markdown 标题，导图会自动出现。</p>
        </div>
      )}
      <footer className="mind-map-footnote">
        <span>无需单独保存 · 标题变更后自动更新</span>
        <span>正文不会出现在导图中</span>
      </footer>
    </section>
  );
}

function countHeadings(headings: MarkdownHeading[]): number {
  return headings.reduce((sum, heading) => sum + 1 + countHeadings(heading.children), 0);
}
