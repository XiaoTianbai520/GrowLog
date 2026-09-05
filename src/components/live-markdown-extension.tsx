import { createRoot, type Root } from 'react-dom/client';
import { Prec, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import {
  previewUnits,
  referenceDefinitions,
  visiblePreviewUnits,
  type PreviewUnit,
} from '../lib/live-markdown';
import { MarkdownContent } from './MarkdownContent';

export function liveMarkdown(attachmentDir: string, report: (error: unknown) => void) {
  const roots = new WeakMap<HTMLElement, Root>();
  const observers = new WeakMap<HTMLElement, ResizeObserver>();
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
      // React commits and local images can change a widget's height after toDOM.
      const observer = new ResizeObserver(() => view.requestMeasure());
      observers.set(dom, observer);
      observer.observe(dom);
      dom.addEventListener('dblclick', (event) => {
        if (event.button !== 0) return;
        const element = event.target as HTMLElement;
        // Links keep their ordinary preview behavior. Double-click elsewhere on
        // the rendered line to return to its Markdown source.
        if (element.closest('a')) return;
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
      observers.get(dom)?.disconnect();
      observers.delete(dom);
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
          inclusive: true,
        }).range(unit.from, unit.to),
      ),
    );
  }
  // Block widgets have no cursor stops. Reveal the nearest crossed block before
  // CodeMirror's vertical movement would skip over its source entirely.
  const enterPreview = (forward: boolean) => (view: EditorView) => {
    const selection = view.state.selection.main;
    if (!selection.empty) return false;
    const target = view.moveVertically(selection, forward).head;
    const { units } = view.state.field(field);
    const visible = visiblePreviewUnits(units, view.state.selection);
    const crossed = forward
      ? visible.find((unit) => unit.from > selection.head && unit.from <= target)
      : visible.reverse().find((unit) => unit.to < selection.head && unit.to >= target);
    if (!crossed) return false;
    const pos = forward ? crossed.from : crossed.to;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    return true;
  };
  return [
    field,
    Prec.high(
      keymap.of([
        { key: 'ArrowUp', run: enterPreview(false) },
        { key: 'ArrowDown', run: enterPreview(true) },
      ]),
    ),
  ];
}
