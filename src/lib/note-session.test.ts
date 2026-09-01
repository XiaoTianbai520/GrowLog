import { describe, expect, it, vi, afterEach } from 'vitest';
import { NoteSession } from './note-session';
import type { Note, NoteInput, Snapshot } from '../types';

const note: Note = {
  id: 'note-a',
  title: '原稿',
  body: '',
  tags: [],
  folderId: null,
  favorite: false,
  revision: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
};
function result(input: NoteInput): Snapshot {
  return {
    notes: [{ ...note, ...input, revision: input.revision + 1 }],
    achievements: [],
    folders: [],
    tags: [],
    settings: { theme: 'light', celebrations: true },
    writtenCount: 0,
    dataDir: '',
    attachmentDir: '',
    backups: [],
    backupWarning: null,
    unlocked: [],
    xpEarned: 0,
    growth: {
      day: '2026-09-01',
      totalXp: 0,
      level: 1,
      levelXp: 0,
      nextLevelXp: 100,
      todayXp: 0,
      tasks: [],
      history: [],
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('ordered note saving', () => {
  it('does not overwrite text typed while an earlier save is in flight', async () => {
    const calls: NoteInput[] = [];
    let release!: (value: Snapshot) => void;
    const save = vi.fn((input: NoteInput) => {
      calls.push(input);
      return calls.length === 1
        ? new Promise<Snapshot>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(result(input));
    });
    const session = new NoteSession(save, vi.fn());
    session.load(note);
    session.edit({ body: '第一段中文' });
    const pending = session.flush();
    session.edit({ body: '第一段中文\n第二段中文' });
    release(result(calls[0]));
    await pending;
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toBe('第一段中文\n第二段中文');
    expect(calls[1].revision).toBe(2);
    expect(session.getSnapshot().draft?.body).toBe(calls[1].body);
    expect(session.getSnapshot().draft?.revision).toBe(3);
    expect(session.getSnapshot().status).toBe('saved');
  });
  it('retains the draft after failure, prevents navigation and permits retry', async () => {
    const save = vi
      .fn<(input: NoteInput) => Promise<Snapshot>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockImplementation(async (input) => result(input));
    const session = new NoteSession(save, vi.fn());
    session.load(note);
    session.edit({ body: '不能丢失的草稿' });
    await expect(session.flush()).rejects.toThrow('disk full');
    expect(session.getSnapshot().status).toBe('error');
    expect(() => session.load({ ...note, id: 'note-b' })).toThrow('请先保存');
    expect(session.getSnapshot().draft?.body).toBe('不能丢失的草稿');
    await session.flush();
    expect(session.dirty).toBe(false);
  });
  it('coalesces simultaneous flush requests without duplicate writes', async () => {
    const save = vi.fn(async (input: NoteInput) => result(input));
    const session = new NoteSession(save, vi.fn());
    session.load(note);
    session.edit({ title: '标题' });
    await Promise.all([session.flush(), session.flush(), session.flush()]);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('debounces saves and waits for Chinese input composition to finish', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (input: NoteInput) => result(input));
    const session = new NoteSession(save, vi.fn());
    session.load(note);
    session.composition(true);
    session.edit({ body: 'zhong' });
    await vi.advanceTimersByTimeAsync(1200);
    expect(save).not.toHaveBeenCalled();
    session.edit({ body: '中文' });
    session.composition(false);
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].body).toBe('中文');
  });
});
