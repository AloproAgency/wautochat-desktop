'use client';

import { useEffect, useRef } from 'react';
import {
  Copy,
  Trash2,
  LayoutGrid,
  ClipboardPaste,
  MousePointer2,
  Link2Off,
  GitBranch,
  Maximize2,
  ScanLine,
} from 'lucide-react';

export type ContextMenuTarget =
  | { kind: 'pane'; flowX: number; flowY: number }
  | { kind: 'node'; nodeId: string; nodeLabel: string }
  | { kind: 'edge'; edgeId: string };

export interface ContextMenuAction {
  // pane
  onAddNodeHere?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onAutoLayout?: () => void;
  onFitView?: () => void;
  // node
  onDuplicate?: () => void;
  onCopyNode?: () => void;
  onDeleteNode?: () => void;
  onDisconnect?: () => void;
  // edge
  onDeleteEdge?: () => void;
}

interface Props {
  x: number;       // screen px
  y: number;       // screen px
  target: ContextMenuTarget;
  actions: ContextMenuAction;
  canPaste: boolean;
  onClose: () => void;
}

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onClose: () => void;
}

function MenuItem({ icon: Icon, label, shortcut, danger, disabled, onClick, onClose }: MenuItemProps) {
  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onClick();
          onClose();
        }
      }}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-[12px] font-medium transition-colors
        ${danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-slate-700 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-700'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-mono">{shortcut}</span>
      )}
    </button>
  );
}

function Separator() {
  return <div className="h-px bg-slate-100 dark:bg-zinc-700 my-1" />;
}

export function CanvasContextMenu({ x, y, target, actions, canPaste, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp position to stay inside viewport
  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 200; // rough estimate
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ left: clampedX, top: clampedY }}
      className="fixed z-[1000] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl py-1.5 min-w-[190px] select-none"
    >
      {target.kind === 'pane' && (
        <>
          <MenuItem
            icon={GitBranch}
            label="Add Node Here"
            onClick={actions.onAddNodeHere ?? (() => {})}
            onClose={onClose}
          />
          <Separator />
          <MenuItem
            icon={ClipboardPaste}
            label="Paste"
            shortcut="Ctrl+V"
            disabled={!canPaste}
            onClick={actions.onPaste ?? (() => {})}
            onClose={onClose}
          />
          <MenuItem
            icon={MousePointer2}
            label="Select All"
            shortcut="Ctrl+A"
            onClick={actions.onSelectAll ?? (() => {})}
            onClose={onClose}
          />
          <Separator />
          <MenuItem
            icon={LayoutGrid}
            label="Auto Layout"
            onClick={actions.onAutoLayout ?? (() => {})}
            onClose={onClose}
          />
          <MenuItem
            icon={Maximize2}
            label="Fit View"
            onClick={actions.onFitView ?? (() => {})}
            onClose={onClose}
          />
        </>
      )}

      {target.kind === 'node' && (
        <>
          <MenuItem
            icon={Copy}
            label="Copy"
            shortcut="Ctrl+C"
            onClick={actions.onCopyNode ?? (() => {})}
            onClose={onClose}
          />
          <MenuItem
            icon={ScanLine}
            label="Duplicate"
            shortcut="Ctrl+D"
            onClick={actions.onDuplicate ?? (() => {})}
            onClose={onClose}
          />
          <Separator />
          <MenuItem
            icon={Link2Off}
            label="Disconnect All"
            onClick={actions.onDisconnect ?? (() => {})}
            onClose={onClose}
          />
          <Separator />
          <MenuItem
            icon={Trash2}
            label="Delete Node"
            shortcut="Del"
            danger
            onClick={actions.onDeleteNode ?? (() => {})}
            onClose={onClose}
          />
        </>
      )}

      {target.kind === 'edge' && (
        <>
          <MenuItem
            icon={Trash2}
            label="Delete Connection"
            shortcut="Del"
            danger
            onClick={actions.onDeleteEdge ?? (() => {})}
            onClose={onClose}
          />
        </>
      )}
    </div>
  );
}
