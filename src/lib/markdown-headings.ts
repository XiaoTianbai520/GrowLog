export interface MarkdownHeading {
  id: string;
  text: string;
  level: number;
  line: number;
  children: MarkdownHeading[];
}

const plainHeading = (value: string) =>
  value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

/** Parse the visible Markdown outline without treating headings in fenced code as content. */
export function markdownHeadings(markdown: string): MarkdownHeading[] {
  const roots: MarkdownHeading[] = [];
  const stack: MarkdownHeading[] = [];
  const lines = markdown.split(/\r?\n/);
  let fence: '`' | '~' | null = null;
  let serial = 0;

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      return;
    }
    if (fence) return;

    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return;
    const text = plainHeading(match[2]);
    if (!text) return;

    const node: MarkdownHeading = {
      id: `heading-${++serial}`,
      text,
      level: match[1].length,
      line: index + 1,
      children: [],
    };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  });

  return roots;
}
