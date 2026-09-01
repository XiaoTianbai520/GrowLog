import type { Note, NoteInput, Snapshot } from '../types';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';
interface View {
  draft: Note | null;
  status: SaveStatus;
  error: string | null;
}

/** One ordered writer. Edits made during a request survive its acknowledgement. */
export class NoteSession {
  private view: View = { draft: null, status: 'saved', error: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private acknowledged = 0;
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private composing = false;
  constructor(
    private save: (input: NoteInput) => Promise<Snapshot>,
    private accept: (data: Snapshot) => void,
  ) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(view: View) {
    this.view = view;
    this.listeners.forEach((f) => f());
  }
  get dirty() {
    return this.generation !== this.acknowledged;
  }
  load(note: Note | null) {
    if (this.dirty || this.pending) throw new Error('请先保存当前笔记');
    if (this.timer) clearTimeout(this.timer);
    this.generation = this.acknowledged = 0;
    this.publish({ draft: note ? { ...note, tags: [...note.tags] } : null, status: 'saved', error: null });
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (!this.composing)
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, 800);
  }
  composition(active: boolean) {
    this.composing = active;
    if (active && this.timer) clearTimeout(this.timer);
    else if (!active && this.dirty) this.schedule();
  }
  edit(patch: Partial<Pick<NoteInput, 'title' | 'body' | 'folderId' | 'tags' | 'favorite'>>) {
    if (!this.view.draft || this.view.draft.deletedAt) return;
    this.generation++;
    this.publish({ draft: { ...this.view.draft, ...patch }, status: 'dirty', error: null });
    this.schedule();
  }
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.pending) return this.pending;
    if (!this.dirty || !this.view.draft) return Promise.resolve();
    this.pending = this.drain().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async drain() {
    while (this.dirty && this.view.draft) {
      const generation = this.generation;
      const draft = this.view.draft;
      this.publish({ ...this.view, status: 'saving', error: null });
      try {
        const result = await this.save({
          id: draft.id,
          title: draft.title,
          body: draft.body,
          folderId: draft.folderId,
          tags: [...draft.tags],
          favorite: draft.favorite,
          revision: draft.revision,
        });
        const saved = result.notes.find((n) => n.id === draft.id);
        if (!saved) throw new Error('保存响应缺少笔记，请保留草稿并重试');
        this.acknowledged = generation;
        this.publish({
          draft: { ...this.view.draft!, revision: saved.revision, updatedAt: saved.updatedAt },
          status: this.dirty ? 'dirty' : 'saved',
          error: null,
        });
        this.accept(result);
      } catch (error) {
        this.publish({
          ...this.view,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }
}
