import { createRoot, type Root } from 'react-dom/client';
import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import {
  previewUnits,
  referenceDefinitions,
  visiblePreviewUnits,
  type PreviewUnit,
} from '../lib/live-markdown';
import { MarkdownContent } from './MarkdownContent';

export function liveMarkdown(attachmentDir: string, report: (error: unknown) => void) {
  const roots = new WeakMap<HTMLElement, Root>();
  class PreviewWidget extends WidgetType {
    constructor(
      readonly unit: PreviewUnit,
      readonly references: string,
    ) {
      super();
    }
    eq(other: PreviewWidget) {
      return (
        this.unit.from === other.unit.from &&
        this.unit.text === other.unit.text &&
        this.references === other.references
      );
    }
    toDOM(view: EditorView) {
      const dom = document.createElement('div');
      dom.className = 'markdown-preview live-preview';
      dom.setAttribute('aria-label', '原位预览');
      dom.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        const element = event.target as HTMLElement;
        // Modified click opens a link; an ordinary click returns to its source.
        if (element.closest('a') && (event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        event.stopPropagation();
        const relativeLine = Number(
          element.closest('[data-source-line]')?.getAttribute('data-source-line') || 1,
        );
        const offset = this.unit.text
          .split('\n')
          .slice(0, relativeLine - 1)
          .reduce((sum, line) => sum + line.length + 1, 0);
        const pos = Math.min(this.unit.to, this.unit.from + offset);
        view.dispatch({
          selection: { anchor: event.shiftKey ? view.state.selection.main.anchor : pos, head: pos },
        });
        view.focus();
      });
      const root = createRoot(dom);
      roots.set(dom, root);
      root.render(
        <MarkdownContent
          body={`${this.unit.text}\n\n${this.references}`}
          attachmentDir={attachmentDir}
          report={report}
        />,
      );
      return dom;
    }
    ignoreEvent() {
      return true;
    }
    destroy(dom: HTMLElement) {
      const root = roots.get(dom);
      roots.delete(dom);
      queueMicrotask(() => root?.unmount());
    }
  }

  interface PreviewState {
    units: PreviewUnit[];
    references: string;
    decorations: DecorationSet;
  }
  const field = StateField.define<PreviewState>({
    create(state) {
      const body = state.doc.toString();
      const units = previewUnits(body);
      const references = referenceDefinitions(body);
      return { units, references, decorations: decorate(units, references, state.selection) };
    },
    update(value, transaction) {
      if (!transaction.docChanged && !transaction.selection) return value;
      const units = transaction.docChanged ? previewUnits(transaction.newDoc.toString()) : value.units;
      const references = transaction.docChanged
        ? referenceDefinitions(transaction.newDoc.toString())
        : value.references;
      return { units, references, decorations: decorate(units, references, transaction.newSelection) };
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
  function decorate(
    units: PreviewUnit[],
    references: string,
    selection: Parameters<typeof visiblePreviewUnits>[1],
  ) {
    return Decoration.set(
      visiblePreviewUnits(units, selection).map((unit) =>
        Decoration.replace({
          widget: new PreviewWidget(unit, references),
          block: true,
          inclusive: false,
        }).range(unit.from, unit.to),
      ),
    );
  }
  return field;
}
