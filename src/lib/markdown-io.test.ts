import { describe, expect, it } from 'vitest';
import { isImageFile, isMarkdownFile, safeFileName, titleFromFileName } from './markdown-io';

const file = (name: string, type = '') => ({ name, type }) as File;

describe('safeFileName', () => {
  it('清理 Windows 非法字符并保留中文与空格', () => {
    expect(safeFileName('学习: 笔记/第一章?')).toBe('学习 笔记 第一章');
    expect(safeFileName('计划*总结"2026"')).toBe('计划 总结 2026');
    expect(safeFileName('  常规 标题  ')).toBe('常规 标题');
  });
  it('空标题回落到未命名笔记', () => {
    expect(safeFileName('')).toBe('未命名笔记');
    expect(safeFileName('///')).toBe('未命名笔记');
  });
  it('截断过长的标题', () => {
    expect(safeFileName('长'.repeat(260)).length).toBe(200);
  });
});

describe('titleFromFileName', () => {
  it('去掉 md 扩展名并兼容大写与 markdown', () => {
    expect(titleFromFileName('学习笔记.md')).toBe('学习笔记');
    expect(titleFromFileName('notes.MD')).toBe('notes');
    expect(titleFromFileName('日志.markdown')).toBe('日志');
  });
  it('无扩展名或空名称时给出默认标题', () => {
    expect(titleFromFileName('没有扩展名')).toBe('没有扩展名');
    expect(titleFromFileName('.md')).toBe('导入的笔记');
    expect(titleFromFileName('???')).toBe('导入的笔记');
  });
  it('截断过长的文件名', () => {
    expect(titleFromFileName(`${'长'.repeat(260)}.md`).length).toBe(200);
  });
});

describe('文件类型判断', () => {
  it('按 MIME 类型识别图片', () => {
    expect(isImageFile(file('照片.png', 'image/png'))).toBe(true);
    expect(isImageFile(file('照片', ''))).toBe(false);
    expect(isImageFile(file('文档.pdf', 'application/pdf'))).toBe(false);
  });
  it('按扩展名识别 Markdown', () => {
    expect(isMarkdownFile(file('笔记.md'))).toBe(true);
    expect(isMarkdownFile(file('笔记.MARKDOWN'))).toBe(true);
    expect(isMarkdownFile(file('笔记.txt'))).toBe(false);
    expect(isMarkdownFile(file('笔记.md.txt'))).toBe(false);
  });
});
