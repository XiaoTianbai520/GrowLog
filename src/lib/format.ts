export const noteTitle = (title: string) => title.trim() || '未命名笔记';
export const shortDate = (date: string) =>
  new Date(date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
export const fullDate = (date: string) =>
  new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
export const excerpt = (body: string) =>
  body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/[#*`>~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || '还没有正文，从一个想法开始。';
export const bytes = (size: number) =>
  size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
