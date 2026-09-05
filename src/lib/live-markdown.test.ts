import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { markdownEnter, previewUnits, referenceDefinitions, visiblePreviewUnits } from './live-markdown';

describe('live Markdown source ranges', () => {
  it('renders a completed heading after Enter without changing Markdown', () => {
    const body = '# 标题\n';
    const units = previewUnits(body);
    expect(visiblePreviewUnits(units, EditorSelection.single(4))).toEqual([]);
    expect(visiblePreviewUnits(units, EditorSelection.single(body.length))).toEqual(units);
    expect(units[0].text).toBe('# 标题');
  });
  it('keeps paragraphs line editable, and tables and closed code blocks whole', () => {
    const body = '第一行\n**第二行**\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```ts\nconst n = 1;\n```';
    const units = previewUnits(body);
    expect(units).toHaveLength(4);
    expect(units[2].text).toContain('| 1 | 2 |');
    expect(units[3].text).toContain('const n');
    for (const unit of units) expect(body.slice(unit.from, unit.to)).toBe(unit.text);
  });
  it('keeps unfinished fenced code and raw HTML in source', () => {
    expect(previewUnits('```md\n# unfinished\n')).toEqual([]);
    expect(previewUnits('<script>alert(1)</script>')).toEqual([]);
  });
  it('exposes an entire list item and every unit touched by a selection', () => {
    const body = '- first\n  continuation\n- second\n\nlast';
    const units = previewUnits(body);
    expect(units[0].text).toBe('- first\n  continuation');
    expect(visiblePreviewUnits(units, EditorSelection.single(2, body.length))).toEqual([]);
  });
  it('preserves reference links defined outside the rendered unit', () => {
    expect(referenceDefinitions('[label][ref]\n\n[ref]: https://example.com')).toBe(
      '[ref]: https://example.com',
    );
  });
  it('does not mistake markers inside fenced code for headings or lists', () => {
    expect(previewUnits('```\n# text\n- text\n```')).toHaveLength(1);
  });
});

describe('Markdown Enter', () => {
  function enter(body: string, composing = false) {
    let state = EditorState.create({
      doc: body,
      selection: { anchor: body.length },
      extensions: [markdown({ base: markdownLanguage })],
    });
    const handled = markdownEnter({
      state,
      composing,
      dispatch: (transaction: Transaction) => {
        state = transaction.state;
      },
    });
    return { body: state.doc.toString(), handled };
  }
  it('continues unordered, ordered and task lists', () => {
    expect(enter('- item').body).toBe('- item\n- ');
    expect(enter('1. item').body).toBe('1. item\n2. ');
    expect(enter('- [x] done').body).toBe('- [x] done\n- [ ] ');
  });
  it('exits an empty list item', () => {
    expect(enter('- item\n- ').body).toBe('- item\n');
  });
  it('never handles input method confirmation', () => {
    expect(enter('- 中文', true)).toEqual({ body: '- 中文', handled: false });
  });
  it('leaves fenced code newlines to the ordinary editor command', () => {
    expect(enter('```\ncode').handled).toBe(false);
  });
});
