"use client";
import React, { useRef, useState } from 'react';
import { Icons } from '../../components/Icons';

/* -- File Icon Helper with Clean Badges & SVGs --------------- */
export function getFileIcon(filename: string, isDirectory: boolean = false, isOpen: boolean = false) {
  if (isDirectory) {
    return isOpen ? <Icons.FolderOpen /> : <Icons.FolderClosed />;
  }
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (filename === 'Dockerfile' || filename.startsWith('docker-compose')) {
    return <span className="text-info text-xs font-bold font-mono px-1 py-0.2 bg-info-strong/15 rounded border border-info-strong/30">DOCKER</span>;
  }
  switch (ext) {
    case 'ts':
    case 'tsx':
      return <span className="text-info text-xs font-bold font-mono px-1 py-0.2 bg-info-strong/15 rounded border border-info-strong/30">TS</span>;
    case 'js':
    case 'jsx':
    case 'mjs':
      return <span className="text-[#facc15] text-xs font-bold font-mono px-1 py-0.2 bg-[#eab308]/15 rounded border border-[#eab308]/30">JS</span>;
    case 'py':
      return <span className="text-accent-fg text-xs font-bold font-mono px-1 py-0.2 bg-accent-strong/15 rounded border border-accent-strong/30">PY</span>;
    case 'json':
      return <span className="text-warning-fg text-xs font-bold font-mono px-1 py-0.2 bg-warning/15 rounded border border-warning/30">JSON</span>;
    case 'yaml':
    case 'yml':
      return <span className="text-danger-fg text-xs font-bold font-mono px-1 py-0.2 bg-[#dc2626]/15 rounded border border-[#dc2626]/30">YML</span>;
    case 'md':
      return <span className="text-[#c084fc] text-xs font-bold font-mono px-1 py-0.2 bg-[#9333ea]/15 rounded border border-[#9333ea]/30">MD</span>;
    case 'css':
      return <span className="text-info text-xs font-bold font-mono px-1 py-0.2 bg-[#06b6d4]/15 rounded border border-[#06b6d4]/30">CSS</span>;
    case 'sh':
      return <span className="text-[#4ade80] text-xs font-bold font-mono px-1 py-0.2 bg-[#16a34a]/15 rounded border border-[#16a34a]/30">SH</span>;
    default:
      return <Icons.FileCode />;
  }
}

/* -- File Explorer Tree Node --------------------------------- */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: TreeNode[];
}

interface TreeHandlers {
  activePath: string;
  onSelectFile: (path: string) => void;
  onDelete?: (path: string, isDir: boolean) => void;
  onRename?: (path: string, oldName: string) => void;
  onNewFileInDir?: (parentPath: string) => void;
  onNewFolderInDir?: (parentPath: string) => void;
}

/* -- Keyboard-navigable file tree (WAI-ARIA tree pattern) ------
 * Up/Down/Home/End move between visible rows, Right opens a folder or steps into it,
 * Left closes it or steps out to the parent, Enter/Space opens. One row is the tab stop.
 */
export function FileTree({ nodes, ...handlers }: TreeHandlers & { nodes: TreeNode[] }) {
  // Folders start open above depth 2; clicks and keys override per path
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({});
  const [focusPath, setFocusPath] = useState('');
  const treeRef = useRef<HTMLDivElement>(null);

  const isExpanded = (node: TreeNode, depth: number) => expandedOverride[node.path] ?? depth < 2;
  const setExpanded = (path: string, open: boolean) => setExpandedOverride(prev => ({ ...prev, [path]: open }));

  const visible: string[] = [];
  const walk = (list: TreeNode[], depth: number) => {
    for (const n of list) {
      visible.push(n.path);
      if (n.type === 'directory' && n.children && isExpanded(n, depth)) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  const tabStop = visible.includes(focusPath) ? focusPath : visible.includes(handlers.activePath) ? handlers.activePath : visible[0];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const row = rows[i];
    const level = Number(row.getAttribute('aria-level'));
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(i + 1, rows.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(i - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if (e.key === 'ArrowRight' && row.getAttribute('aria-expanded') === 'true') next = Math.min(i + 1, rows.length - 1);
    else if (e.key === 'ArrowLeft' && row.getAttribute('aria-expanded') !== 'true') {
      for (let j = i - 1; j >= 0; j--) {
        if (Number(rows[j].getAttribute('aria-level')) === level - 1) { next = j; break; }
      }
    } else return;
    e.preventDefault();
    if (next >= 0) rows[next].focus();
  };

  return (
    <div ref={treeRef} role="tree" aria-label="Files" onKeyDown={handleKeyDown}>
      {nodes.map(node => (
        <FileTreeNode
          key={node.path}
          node={node}
          {...handlers}
          isExpanded={isExpanded}
          setExpanded={setExpanded}
          tabStop={tabStop}
          onFocusRow={setFocusPath}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  node,
  activePath,
  onSelectFile,
  onDelete,
  onRename,
  onNewFileInDir,
  onNewFolderInDir,
  isExpanded,
  setExpanded,
  tabStop,
  onFocusRow,
  depth = 0
}: TreeHandlers & {
  node: TreeNode;
  isExpanded: (node: TreeNode, depth: number) => boolean;
  setExpanded: (path: string, open: boolean) => void;
  tabStop: string;
  onFocusRow: (path: string) => void;
  depth?: number;
}) {
  const expanded = isExpanded(node, depth);
  const isDir = node.type === 'directory';
  const isActive = node.path === activePath;

  const activate = () => {
    if (isDir) {
      setExpanded(node.path, !expanded);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    activate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;   // keys pressed on the row's own buttons
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    } else if (isDir && e.key === 'ArrowRight' && !expanded) {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(node.path, true);
    } else if (isDir && e.key === 'ArrowLeft' && expanded) {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(node.path, false);
    }
  };

  return (
    <div>
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={isActive}
        tabIndex={node.path === tabStop ? 0 : -1}
        onFocus={(e) => { if (e.target === e.currentTarget) onFocusRow(node.path); }}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        draggable={!isDir}
        onDragStart={(e) => {
          if (!isDir) {
            e.dataTransfer.setData("application/json", JSON.stringify({ path: node.path, name: node.name }));
            e.dataTransfer.effectAllowed = "copy";
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-sm font-mono select-none transition-colors group relative ${
          isActive
            ? 'bg-overlay text-accent-fg font-medium'
            : 'text-fg-muted hover:bg-raised hover:text-fg'
        }`}
      >
        <span className="w-3.5 flex items-center justify-center flex-shrink-0">
          {isDir ? (expanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />) : null}
        </span>
        {getFileIcon(node.name, isDir, expanded)}
        <span className="truncate flex-1 ml-0.5" title={node.path}>{node.name}</span>

        {/* Hover Action Buttons */}
        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5 bg-surface/90 rounded px-1 flex-shrink-0">
          {isDir && onNewFileInDir && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewFileInDir(node.path); }}
              title="New File inside folder" aria-label="New File inside folder"
              className="text-fg-subtle hover:text-accent-fg p-0.5 rounded cursor-pointer"
            >
              <Icons.FilePlus />
            </button>
          )}
          {isDir && onNewFolderInDir && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewFolderInDir(node.path); }}
              title="New Folder inside folder" aria-label="New Folder inside folder"
              className="text-fg-subtle hover:text-accent-fg p-0.5 rounded cursor-pointer"
            >
              <Icons.FolderPlus />
            </button>
          )}
          {onRename && (
            <button
              onClick={(e) => { e.stopPropagation(); onRename(node.path, node.name); }}
              title="Rename" aria-label="Rename"
              className="text-fg-subtle hover:text-fg-soft p-0.5 rounded cursor-pointer"
            >
              <Icons.Edit />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.path, isDir); }}
              title="Delete" aria-label="Delete"
              className="text-fg-subtle hover:text-danger p-0.5 rounded cursor-pointer"
            >
              <Icons.Trash />
            </button>
          )}
        </div>
      </div>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              onSelectFile={onSelectFile}
              onDelete={onDelete}
              onRename={onRename}
              onNewFileInDir={onNewFileInDir}
              onNewFolderInDir={onNewFolderInDir}
              isExpanded={isExpanded}
              setExpanded={setExpanded}
              tabStop={tabStop}
              onFocusRow={onFocusRow}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
