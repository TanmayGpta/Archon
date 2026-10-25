"use client";
import React, { useState } from 'react';
import { Icons } from '../../components/Icons';

/* -- File Icon Helper with Clean Badges & SVGs --------------- */
export function getFileIcon(filename: string, isDirectory: boolean = false, isOpen: boolean = false) {
  if (isDirectory) {
    return isOpen ? <Icons.FolderOpen /> : <Icons.FolderClosed />;
  }
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (filename === 'Dockerfile' || filename.startsWith('docker-compose')) {
    return <span className="text-[#38bdf8] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#0284c7]/15 rounded border border-[#0284c7]/30">DOCKER</span>;
  }
  switch (ext) {
    case 'ts':
    case 'tsx':
      return <span className="text-[#38bdf8] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#0284c7]/15 rounded border border-[#0284c7]/30">TS</span>;
    case 'js':
    case 'jsx':
    case 'mjs':
      return <span className="text-[#facc15] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#eab308]/15 rounded border border-[#eab308]/30">JS</span>;
    case 'py':
      return <span className="text-[#60a5fa] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#2563eb]/15 rounded border border-[#2563eb]/30">PY</span>;
    case 'json':
      return <span className="text-[#fbbf24] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#f59e0b]/15 rounded border border-[#f59e0b]/30">JSON</span>;
    case 'yaml':
    case 'yml':
      return <span className="text-[#f87171] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#dc2626]/15 rounded border border-[#dc2626]/30">YML</span>;
    case 'md':
      return <span className="text-[#c084fc] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#9333ea]/15 rounded border border-[#9333ea]/30">MD</span>;
    case 'css':
      return <span className="text-[#38bdf8] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#06b6d4]/15 rounded border border-[#06b6d4]/30">CSS</span>;
    case 'sh':
      return <span className="text-[#4ade80] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#16a34a]/15 rounded border border-[#16a34a]/30">SH</span>;
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

export function FileTreeNode({
  node,
  activePath,
  onSelectFile,
  onDelete,
  onRename,
  onNewFileInDir,
  onNewFolderInDir,
  depth = 0
}: {
  node: TreeNode;
  activePath: string;
  onSelectFile: (path: string) => void;
  onDelete?: (path: string, isDir: boolean) => void;
  onRename?: (path: string, oldName: string) => void;
  onNewFileInDir?: (parentPath: string) => void;
  onNewFolderInDir?: (parentPath: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isActive = node.path === activePath;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        draggable={!isDir}
        onDragStart={(e) => {
          if (!isDir) {
            e.dataTransfer.setData("application/json", JSON.stringify({ path: node.path, name: node.name }));
            e.dataTransfer.effectAllowed = "copy";
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-[12px] font-mono select-none transition-colors group relative ${
          isActive
            ? 'bg-[#1d222e] text-[#60a5fa] font-medium'
            : 'text-[#9ca3af] hover:bg-[#12151c] hover:text-[#e2e5ea]'
        }`}
      >
        <span className="w-3.5 flex items-center justify-center flex-shrink-0">
          {isDir ? (expanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />) : null}
        </span>
        {getFileIcon(node.name, isDir, expanded)}
        <span className="truncate flex-1 ml-0.5" title={node.path}>{node.name}</span>

        {/* Hover Action Buttons */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-[#0c0e12]/90 rounded px-1 flex-shrink-0">
          {isDir && onNewFileInDir && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewFileInDir(node.path); }}
              title="New File inside folder"
              className="text-[#64748b] hover:text-[#60a5fa] p-0.5 rounded cursor-pointer"
            >
              <Icons.FilePlus />
            </button>
          )}
          {isDir && onNewFolderInDir && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewFolderInDir(node.path); }}
              title="New Folder inside folder"
              className="text-[#64748b] hover:text-[#60a5fa] p-0.5 rounded cursor-pointer"
            >
              <Icons.FolderPlus />
            </button>
          )}
          {onRename && (
            <button
              onClick={(e) => { e.stopPropagation(); onRename(node.path, node.name); }}
              title="Rename"
              className="text-[#64748b] hover:text-[#cbd5e1] p-0.5 rounded cursor-pointer"
            >
              <Icons.Edit />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.path, isDir); }}
              title="Delete"
              className="text-[#64748b] hover:text-[#ef4444] p-0.5 rounded cursor-pointer"
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
