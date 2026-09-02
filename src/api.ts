import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { open, save, confirm } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Mutation, NoteInput, Snapshot } from './types';

export const desktop = isTauri();
export const api = {
  bootstrap: () => invoke<Snapshot>('bootstrap'),
  saveNote: (note: NoteInput) => invoke<Snapshot>('save_note', { note }),
  mutate: (mutation: Mutation) => invoke<Snapshot>('mutate', { mutation }),
  importImage: (noteId: string, data: string) =>
    invoke<{ markdownPath: string }>('import_image', { noteId, data }),
  importImageFile: (noteId: string, path: string) =>
    invoke<{ markdownPath: string }>('import_image_file', { noteId, path }),
  exportBackup: (path: string) => invoke<Snapshot>('export_backup', { path }),
  restoreBackup: (path: string) => invoke<Snapshot>('restore_backup', { path }),
  exportMarkdown: (path: string, body: string) => invoke<void>('export_markdown', { path, body }),
  importMarkdown: (path: string) => invoke<{ title: string; body: string }>('import_markdown', { path }),
};
export const dialogs = {
  image: () =>
    open({
      title: '插入图片',
      multiple: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    }),
  backupSource: () =>
    open({ title: '恢复枝序备份', multiple: false, filters: [{ name: '枝序备份', extensions: ['zhixu'] }] }),
  backupTarget: () =>
    save({
      title: '导出全部数据',
      defaultPath: `枝序备份-${new Date().toLocaleDateString('sv-SE')}.zhixu`,
      filters: [{ name: '枝序备份', extensions: ['zhixu'] }],
    }),
  markdownSource: () =>
    open({
      title: '导入 Markdown',
      multiple: false,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    }),
  markdownTarget: (title: string) =>
    save({
      title: '导出 Markdown',
      defaultPath: `${title}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    }),
  confirm: (message: string) =>
    confirm(message, { title: '枝序', kind: 'warning', okLabel: '确认', cancelLabel: '取消' }),
};

export function attachmentUrl(src: string | undefined, directory: string): string | undefined {
  if (!src || !/^attachments\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/i.test(src)) return undefined;
  return convertFileSrc(`${directory}/${src.slice('attachments/'.length)}`);
}
export function openExternal(url: string) {
  if (/^https?:\/\//i.test(url)) return openUrl(url);
  return Promise.reject(new Error('仅支持打开 HTTP 或 HTTPS 链接'));
}
export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
