import { describe, expect, it } from 'vitest';
import { markdownHeadings } from './markdown-headings';

describe('markdownHeadings', () => {
  it('builds a hierarchy and preserves source lines', () => {
    const result = markdownHeadings('# 根\n正文\n### 跳级\n## 同级\n#### 子级');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ text: '根', level: 1, line: 1 });
    expect(result[0].children.map((item) => item.text)).toEqual(['跳级', '同级']);
    expect(result[0].children[1].children[0]).toMatchObject({ text: '子级', line: 5 });
  });

  it('ignores fenced code and removes common inline markup', () => {
    const result = markdownHeadings('```md\n# 伪标题\n```\n## **真标题** [链接](https://x.test)');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('真标题 链接');
    expect(result[0].line).toBe(4);
  });
});
