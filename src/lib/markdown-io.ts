import { noteTitle } from './format';

const MAX_TITLE_CHARS = 200;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const illegalNameChars = /[\\/:*?"<>|]/g;

/** 将笔记标题转换为可安全用作 .md 文件名的名称。 */
export const safeFileName = (title: string) => {
  const name = noteTitle(title).replace(illegalNameChars, ' ').replace(/\s+/g, ' ').trim();
  return name.slice(0, MAX_TITLE_CHARS) || '未命名笔记';
};

/** 从 .md 文件名提取笔记标题（去扩展名）。 */
export const titleFromFileName = (name: string) => {
  const base = name
    .replace(/\.(md|markdown)$/i, '')
    .replace(illegalNameChars, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.slice(0, MAX_TITLE_CHARS) || '导入的笔记';
};

export const isImageFile = (file: File) => file.type.startsWith('image/');
export const isMarkdownFile = (file: File) => /\.(md|markdown)$/i.test(file.name);
