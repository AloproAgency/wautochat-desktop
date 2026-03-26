'use client';

import {
  useCallback,
  useRef,
  useState,
  useMemo,
  useEffect,
  type DragEvent,
} from 'react';
import { useFlowExecutionStream } from '@/hooks/use-flow-execution-stream';
import { ExecutionContext } from './execution-context';
import ExecutionLogPanel from './execution-log-panel';
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  ReactFlowProvider,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
  MarkerType,
} from 'reactflow';
import { Controls } from '@reactflow/controls';
import { MiniMap } from '@reactflow/minimap';
import { Background, BackgroundVariant } from '@reactflow/background';
import 'reactflow/dist/style.css';

import { create } from 'zustand';

import type { FlowNodeData, FlowNodeSerialized, FlowEdgeSerialized } from '@/lib/types';
import TriggerNode from './nodes/trigger-node';
import MessageNode from './nodes/message-node';
import ActionNode from './nodes/action-node';
import ConditionNode from './nodes/condition-node';
import DelayNode from './nodes/delay-node';
import LogicNode from './nodes/logic-node';
import NodePalette, { paletteItems, triggerTypeMap, type PaletteItem } from './node-palette';
import NodeConfigPanel from './node-config-panel';
import {
  Save,
  Undo2,
  Redo2,
  LayoutGrid,
  Loader2,
  Workflow,
  Plus,
} from 'lucide-react';

// ---- Undo/Redo store ----
interface HistoryEntry {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

interface UndoRedoStore {
  past: HistoryEntry[];
  future: HistoryEntry[];
  pushState: (entry: HistoryEntry) => void;
  undo: (current: HistoryEntry) => HistoryEntry | null;
  redo: (current: HistoryEntry) => HistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const useUndoRedoStore = create<UndoRedoStore>((set, get) => ({
  past: [],
  future: [],
  pushState: (entry) =>
    set((state) => ({
      past: [...state.past.slice(-50), entry],
      future: [],
    })),
  undo: (current) => {
    const { past } = get();
    if (past.length === 0) return null;
    const prev = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [current, ...state.future],
    }));
    return prev;
  },
  redo: (current) => {
    const { future } = get();
    if (future.length === 0) return null;
    const next = future[0];
    set((state) => ({
      past: [...state.past, current],
      future: state.future.slice(1),
    }));
    return next;
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

// ---- Node type mapping ----
const nodeTypeMap: Record<string, string> = {
  trigger: 'triggerNode',
  message: 'messageNode',
  action: 'actionNode',
  condition: 'conditionNode',
  delay: 'delayNode',
  logic: 'logicNode',
};

function getNodeCategory(flowNodeType: string): string {
  if (flowNodeType === 'trigger') return 'trigger';
  if (
    [
      'send-reaction',
      'forward-message',
      'mark-as-read',
      'typing-indicator',
      'assign-label',
      'remove-label',
      'add-to-group',
      'remove-from-group',
      'block-contact',
      'unblock-contact',
    ].includes(flowNodeType)
  )
    return 'action';
  if (flowNodeType.startsWith('send-')) return 'message';
  if (flowNodeType === 'condition') return 'condition';
  if (flowNodeType === 'delay') return 'delay';
  return 'logic';
}

// ---- Props ----
interface FlowCanvasProps {
  flowId: string;
  initialNodes: FlowNodeSerialized[];
  initialEdges: FlowEdgeSerialized[];
  onSaveTimestamp?: (ts: Date) => void;
}

// ---- Inner canvas component (must be inside ReactFlowProvider) ----
function FlowCanvasInner({
  flowId,
  initialNodes,
  initialEdges,
  onSaveTimestamp,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [logPanelVisible, setLogPanelVisible] = useState(false);

  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [showMobileConfig, setShowMobileConfig] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // When a node is selected on mobile, show config overlay
  useEffect(() => {
    if (isMobile && selectedNode) {
      setShowMobileConfig(true);
    }
  }, [isMobile, selectedNode]);

  // Execution stream
  const { nodeStates, isConnected, activeExecutionId, executionLog, clearStates } = useFlowExecutionStream(flowId);

  // Convert serialized nodes to ReactFlow nodes
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(() =>
    initialNodes.map((n) => ({
      id: n.id,
      type: nodeTypeMap[getNodeCategory(n.data.type)] || 'logicNode',
      position: n.position,
      data: n.data,
    }))
  );

  const [edges, setEdges] = useState<Edge[]>(() =>
    initialEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      label: e.label || undefined,
      animated: false,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }))
  );

  // Visual edge highlighting based on execution state
  const visualEdges = useMemo(() => {
    if (Object.keys(nodeStates).length === 0) return edges;
    return edges.map((edge) => {
      const sourceState = nodeStates[edge.source];
      const targetState = nodeStates[edge.target];

      if (sourceState?.status === 'success' || sourceState?.status === 'executing') {
        if (targetState?.status === 'executing') {
          return {
            ...edge,
            style: { stroke: '#22c55e', strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
            animated: true,
          };
        }
        if (targetState?.status === 'success' || targetState?.status === 'error') {
          return {
            ...edge,
            style: { stroke: targetState.status === 'error' ? '#ef4444' : '#22c55e', strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: targetState.status === 'error' ? '#ef4444' : '#22c55e' },
            animated: false,
          };
        }
        return {
          ...edge,
          style: { stroke: '#22c55e', strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
          animated: true,
        };
      }

      if (sourceState?.status === 'error') {
        return {
          ...edge,
          style: { stroke: '#ef4444', strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
          animated: false,
        };
      }

      return edge;
    });
  }, [edges, nodeStates]);

  const nodeTypes = useMemo(
    () => ({
      triggerNode: TriggerNode,
      messageNode: MessageNode,
      actionNode: ActionNode,
      conditionNode: ConditionNode,
      delayNode: DelayNode,
      logicNode: LogicNode,
    }),
    []
  );

  const { pushState, undo, redo, canUndo, canRedo } = useUndoRedoStore();

  const saveHistory = useCallback(() => {
    pushState({ nodes: [...nodes], edges: [...edges] });
  }, [nodes, edges, pushState]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      saveHistory();
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: false,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [saveHistory]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return false;
      const exists = edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle
      );
      return !exists;
    },
    [edges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<FlowNodeData>) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    if (isMobile) setShowMobileConfig(false);
  }, [isMobile]);

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      saveHistory();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [saveHistory]
  );

  // Drag & drop from palette
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      if (!rfInstance || !reactFlowWrapper.current) return;

      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) return;

      const { type, nodeCategory, label, triggerType } = JSON.parse(raw);

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      saveHistory();

      const newNode: Node<FlowNodeData> = {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: nodeTypeMap[nodeCategory] || 'logicNode',
        position,
        data: {
          label,
          type,
          config: triggerType ? { triggerType } : {},
          description: '',
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, saveHistory]
  );

  // Add node from mobile palette overlay
  const handleMobilePaletteSelect = useCallback(
    (item: PaletteItem) => {
      saveHistory();

      // Place in center of current viewport
      const position = rfInstance
        ? rfInstance.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
        : { x: 200, y: 200 };

      const newNode: Node<FlowNodeData> = {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: nodeTypeMap[item.nodeCategory] || 'logicNode',
        position,
        data: {
          label: item.label,
          type: item.type,
          config: triggerTypeMap[item.label] ? { triggerType: triggerTypeMap[item.label] } : {},
          description: '',
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setShowMobilePalette(false);
    },
    [rfInstance, saveHistory]
  );

  // Update node data from config panel
  const onUpdateNode = useCallback(
    (nodeId: string, data: FlowNodeData) => {
      saveHistory();
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data } : n))
      );
      setSelectedNode(null);
      setShowMobileConfig(false);
    },
    [saveHistory]
  );

  // Delete node
  const onDeleteNode = useCallback(
    (nodeId: string) => {
      saveHistory();
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNode(null);
      setShowMobileConfig(false);
    },
    [saveHistory]
  );

  // Undo
  const handleUndo = useCallback(() => {
    const prev = undo({ nodes, edges });
    if (prev) {
      setNodes(prev.nodes);
      setEdges(prev.edges);
      setSelectedNode(null);
    }
  }, [nodes, edges, undo]);

  // Redo
  const handleRedo = useCallback(() => {
    const next = redo({ nodes, edges });
    if (next) {
      setNodes(next.nodes);
      setEdges(next.edges);
      setSelectedNode(null);
    }
  }, [nodes, edges, redo]);

  // Auto-layout (BFS)
  const handleAutoLayout = useCallback(() => {
    saveHistory();

    const triggerNodes = nodes.filter((n) => n.data.type === 'trigger');
    const otherNodes = nodes.filter((n) => n.data.type !== 'trigger');

    const ySpacing = 120;
    const xSpacing = 260;
    const startX = 300;
    const startY = 50;

    const children: Record<string, string[]> = {};
    for (const edge of edges) {
      if (!children[edge.source]) children[edge.source] = [];
      children[edge.source].push(edge.target);
    }

    const positioned = new Set<string>();
    const newPositions: Record<string, { x: number; y: number }> = {};

    let queue: { id: string; x: number; y: number }[] = triggerNodes.map(
      (n, i) => ({
        id: n.id,
        x: startX + i * xSpacing,
        y: startY,
      })
    );

    while (queue.length > 0) {
      const next: typeof queue = [];
      for (const item of queue) {
        if (positioned.has(item.id)) continue;
        positioned.add(item.id);
        newPositions[item.id] = { x: item.x, y: item.y };

        const kids = children[item.id] || [];
        kids.forEach((kidId, idx) => {
          if (!positioned.has(kidId)) {
            const offsetX = (idx - (kids.length - 1) / 2) * xSpacing;
            next.push({
              id: kidId,
              x: item.x + offsetX,
              y: item.y + ySpacing,
            });
          }
        });
      }
      queue = next;
    }

    let orphanY = startY;
    for (const n of otherNodes) {
      if (!positioned.has(n.id)) {
        newPositions[n.id] = { x: startX + 500, y: orphanY };
        orphanY += ySpacing;
      }
    }

    setNodes((nds) =>
      nds.map((n) =>
        newPositions[n.id] ? { ...n, position: newPositions[n.id] } : n
      )
    );
  }, [nodes, edges, saveHistory]);

  // Save flow
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const serializedNodes: FlowNodeSerialized[] = nodes.map((n) => ({
        id: n.id,
        type: n.type || 'logicNode',
        position: n.position,
        data: n.data,
      }));

      const serializedEdges: FlowEdgeSerialized[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        label: typeof e.label === 'string' ? e.label : undefined,
      }));

      await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: serializedNodes,
          edges: serializedEdges,
        }),
      });

      if (onSaveTimestamp) {
        onSaveTimestamp(new Date());
      }
    } catch (err) {
      console.error('Failed to save flow:', err);
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, flowId, onSaveTimestamp]);

  // Keyboard shortcuts
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleUndo, handleRedo, handleSave]
  );

  // Track zoom
  const onMoveEnd = useCallback((_: unknown, viewport: { zoom: number }) => {
    setZoom(viewport.zoom);
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  const isEmpty = nodes.length === 0;

  // Palette width for tablet / desktop
  const paletteWidth = isTablet ? 240 : 300;

  return (
    <div className="flex w-full" style={{ height: '100%' }} onKeyDown={onKeyDown} tabIndex={0}>
      {/* Left palette - hidden on mobile */}
      {!isMobile && (
        <div style={{ width: paletteWidth, minWidth: paletteWidth }} className="shrink-0">
          <NodePalette />
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative" ref={reactFlowWrapper} style={{ minHeight: 0 }}>
        {/* Floating Toolbar - Top Center */}
        <div
          className="absolute top-3 md:top-4 left-1/2 z-10 flex items-center gap-0.5 md:gap-1 bg-white rounded-full border border-gray-200 px-1.5 md:px-2 py-1 md:py-1.5"
          style={{
            transform: 'translateX(-50%)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            height: isMobile ? 38 : 44,
          }}
        >
          <button
            onClick={handleUndo}
            disabled={!canUndo()}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-600" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo()}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-600" />
          </button>

          <div className="w-px h-4 md:h-5 bg-gray-200 mx-0.5 md:mx-1" />

          <button
            onClick={handleAutoLayout}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            title="Auto Layout"
          >
            <LayoutGrid className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-600" />
          </button>

          {/* Hide zoom text on mobile */}
          {!isMobile && (
            <>
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <span
                className="text-xs font-medium text-gray-500 px-2 select-none"
                style={{ minWidth: 42, textAlign: 'center' }}
              >
                {zoomPercent}%
              </span>
            </>
          )}

          <div className="w-px h-4 md:h-5 bg-gray-200 mx-0.5 md:mx-1" />

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: saving ? '#6b7280' : '#25D366' }}
            className="flex items-center gap-1 md:gap-1.5 px-3 md:px-4 py-1 md:py-1.5 rounded-full text-white text-xs font-semibold disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">Save</span>
          </button>

          {/* Live indicator */}
          {activeExecutionId && (
            <>
              <div className="w-px h-4 md:h-5 bg-gray-200 mx-0.5 md:mx-1" />
              <div className="flex items-center gap-1.5 px-1 md:px-2">
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#22c55e',
                    display: 'inline-block',
                    animation: 'executionPulse 1.5s ease-in-out infinite',
                  }}
                />
                <span className="text-xs font-semibold hidden md:inline" style={{ color: '#22c55e' }}>
                  Live
                </span>
              </div>
            </>
          )}
        </div>

        {/* SSE connection indicator */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title={isConnected ? 'Connected to execution stream' : 'Disconnected from execution stream'}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: isConnected ? '#22c55e' : '#9ca3af',
              display: 'inline-block',
            }}
          />
        </div>

        {/* Empty State */}
        {isEmpty && (
          <div
            className="absolute inset-0 z-5 flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center text-center px-4">
              <div
                className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"
              >
                <Workflow className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-500 mb-1">
                Start building your flow
              </h3>
              <p className="text-sm text-gray-400 max-w-xs">
                {isMobile
                  ? 'Tap the + button to add nodes'
                  : 'Drag nodes from the panel on the left to get started'}
              </p>
            </div>
          </div>
        )}

        <ExecutionContext.Provider value={nodeStates}>
        <ReactFlow
          nodes={nodes}
          edges={visualEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onEdgeClick={onEdgeClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onInit={setRfInstance}
          onMoveEnd={onMoveEnd}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={['Backspace', 'Delete']}
          snapToGrid
          snapGrid={[20, 20]}
          minZoom={0.2}
          maxZoom={3}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{ stroke: '#94a3b8', strokeWidth: 2 }}
          defaultEdgeOptions={{
            animated: false,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls position="bottom-left" />
          {!isMobile && (
            <MiniMap
              position="bottom-right"
              nodeColor={(node) => {
                const cat = getNodeCategory(node.data?.type || '');
                switch (cat) {
                  case 'trigger': return '#22c55e';
                  case 'message': return '#075E54';
                  case 'action': return '#6366f1';
                  case 'condition': return '#f59e0b';
                  case 'delay': return '#8b5cf6';
                  case 'logic': return '#8b5cf6';
                  default: return '#94a3b8';
                }
              }}
              maskColor="rgba(0, 0, 0, 0.06)"
            />
          )}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
        </ReactFlow>
        </ExecutionContext.Provider>

        {/* Mobile floating "+" button to open palette */}
        {isMobile && (
          <button
            onClick={() => setShowMobilePalette(true)}
            className="absolute z-10 flex items-center justify-center rounded-full text-white shadow-lg"
            style={{
              bottom: 24,
              right: 24,
              width: 56,
              height: 56,
              backgroundColor: '#25D366',
            }}
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {/* Mobile palette overlay */}
        {isMobile && showMobilePalette && (
          <NodePalette
            mode="overlay"
            onClose={() => setShowMobilePalette(false)}
            onItemSelect={handleMobilePaletteSelect}
          />
        )}

        {/* Mobile config panel overlay */}
        {isMobile && showMobileConfig && selectedNode && (
          <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
            <NodeConfigPanel
              node={selectedNode}
              onClose={() => {
                setSelectedNode(null);
                setShowMobileConfig(false);
              }}
              onUpdate={onUpdateNode}
              onDelete={onDeleteNode}
            />
          </div>
        )}

        {/* Execution Log Panel */}
        <ExecutionLogPanel
          events={executionLog}
          isVisible={logPanelVisible}
          onToggle={() => setLogPanelVisible((v) => !v)}
          onClear={clearStates}
        />
      </div>

      {/* Right config panel - tablet & desktop only */}
      {!isMobile && selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onUpdate={onUpdateNode}
          onDelete={onDeleteNode}
        />
      )}
    </div>
  );
}

// ---- Wrapper with ReactFlowProvider ----
export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
