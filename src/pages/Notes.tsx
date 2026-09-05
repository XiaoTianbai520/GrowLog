import { useState, type DragEvent, type FormEvent } from 'react';
import {
  Plus,
  Search,
  Folder,
  FolderPlus,
  Star,
  Trash2,
  FileText,
  FileUp,
  FileDown,
  ChevronDown,
  X,
  RotateCcw,
  Pencil,
  MoreHorizontal,
  Check,
  CloudOff,
  LoaderCircle,
  ListTree,
  Network,
} from 'lucide-react';
import type { Note, Snapshot } from '../types';
import type { NoteSession, SaveStatus } from '../lib/note-session';
import { isMarkdownFile } from '../lib/markdown-io';
import { Editor, type EditorMode } from '../components/Editor';
import { excerpt, noteTitle, shortDate } from '../lib/format';
import { MindMap } from '../components/MindMap';

interface Props {
  data: Snapshot;
  draft: Note | null;
  status: SaveStatus;
  saveError: string | null;
  session: NoteSession;
  openNote: (note: Note) => void;
  createNote: (folderId?: string) => void;
  trash: (note: Note) => void;
  restore: (note: Note) => void;
  remove: (note: Note) => void;
  editFolder: (id?: string) => void;
  deleteFolder: (id: string) => void;
  importImage: (file?: File) => Promise<string | undefined>;
  importMarkdown: (file?: File) => void;
  exportMarkdown: (note: Note) => void;
  report: (e: unknown) => void;
}
export function Notes({
  data,
  draft,
  status,
  saveError,
  session,
  openNote,
  createNote,
  trash,
  restore,
  remove,
  editFolder,
  deleteFolder,
  importImage,
  importMarkdown,
  exportMarkdown,
  report,
}: Props) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [mode, setMode] = useState<EditorMode>('live');
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [folderView, setFolderView] = useState<'list' | 'map'>('list');
  const [jump, setJump] = useState<{ noteId: string; line: number; token: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const trashView = filter === 'trash';
  const notes = data.notes.filter(
    (note) =>
      Boolean(note.deletedAt) === trashView &&
      (filter === 'all' ||
        filter === 'trash' ||
        (filter === 'starred' ? note.favorite : note.folderId === filter)) &&
      (!tagFilter || note.tags.includes(tagFilter)) &&
      `${note.title}\n${note.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const currentFolder = data.folders.find((f) => f.id === filter);
  const draggingFiles = (event: DragEvent) => [...event.dataTransfer.types].includes('Files');
  const dragOverLayout = (event: DragEvent) => {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    // 编辑区有自己的高亮（图片落点提示），覆盖层只在其余区域出现。
    const overEditor = Boolean((event.target as Element | null)?.closest?.('.source-pane'));
    setDragOver(!overEditor);
  };
  const dragLeaveLayout = (event: DragEvent) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOver(false);
  };
  const dropOnLayout = (event: DragEvent) => {
    setDragOver(false);
    if (!draggingFiles(event)) return;
    event.preventDefault();
    const markdown = [...event.dataTransfer.files].find(isMarkdownFile);
    if (markdown) importMarkdown(markdown);
  };
  const addTag = (event: FormEvent) => {
    event.preventDefault();
    const tags = tagInput
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (draft && tags.length) {
      session.edit({ tags: [...new Set([...draft.tags, ...tags])] });
      setTagInput('');
    }
  };
  const statuses = { saved: '已保存', dirty: '等待保存', saving: '正在保存', error: '保存失败' };
  return (
    <div
      className={`notes-layout ${dragOver ? 'drop-hover' : ''}`}
      onDragOver={dragOverLayout}
      onDragLeave={dragLeaveLayout}
      onDrop={dropOnLayout}
    >
      <aside className="note-browser">
        <div className="note-browser-title">
          <h2>笔记本</h2>
          <div className="title-actions">
            <button
              className="icon-button"
              title="导入 Markdown 文件"
              aria-label="导入 Markdown"
              onClick={() => importMarkdown()}
            >
              <FileUp size={19} />
            </button>
            <button
              className="icon-button"
              title="新建笔记 Ctrl+N"
              aria-label="新建笔记"
              onClick={() => createNote(currentFolder?.id)}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="搜索当前笔记"
            placeholder="搜索笔记…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="note-filters">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            <FileText size={16} />
            全部笔记<span>{data.notes.filter((n) => !n.deletedAt).length}</span>
          </button>
          <button className={filter === 'starred' ? 'selected' : ''} onClick={() => setFilter('starred')}>
            <Star size={16} />
            收藏<span>{data.notes.filter((n) => !n.deletedAt && n.favorite).length}</span>
          </button>
          <div className="folder-heading">
            <button onClick={() => setFoldersOpen(!foldersOpen)}>
              <ChevronDown size={13} className={foldersOpen ? '' : 'rotated'} />
              文件夹
            </button>
            <button aria-label="新建文件夹" title="新建文件夹" onClick={() => editFolder()}>
              <FolderPlus size={15} />
            </button>
          </div>
          {foldersOpen &&
            data.folders.map((folder) => (
              <div className="folder-row" key={folder.id}>
                <button
                  className={filter === folder.id ? 'selected' : ''}
                  onClick={() => {
                    setFilter(folder.id);
                    setFolderView('list');
                  }}
                >
                  <Folder size={15} />
                  <span className="folder-name">{folder.name}</span>
                  <span>{data.notes.filter((n) => !n.deletedAt && n.folderId === folder.id).length}</span>
                </button>
                <button
                  className="folder-menu-toggle"
                  aria-label={`管理文件夹 ${folder.name}`}
                  onClick={() => setFolderMenu(folderMenu === folder.id ? null : folder.id)}
                >
                  <MoreHorizontal size={14} />
                </button>
                {folderMenu === folder.id && (
                  <div className="folder-menu">
                    <button
                      onClick={() => {
                        setFolderMenu(null);
                        editFolder(folder.id);
                      }}
                    >
                      <Pencil size={13} />
                      重命名
                    </button>
                    <button
                      onClick={() => {
                        setFolderMenu(null);
                        deleteFolder(folder.id);
                        setFilter('all');
                      }}
                    >
                      <Trash2 size={13} />
                      删除文件夹
                    </button>
                  </div>
                )}
              </div>
            ))}
          {foldersOpen && !data.folders.length && <p className="folder-empty">用文件夹整理不同主题</p>}
        </div>
        <div className="note-list-heading">
          <span>
            {trashView ? '回收站' : currentFolder?.name || (filter === 'starred' ? '收藏的笔记' : '最近更新')}{' '}
            · {notes.length}
          </span>
          <select aria-label="按标签筛选" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">全部标签</option>
            {data.tags.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        </div>
        {currentFolder && !trashView && (
          <div className="folder-view-switch segmented" aria-label="文件夹视图">
            <button className={folderView === 'list' ? 'active' : ''} onClick={() => setFolderView('list')}>
              <ListTree size={13} />
              列表
            </button>
            <button className={folderView === 'map' ? 'active' : ''} onClick={() => setFolderView('map')}>
              <Network size={13} />
              导图
            </button>
          </div>
        )}
        <div className="note-list">
          {notes.map((note) => (
            <button
              key={note.id}
              className={`note-list-item ${note.id === draft?.id ? 'active' : ''}`}
              onClick={() => openNote(note)}
            >
              <strong>
                {noteTitle(note.title)}
                {note.favorite && <Star size={12} />}
              </strong>
              <p>{excerpt(note.body)}</p>
              <small>
                {shortDate(note.updatedAt)}
                {note.tags[0] && <span>#{note.tags[0]}</span>}
              </small>
            </button>
          ))}
          {!notes.length && (
            <div className="list-empty">
              {query || tagFilter ? '没有找到匹配的笔记' : trashView ? '回收站是空的' : '还没有笔记'}
              {!trashView && !query && (
                <button className="text-button" onClick={() => createNote(currentFolder?.id)}>
                  新建一篇
                </button>
              )}
            </div>
          )}
        </div>
        <button className={`trash-filter ${trashView ? 'selected' : ''}`} onClick={() => setFilter('trash')}>
          <Trash2 size={15} />
          回收站<span>{data.notes.filter((n) => n.deletedAt).length}</span>
        </button>
      </aside>
      {currentFolder && folderView === 'map' && !trashView ? (
        <MindMap
          folderId={currentFolder.id}
          folderName={currentFolder.name}
          notes={data.notes
            .filter((note) => !note.deletedAt && note.folderId === currentFolder.id)
            .map((note) => (note.id === draft?.id ? draft : note))}
          open={(note, line) => {
            setJump(line ? { noteId: note.id, line, token: Date.now() } : null);
            setFolderView('list');
            openNote(note);
          }}
        />
      ) : draft ? (
        <section className="note-document" key={draft.id}>
          <div className="document-toolbar">
            <div className={`save-indicator ${status}`} title={saveError || '内容自动保存在本机'}>
              {status === 'saving' ? (
                <LoaderCircle className="spin" size={13} />
              ) : status === 'error' ? (
                <CloudOff size={13} />
              ) : (
                <Check size={13} />
              )}
              <span>{statuses[status]}</span>
            </div>
            <div className="document-actions">
              <div className="segmented compact" aria-label="编辑模式">
                {(['live', 'source', 'read'] as const).map((value) => (
                  <button
                    className={mode === value ? 'active' : ''}
                    onClick={() => setMode(value)}
                    key={value}
                  >
                    {{ live: '原位编辑', source: '源码', read: '阅读' }[value]}
                  </button>
                ))}
              </div>
              {!draft.deletedAt && (
                <>
                  <button
                    className="icon-button"
                    title="导出为 Markdown 文件"
                    aria-label="导出 Markdown"
                    onClick={() => exportMarkdown(draft)}
                  >
                    <FileDown size={17} />
                  </button>
                  <button
                    className={`icon-button ${draft.favorite ? 'is-favorite' : ''}`}
                    aria-label={draft.favorite ? '取消收藏' : '收藏笔记'}
                    title="收藏笔记"
                    onClick={() => session.edit({ favorite: !draft.favorite })}
                  >
                    <Star size={17} fill={draft.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="icon-button"
                    title="移到回收站"
                    aria-label="移到回收站"
                    onClick={() => trash(draft)}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
          {status === 'error' && (
            <div className="save-error" role="alert">
              <span>{saveError}</span>
              <button onClick={() => void session.flush().catch(report)}>重试保存</button>
            </div>
          )}
          {draft.deletedAt && (
            <div className="trash-notice">
              <span>这篇笔记在回收站中，只能阅读。</span>
              <button onClick={() => restore(draft)}>
                <RotateCcw size={14} />
                恢复
              </button>
              <button className="danger-text" onClick={() => remove(draft)}>
                永久删除
              </button>
            </div>
          )}
          <header className="note-heading">
            <input
              className="note-title-input"
              aria-label="笔记标题"
              placeholder="未命名笔记"
              maxLength={200}
              value={draft.title}
              readOnly={Boolean(draft.deletedAt)}
              onChange={(e) => session.edit({ title: e.target.value })}
              onCompositionStart={() => session.composition(true)}
              onCompositionEnd={() => session.composition(false)}
            />
            <div className="note-metadata">
              <Folder size={13} />
              <select
                aria-label="所属文件夹"
                value={draft.folderId || ''}
                disabled={Boolean(draft.deletedAt)}
                onChange={(e) => session.edit({ folderId: e.target.value || null })}
              >
                <option value="">未分类</option>
                {data.folders.map((folder) => (
                  <option value={folder.id} key={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <span className="metadata-dot">·</span>
              <span>{shortDate(draft.createdAt)}创建</span>
              <span className="metadata-dot">·</span>
              <span>{draft.body.replace(/\s/g, '').length.toLocaleString()} 字符</span>
            </div>
            <div className="note-tags">
              {draft.tags.map((tag) => (
                <span className="tag" key={tag}>
                  #{tag}
                  {!draft.deletedAt && (
                    <button
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => session.edit({ tags: draft.tags.filter((t) => t !== tag) })}
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              {!draft.deletedAt && (
                <form onSubmit={addTag}>
                  <input
                    aria-label="添加标签"
                    placeholder="＋ 添加标签"
                    list="existing-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    maxLength={32}
                  />
                  <datalist id="existing-tags">
                    {data.tags.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  {tagInput && (
                    <button type="submit" className="text-button">
                      添加
                    </button>
                  )}
                </form>
              )}
            </div>
          </header>
          <Editor
            body={draft.body}
            mode={draft.deletedAt ? 'read' : mode}
            attachmentDir={data.attachmentDir}
            session={session}
            importImage={importImage}
            report={report}
            deleted={Boolean(draft.deletedAt)}
            jumpLine={jump?.noteId === draft.id ? jump.line : undefined}
            jumpToken={jump?.noteId === draft.id ? jump.token : undefined}
          />
          <footer className="document-footer">
            <span>本地保存 · 仅你可见</span>
            <span>Ctrl + S 立即保存</span>
          </footer>
        </section>
      ) : (
        <div className="document-empty">
          <div className="empty-symbol">
            <Pencil size={30} strokeWidth={1.4} />
          </div>
          <h2>给想法留一个位置</h2>
          <p>选择一篇笔记继续，或从空白的一页开始。</p>
          <button className="primary-button" onClick={() => createNote(currentFolder?.id)}>
            <Plus size={16} />
            新建笔记
          </button>
          <small>支持 Markdown · 自动保存 · 完全离线</small>
        </div>
      )}
    </div>
  );
}
