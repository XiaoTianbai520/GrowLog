import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  X,
  Plus,
  Check,
  AlertCircle,
  LoaderCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { api, desktop, dialogs, errorText } from './api';
import type { Achievement, AchievementInput, Mutation, Note, Route, Snapshot } from './types';
import { NoteSession } from './lib/note-session';
import { modules } from './modules';
import { noteTitle, excerpt } from './lib/format';
import { MAX_IMPORT_BYTES, safeFileName, titleFromFileName } from './lib/markdown-io';
import { Modal } from './components/Modal';
import { Home } from './pages/Home';
import { DailyTasks } from './pages/DailyTasks';
import { Notes } from './pages/Notes';
import { Achievements, AchievementForm, ProgressForm } from './pages/Achievements';
import { SettingsPage, ToolsPage } from './pages/Settings';

type DialogState =
  | { type: 'achievement'; achievement?: Achievement }
  | { type: 'progress'; achievement: Achievement }
  | { type: 'folder'; id?: string; name: string }
  | { type: 'note'; note: Note }
  | { type: 'search' }
  | null;

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [route, setRoute] = useState<Route>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<DialogState>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lastLevel = useRef<number | null>(null);
  const accept = useCallback((snapshot: Snapshot) => {
    setData(snapshot);
    const messages: string[] = [];
    if (snapshot.settings.celebrations && snapshot.unlocked.length) {
      const names = snapshot.achievements.filter((a) => snapshot.unlocked.includes(a.id)).map((a) => a.name);
      messages.push(`获得新徽章 · ${names.join('、')}`);
    }
    if (snapshot.xpEarned > 0) {
      messages.push(`每日任务完成 +${snapshot.xpEarned} 经验`);
      if (lastLevel.current !== null && snapshot.growth.level > lastLevel.current)
        messages.push(`升至 Lv. ${snapshot.growth.level}`);
    }
    if (messages.length) setToast(messages.join(' · '));
    lastLevel.current = snapshot.growth.level;
  }, []);
  const session = useMemo(() => new NoteSession(api.saveNote, accept), [accept]);
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const report = useCallback((e: unknown) => setError(errorText(e)), []);
  const closeModal = useCallback(() => setModal(null), []);
  const bootstrap = useCallback(async () => {
    setError('');
    if (!desktop) {
      setError('请通过枝序桌面程序打开。开发时请运行 npm run desktop:dev；普通使用只需安装 Setup。');
      return;
    }
    try {
      accept(await api.bootstrap());
    } catch (e) {
      report(e);
    }
  }, [accept, report]);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      document.documentElement.dataset.theme =
        data?.settings.theme === 'system' || !data ? (media.matches ? 'dark' : 'light') : data.settings.theme;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [data?.settings.theme]);

  const guarded = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    if (busyRef.current) throw new Error('上一个操作仍在进行，请稍候');
    busyRef.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  const act = useCallback(
    (action: () => Promise<unknown>) => {
      void guarded(action).catch(report);
    },
    [guarded, report],
  );
  const navigate = (page: Route) =>
    act(async () => {
      await session.flush();
      if (page === 'daily') accept(await api.bootstrap());
      setRoute(page);
    });
  const openNote = (note: Note) =>
    act(async () => {
      await session.flush();
      // The note passed by a click may precede the flush response. Always use fresh state.
      const fresh = await api.bootstrap();
      accept(fresh);
      session.load(fresh.notes.find((n) => n.id === note.id) || null);
      setRoute('notes');
      setModal(null);
    });
  const createNoteWith = async (folderId: string | null, title: string, body: string) => {
    await session.flush();
    const id = crypto.randomUUID();
    const fresh = await api.saveNote({
      id,
      title,
      body,
      folderId,
      favorite: false,
      tags: [],
      revision: 0,
    });
    accept(fresh);
    session.load(fresh.notes.find((n) => n.id === id)!);
    setRoute('notes');
  };
  const createNote = (folderId?: string) => act(() => createNoteWith(folderId || null, '', ''));
  const importMarkdown = (file?: File) =>
    act(async () => {
      let title: string;
      let body: string;
      if (file) {
        if (file.size > MAX_IMPORT_BYTES) throw new Error('Markdown 文件不能超过 5 MB');
        body = await file.text();
        title = titleFromFileName(file.name);
      } else {
        const path = await dialogs.markdownSource();
        if (typeof path !== 'string') return;
        const imported = await api.importMarkdown(path);
        title = imported.title;
        body = imported.body;
      }
      await createNoteWith(null, title, body);
      setToast(`已导入「${noteTitle(title)}」`);
    });
  const exportMarkdown = (note: Note) =>
    act(async () => {
      await session.flush();
      const path = await dialogs.markdownTarget(safeFileName(note.title));
      if (typeof path !== 'string') return;
      await api.exportMarkdown(path, note.body);
      setToast(`已导出「${noteTitle(note.title)}」`);
    });
  const mutate = async (mutation: Mutation) =>
    guarded(async () => {
      await session.flush();
      const fresh = await api.mutate(mutation);
      accept(fresh);
      const id = session.getSnapshot().draft?.id;
      if (id) session.load(fresh.notes.find((n) => n.id === id) || null);
    });
  const change = (mutation: Mutation) => {
    void mutate(mutation).catch(report);
  };
  const updateNote = (note: Note, patch: Partial<Pick<Note, 'title' | 'favorite'>>) =>
    guarded(async () => {
      await session.flush();
      const latest = await api.bootstrap();
      const current = latest.notes.find((item) => item.id === note.id);
      if (!current || current.deletedAt) throw new Error('这篇笔记已被移入回收站');
      const fresh = await api.saveNote({
        id: current.id,
        title: patch.title ?? current.title,
        body: current.body,
        folderId: current.folderId,
        tags: current.tags,
        favorite: patch.favorite ?? current.favorite,
        revision: current.revision,
      });
      accept(fresh);
      if (session.getSnapshot().draft?.id === current.id) {
        session.load(fresh.notes.find((item) => item.id === current.id) || null);
      }
    });

  const importImage = (file?: File) =>
    guarded(async () => {
      await session.flush();
      const note = session.getSnapshot().draft;
      if (!note) return;
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过 20 MB');
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return (await api.importImage(note.id, base64)).markdownPath;
      }
      const path = await dialogs.image();
      if (typeof path === 'string') return (await api.importImageFile(note.id, path)).markdownPath;
    });
  const exportBackup = () =>
    act(async () => {
      await session.flush();
      const path = await dialogs.backupTarget();
      if (path) {
        accept(await api.exportBackup(path));
        setToast('完整备份已导出 · 包含笔记、图片、成就、经验与设置');
      }
    });
  const restoreBackup = (path?: string) =>
    act(async () => {
      await session.flush();
      const selected = path || (await dialogs.backupSource());
      if (typeof selected !== 'string') return;
      if (
        !(await dialogs.confirm(
          '恢复会整体替换当前的笔记、图片、成就、等级经验与设置。恢复旧版备份会回到零经验。校验通过后，将先自动备份现有数据。确认恢复吗？',
        ))
      )
        return;
      const fresh = await api.restoreBackup(selected);
      accept(fresh);
      session.load(null);
      setToast('备份已恢复，原数据已另存为恢复前备份');
    });
  const removeAchievement = (achievement: Achievement) =>
    act(async () => {
      if (!(await dialogs.confirm(`删除成就「${achievement.name}」及它的完成记录？此操作不能撤销。`))) return;
      await session.flush();
      accept(await api.mutate({ kind: 'deleteAchievement', id: achievement.id }));
    });
  const deleteFolder = (id: string) =>
    act(async () => {
      if (!(await dialogs.confirm('删除这个文件夹？里面的笔记会保留，并移到“未分类”。'))) return;
      await session.flush();
      const fresh = await api.mutate({ kind: 'deleteFolder', id });
      accept(fresh);
      const selected = session.getSnapshot().draft;
      if (selected) session.load(fresh.notes.find((n) => n.id === selected.id) || null);
    });
  const permanentDelete = (note: Note) =>
    act(async () => {
      if (
        !(await dialogs.confirm(`永久删除「${noteTitle(note.title)}」？此操作不能撤销，已有成就不会扣除。`))
      )
        return;
      await session.flush();
      const fresh = await api.mutate({ kind: 'deleteNote', id: note.id });
      accept(fresh);
      session.load(null);
    });

  const shortcuts = useRef({ createNote, route, modal });
  shortcuts.current = { createNote, route, modal };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void session.flush().catch(report);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setModal({ type: 'search' });
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'n' && !shortcuts.current.modal) {
        event.preventDefault();
        shortcuts.current.createNote();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [session, report]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let closing = false;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return;
        if (busyRef.current) {
          report('请等待当前操作完成后再关闭窗口');
          return;
        }
        closing = true;
        try {
          await session.flush();
          await getCurrentWindow().destroy();
        } catch (e) {
          closing = false;
          report(e);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [session, report]);
  useEffect(() => {
    let day = new Date().toLocaleDateString();
    const refreshDay = () => {
      const current = new Date().toLocaleDateString();
      if (current !== day && desktop && !busyRef.current) {
        act(async () => {
          await session.flush();
          accept(await api.bootstrap());
          day = current;
        });
      }
    };
    const timer = setInterval(refreshDay, 15_000);
    window.addEventListener('focus', refreshDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshDay);
    };
  }, [session, act, accept]);

  if (!data)
    return (
      <div className="startup">
        <img src="/mark.svg" alt="枝序" />
        <h1>枝序</h1>
        <p>记录知识，看见成长。</p>
        {error ? (
          <div className="startup-error" role="alert">
            <AlertCircle size={20} />
            <p>{error}</p>
            <button className="secondary-button" onClick={() => void bootstrap()}>
              重试打开
            </button>
            <small>不会清空或重置你的数据。</small>
          </div>
        ) : (
          <LoaderCircle size={22} className="spin" />
        )}
      </div>
    );
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`} aria-busy={busy}>
      <aside className="global-sidebar">
        <div className="brand">
          <img src="/mark.svg" alt="" />
          <div>
            <strong>枝序</strong>
            <span>GrowLog</span>
          </div>
        </div>
        <button
          className="global-search"
          onClick={() => setModal({ type: 'search' })}
          aria-label="搜索笔记 Ctrl+K"
        >
          <Search size={16} />
          <span>搜索笔记</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="nav-section-label">我的空间</div>
        <nav aria-label="主导航">
          {modules
            .filter((m) => m.enabled && m.group === 'main')
            .map(({ id, name, icon: Icon, route: page }) => (
              <button
                key={id}
                className={route === page ? 'active' : ''}
                onClick={() => navigate(page)}
                title={name}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{name}</span>
                {id === 'notes' && <small>{data.notes.filter((n) => !n.deletedAt).length}</small>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-level"
            onClick={() => navigate('daily')}
            title="查看等级与每日任务"
            aria-label={`等级 ${data.growth.level}，查看每日任务`}
          >
            <strong>Lv. {data.growth.level}</strong>
            <span>
              {data.growth.levelXp} / {data.growth.nextLevelXp} 经验
            </span>
            <progress aria-label="侧栏等级进度" value={data.growth.levelXp} max={data.growth.nextLevelXp} />
          </button>
          <div className="sidebar-motto">
            <span className="motto-line" />
            <p>
              一点记录
              <br />
              一点生长
            </p>
          </div>
          {modules
            .filter((m) => m.group === 'bottom')
            .map(({ id, name, icon: Icon, route: page }) => (
              <button
                key={id}
                className={`settings-nav ${route === page ? 'active' : ''}`}
                onClick={() => navigate(page)}
                title={name}
              >
                <Icon size={18} />
                <span>{name}</span>
              </button>
            ))}
          <div className="local-status">
            <span />
            离线可用 · 数据在本机
          </div>
        </div>
      </aside>
      <main className="app-main" inert={busy}>
        <div className="topbar">
          <div>
            <button
              className="icon-button"
              aria-label={collapsed ? '展开导航' : '收起导航'}
              title={collapsed ? '展开导航' : '收起导航'}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <span className="breadcrumb-root">我的空间</span>
            <ChevronRight size={12} />
            <span>{modules.find((m) => m.route === route)?.name}</span>
          </div>
          <div className="topbar-right">
            {busy && <LoaderCircle className="spin" size={14} />}
            <span>
              <ShieldCheck size={13} />
              私密 · 本地
            </span>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {route === 'home' && (
          <Home data={data} openNote={openNote} createNote={createNote} navigate={navigate} />
        )}
        {route === 'daily' && (
          <DailyTasks
            growth={data.growth}
            checkIn={() => change({ kind: 'checkIn' })}
            writeNote={() => {
              const recent = data.notes.find((n) => !n.deletedAt);
              if (recent) openNote(recent);
              else createNote();
            }}
          />
        )}
        {route === 'notes' && (
          <Notes
            data={data}
            draft={view.draft}
            status={view.status}
            saveError={view.error}
            session={session}
            openNote={openNote}
            createNote={createNote}
            trash={(n) => change({ kind: 'trashNote', id: n.id })}
            restore={(n) => change({ kind: 'restoreNote', id: n.id })}
            remove={permanentDelete}
            rename={(note) => setModal({ type: 'note', note })}
            toggleFavorite={(note) => void updateNote(note, { favorite: !note.favorite }).catch(report)}
            editFolder={(id) =>
              setModal({ type: 'folder', id, name: data.folders.find((f) => f.id === id)?.name || '' })
            }
            deleteFolder={deleteFolder}
            importImage={importImage}
            importMarkdown={importMarkdown}
            exportMarkdown={exportMarkdown}
            report={report}
          />
        )}
        {route === 'achievements' && (
          <Achievements
            data={data}
            add={() => setModal({ type: 'achievement' })}
            edit={(achievement) => setModal({ type: 'achievement', achievement })}
            progress={(achievement) => setModal({ type: 'progress', achievement })}
            mutate={change}
            remove={removeAchievement}
          />
        )}
        {route === 'settings' && (
          <SettingsPage
            data={data}
            save={(settings) => change({ kind: 'saveSettings', settings })}
            exportBackup={exportBackup}
            restoreBackup={restoreBackup}
            busy={busy}
          />
        )}
        {route === 'tools' && <ToolsPage />}
      </main>
      {modal?.type === 'achievement' && (
        <AchievementForm
          achievement={modal.achievement}
          close={closeModal}
          submit={async (achievement: AchievementInput) => mutate({ kind: 'saveAchievement', achievement })}
        />
      )}
      {modal?.type === 'progress' && (
        <ProgressForm
          achievement={modal.achievement}
          close={closeModal}
          submit={async (progress) => mutate({ kind: 'setProgress', id: modal.achievement.id, progress })}
        />
      )}
      {modal?.type === 'folder' && (
        <FolderForm
          name={modal.name}
          existing={Boolean(modal.id)}
          close={closeModal}
          submit={async (name) => mutate({ kind: 'saveFolder', id: modal.id, name })}
        />
      )}
      {modal?.type === 'note' && (
        <NoteTitleForm
          name={modal.note.title}
          close={closeModal}
          submit={(title) => updateNote(modal.note, { title })}
        />
      )}
      {modal?.type === 'search' && <SearchDialog notes={data.notes} close={closeModal} openNote={openNote} />}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={18} />
          </span>
          <span>{toast}</span>
          <button className="icon-button" aria-label="关闭通知" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function NoteTitleForm({
  name,
  close,
  submit,
}: {
  name: string;
  close: () => void;
  submit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="重命名笔记" onClose={close}>
      <form
        className="achievement-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const title = value.trim();
          if (!title) {
            setError('笔记标题不能为空');
            return;
          }
          setBusy(true);
          try {
            await submit(title);
            close();
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <label>
          笔记标题
          <input
            required
            maxLength={200}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="输入笔记标题"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            取消
          </button>
          <button className="primary-button" disabled={busy}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FolderForm({
  name,
  existing,
  close,
  submit,
}: {
  name: string;
  existing: boolean;
  close: () => void;
  submit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={existing ? '重命名文件夹' : '新建文件夹'} onClose={close}>
      <form
        className="achievement-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await submit(value);
            close();
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <label>
          文件夹名称
          <input
            required
            maxLength={40}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例如：学习笔记"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            取消
          </button>
          <button className="primary-button" disabled={busy}>
            <Plus size={15} />
            {existing ? '保存' : '创建文件夹'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SearchDialog({
  notes,
  close,
  openNote,
}: {
  notes: Note[];
  close: () => void;
  openNote: (note: Note) => void;
}) {
  const [query, setQuery] = useState('');
  const results = notes
    .filter(
      (n) => !n.deletedAt && `${n.title}\n${n.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .slice(0, 20);
  return (
    <Modal title="搜索笔记" onClose={close} wide>
      <label className="search-field search-large">
        <Search size={19} />
        <input
          placeholder="搜索标题或正文…"
          aria-label="全局搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) openNote(results[0]);
          }}
        />
        <kbd>Esc</kbd>
      </label>
      <div className="search-results">
        {results.map((n) => (
          <button key={n.id} onClick={() => openNote(n)}>
            <FileText size={18} />
            <span>
              <strong>{noteTitle(n.title)}</strong>
              <small>{excerpt(n.body)}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
        {!results.length && <p className="list-empty">没有找到匹配的笔记，试试其他关键词。</p>}
      </div>
      <p className="search-footnote">搜索标题与正文 · 按 Enter 打开第一项</p>
    </Modal>
  );
}
