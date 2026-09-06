import { describe, expect, it } from 'vitest';
import { resolveTyporaShortcut, type ShortcutEvent } from './typora-shortcuts';

const shortcut = (key: string, overrides: Partial<ShortcutEvent> = {}) =>
  resolveTyporaShortcut({ key, ctrlKey: true, shiftKey: false, altKey: false, ...overrides });

describe('resolveTyporaShortcut', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('maps Ctrl+%s to its heading level', (level) => {
    expect(shortcut(String(level))).toEqual({ kind: 'heading', level });
  });

  it('maps the Typora paragraph and format shortcuts', () => {
    expect(shortcut('b')).toEqual({ kind: 'bold' });
    expect(shortcut('I')).toEqual({ kind: 'italic' });
    expect(shortcut('K')).toEqual({ kind: 'link' });
    expect(shortcut('`', { shiftKey: true })).toEqual({ kind: 'inline-code' });
    expect(shortcut('5', { ctrlKey: false, shiftKey: true, altKey: true })).toEqual({
      kind: 'strikethrough',
    });
  });

  it('maps the Typora block shortcuts', () => {
    expect(shortcut('k', { shiftKey: true })).toEqual({ kind: 'code-block' });
    expect(shortcut('q', { shiftKey: true })).toEqual({ kind: 'quote' });
    expect(shortcut('[', { shiftKey: true })).toEqual({ kind: 'ordered-list' });
    expect(shortcut(']', { shiftKey: true })).toEqual({ kind: 'bullet-list' });
  });

  it('does not intercept unrelated or modified shortcuts', () => {
    expect(shortcut('s')).toBeNull();
    expect(shortcut('b', { altKey: true })).toBeNull();
    expect(shortcut('b', { metaKey: true })).toBeNull();
  });
});
