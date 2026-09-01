import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, FileText, FolderTree, RotateCcw, Save, Sprout } from 'lucide-react';
import type { Note } from '../types';
import { noteTitle } from '../lib/format';
import { markdownHeadings, type MarkdownHeading } from '../lib/markdown-headings';

interface Props {
  folderId: string;
  folderName: string;
  notes: Note[];
  open: (note: Note, line?: number) => void;
}

interface Position {
  x: number;
  y: number;
}

interface MapNode {
  id: string;
  parentId: string | null;
  kind: 'root' | 'note' | 'heading';
  label: string;
  depth: number;
  note?: Note;
  heading?: MarkdownHeading;
  children: MapNode[];
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 42;
const COLUMN_GAP = 72;
const ROW_GAP = 24;
const CANVAS_PADDING = 44;
const storageKey = (folderId: string) => `growlog:mind-map-layout:v1:${folderId}`;

function loadPositions(folderId: string): Record<string, Position> {
  try {
    const value = localStorage.getItem(storageKey(folderId));
    return value ? (JSON.parse(value) as Record<string, Position>) : {};
  } catch {
    return {};
  }
}

function buildTree(folderId: string, folderName: string, notes: Note[]): MapNode {
  const headingNodes = (note: Note, headings: MarkdownHeading[], depth: number): MapNode[] =>
    headings.map((heading) => ({
      id: `heading:${note.id}:${heading.id}`,
      parentId: null,
      kind: 'heading',
      label: heading.text,
      depth,
      note,
      heading,
      children: headingNodes(note, heading.children, depth + 1),
    }));

  const root: MapNode = {
    id: `folder:${folderId}`,
    parentId: null,
    kind: 'root',
    label: folderName,
    depth: 0,
    children: notes.map((note) => ({
      id: `note:${note.id}`,
      parentId: `folder:${folderId}`,
      kind: 'note',
      label: noteTitle(note.title),
      depth: 1,
      note,
      children: headingNodes(note, markdownHeadings(note.body), 2),
    })),
  };

  const connect = (node: MapNode) => {
    node.children.forEach((child) => {
      child.parentId = node.id;
      connect(child);
    });
  };
  connect(root);
  return root;
}

function layoutTree(root: MapNode): { nodes: MapNode[]; positions: Record<string, Position> } {
  const nodes: MapNode[] = [];
  const positions: Record<string, Position> = {};
  let nextLeafY = CANVAS_PADDING;

  const visit = (node: MapNode): number => {
    nodes.push(node);
    let y: number;
    if (!node.children.length) {
      y = nextLeafY;
      nextLeafY += NODE_HEIGHT + ROW_GAP;
    } else {
      const childYs = node.children.map(visit);
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    positions[node.id] = {
      x: CANVAS_PADDING + node.depth * (NODE_WIDTH + COLUMN_GAP),
      y,
    };
    return y;
  };

  visit(root);
  return { nodes, positions };
}

export function MindMap({ folderId, folderName, notes, open }: Props) {
  const tree = useMemo(() => buildTree(folderId, folderName, notes), [folderId, folderName, notes]);
  const automatic = useMemo(() => layoutTree(tree), [tree]);
  const [positions, setPositions] = useState<Record<string, Position>>(() => ({
    ...automatic.positions,
    ...loadPositions(folderId),
  }));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('拖动节点后保存布局');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const saved = loadPositions(folderId);
    setPositions((current) => {
      const next: Record<string, Position> = {};
      automatic.nodes.forEach((node) => {
        next[node.id] = current[node.id] ?? saved[node.id] ?? automatic.positions[node.id];
      });
      return next;
    });
  }, [automatic, folderId]);

  const headingCount = automatic.nodes.filter((node) => node.kind === 'heading').length;
  const maxX = Math.max(...Object.values(positions).map((position) => position.x), 0);
  const maxY = Math.max(...Object.values(positions).map((position) => position.y), 0);
  const canvasSize = {
    width: Math.max(900, maxX + NODE_WIDTH + CANVAS_PADDING),
    height: Math.max(520, maxY + NODE_HEIGHT + CANVAS_PADDING),
  };

  const pointerPosition = (event: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left + canvas.scrollLeft,
      y: event.clientY - bounds.top + canvas.scrollTop,
    };
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    const pointer = pointerPosition(event);
    const position = positions[id];
    if (!pointer || !position) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id,
      offsetX: pointer.x - position.x,
      offsetY: pointer.y - position.y,
      moved: false,
    };
    setDraggingId(id);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const pointer = pointerPosition(event);
    if (!drag || !pointer) return;
    const next = {
      x: Math.max(12, pointer.x - drag.offsetX),
      y: Math.max(12, pointer.y - drag.offsetY),
    };
    const previous = positions[drag.id];
    if (!drag.moved && Math.hypot(next.x - previous.x, next.y - previous.y) < 3) return;
    drag.moved = true;
    suppressClickRef.current = true;
    setPositions((current) => ({ ...current, [drag.id]: next }));
    setDirty(true);
    setMessage('布局有改动，记得保存');
  };

  const endDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const activate = (node: MapNode) => {
    if (suppressClickRef.current || !node.note) return;
    open(node.note, node.heading?.line);
  };

  const saveLayout = () => {
    try {
      localStorage.setItem(storageKey(folderId), JSON.stringify(positions));
      setDirty(false);
      setMessage('布局已保存到本机');
    } catch {
      setMessage('布局保存失败，请重试');
    }
  };

  const resetLayout = () => {
    localStorage.removeItem(storageKey(folderId));
    setPositions(automatic.positions);
    setDirty(false);
    setMessage('已恢复自动布局');
  };

  return (
    <section className="mind-map" aria-label={`${folderName} 思维导图`}>
      <header className="mind-map-header">
        <div>
          <span className="eyebrow">可整理的知识枝干</span>
          <h2>{folderName}</h2>
          <p>拖动节点整理位置，点击节点回到笔记正文。</p>
        </div>
        <div className="mind-map-header-actions">
          <div className="mind-map-stats" aria-label={`${notes.length} 篇笔记，${headingCount} 个标题`}>
            <span>
              <strong>{notes.length}</strong> 篇笔记
            </span>
            <i />
            <span>
              <strong>{headingCount}</strong> 个标题
            </span>
          </div>
          <div className="mind-map-actions">
            <button className="secondary-button" onClick={resetLayout} title="清除手动位置">
              <RotateCcw size={14} />
              自动布局
            </button>
            <button className="primary-button" onClick={saveLayout} disabled={!dirty}>
              {dirty ? <Save size={14} /> : <Check size={14} />}
              {dirty ? '保存布局' : '已保存'}
            </button>
          </div>
        </div>
      </header>
      {notes.length ? (
        <div className="mind-map-canvas" ref={canvasRef}>
          <div className="mind-map-board" style={canvasSize}>
            <svg
              className="mind-connectors"
              width={canvasSize.width}
              height={canvasSize.height}
              aria-hidden="true"
            >
              {automatic.nodes.map((node) => {
                if (!node.parentId || !positions[node.id] || !positions[node.parentId]) return null;
                const from = positions[node.parentId];
                const to = positions[node.id];
                const startX = from.x + NODE_WIDTH;
                const startY = from.y + NODE_HEIGHT / 2;
                const endX = to.x;
                const endY = to.y + NODE_HEIGHT / 2;
                const bend = startX + (endX - startX) / 2;
                return (
                  <path
                    key={`${node.parentId}-${node.id}`}
                    d={`M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`}
                  />
                );
              })}
            </svg>
            {automatic.nodes.map((node) => {
              const position = positions[node.id] ?? automatic.positions[node.id];
              return (
                <button
                  key={node.id}
                  className={`mind-node mind-node-free ${node.kind}-node ${draggingId === node.id ? 'dragging' : ''}`}
                  style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                  onPointerDown={(event) => startDrag(event, node.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={() => activate(node)}
                  title={node.kind === 'root' ? '拖动文件夹节点' : '点击打开，拖动调整位置'}
                >
                  {node.kind === 'root' && <Sprout size={15} />}
                  {node.kind === 'note' && <FileText size={14} />}
                  <span>{node.label}</span>
                  {node.heading && <small>H{node.heading.level}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mind-map-empty">
          <FolderTree size={31} strokeWidth={1.4} />
          <h3>这个文件夹还没有分枝</h3>
          <p>新建笔记并写下 Markdown 标题，导图会自动出现。</p>
        </div>
      )}
      <footer className="mind-map-footnote">
        <span className={dirty ? 'is-dirty' : ''}>{message}</span>
        <span>标题自动同步 · 正文不会出现在导图中</span>
      </footer>
    </section>
  );
}
