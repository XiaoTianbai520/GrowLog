import { markdownLanguage, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import { EditorSelection, type EditorState, type Transaction } from '@codemirror/state';

export interface PreviewUnit {
  from: number;
  to: number;
  text: string;
}

/** Source offsets remain authoritative; rendering never rewrites the document. */
export function previewUnits(body: string): PreviewUnit[] {
  const units: PreviewUnit[] = [];
  const tree = markdownLanguage.parser.parse(body);
  function visit(node: typeof tree.topNode) {
    if (node.name === 'Document' || node.name === 'BulletList' || node.name === 'OrderedList') {
      for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
      return;
    }
    if (node.name === 'LinkReference' || node.name === 'HTMLBlock') return;
    // An unfinished fence is still being authored, including after Enter.
    if (node.name === 'FencedCode' && node.getChildren('CodeMark').length < 2) return;
    const text = body.slice(node.from, node.to);
    if (node.name === 'Paragraph') {
      let from = node.from;
      for (const line of text.split('\n')) {
        if (line.trim()) units.push({ from, to: from + line.length, text: line });
        from += line.length + 1;
      }
    } else {
      units.push({ from: node.from, to: node.to, text });
    }
  }
  visit(tree.topNode);
  return units;
}

export function visiblePreviewUnits(units: PreviewUnit[], selection: EditorSelection) {
  return units.filter(
    (unit) =>
      !selection.ranges.some((range) =>
        range.empty
          ? range.from >= unit.from && range.from <= unit.to
          : range.from <= unit.to && range.to >= unit.from,
      ),
  );
}

export function referenceDefinitions(body: string): string {
  const tree = markdownLanguage.parser.parse(body);
  return tree.topNode
    .getChildren('LinkReference')
    .map((node) => body.slice(node.from, node.to))
    .join('\n');
}

const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false });
export function markdownEnter(target: {
  state: EditorState;
  dispatch: (transaction: Transaction) => void;
  composing?: boolean;
}) {
  if (target.composing) return false;
  return continueMarkup({ state: target.state, dispatch: (transaction) => target.dispatch(transaction) });
}
