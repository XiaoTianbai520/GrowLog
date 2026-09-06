export type TyporaShortcutAction =
  | { kind: 'heading'; level: number }
  | { kind: 'heading-step'; delta: -1 | 1 }
  | {
      kind:
        | 'bold'
        | 'italic'
        | 'strikethrough'
        | 'inline-code'
        | 'link'
        | 'table'
        | 'code-block'
        | 'math-block'
        | 'quote'
        | 'ordered-list'
        | 'bullet-list'
        | 'image'
        | 'clear-format';
    };

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey?: boolean;
}

/** Typora for Windows/Linux shortcuts that apply to GrowLog's note formats. */
export function resolveTyporaShortcut(event: ShortcutEvent): TyporaShortcutAction | null {
  const key = event.key.toLowerCase();

  if (event.altKey && event.shiftKey && !event.ctrlKey && key === '5') {
    return { kind: 'strikethrough' };
  }
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;

  if (!event.shiftKey && /^[0-6]$/.test(key)) {
    return { kind: 'heading', level: Number(key) };
  }
  if (!event.shiftKey && key === '=') return { kind: 'heading-step', delta: -1 };
  if (!event.shiftKey && key === '-') return { kind: 'heading-step', delta: 1 };
  if (!event.shiftKey && key === 'b') return { kind: 'bold' };
  if (!event.shiftKey && key === 'i') return { kind: 'italic' };
  if (!event.shiftKey && key === 'k') return { kind: 'link' };
  if (!event.shiftKey && key === 't') return { kind: 'table' };
  if (!event.shiftKey && key === '\\') return { kind: 'clear-format' };

  if (event.shiftKey && key === '`') return { kind: 'inline-code' };
  if (event.shiftKey && key === 'k') return { kind: 'code-block' };
  if (event.shiftKey && key === 'm') return { kind: 'math-block' };
  if (event.shiftKey && key === 'q') return { kind: 'quote' };
  if (event.shiftKey && key === '[') return { kind: 'ordered-list' };
  if (event.shiftKey && key === ']') return { kind: 'bullet-list' };
  if (event.shiftKey && key === 'i') return { kind: 'image' };

  return null;
}

export const TYPORA_SHORTCUT_LABELS = {
  heading: ['Ctrl+0', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6'],
  bold: 'Ctrl+B',
  italic: 'Ctrl+I',
  strikethrough: 'Alt+Shift+5',
  inlineCode: 'Ctrl+Shift+`',
  link: 'Ctrl+K',
  table: 'Ctrl+T',
  codeBlock: 'Ctrl+Shift+K',
  mathBlock: 'Ctrl+Shift+M',
  quote: 'Ctrl+Shift+Q',
  orderedList: 'Ctrl+Shift+[',
  bulletList: 'Ctrl+Shift+]',
  image: 'Ctrl+Shift+I',
  clearFormat: 'Ctrl+\\',
} as const;
