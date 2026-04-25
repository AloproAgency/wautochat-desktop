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
  SelectionMode,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from 'reactflow';
import { CanvasContextMenu, type ContextMenuTarget } from './canvas-context-menu';
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
import AiNode, { AiAgentNodeComponent, LlmNodeComponent, MemoryNodeComponent, ToolNodeComponent, WppConnectAllNodeComponent } from './nodes/ai-node';
import FlowEdge from './custom-edge';
import NodePalette, { triggerTypeMap, type PaletteItem } from './node-palette';
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
  ai: 'aiNode',
  aiAgent: 'aiAgentNode',
  llm: 'llmNode',
  memory: 'memoryNode',
  tool: 'toolNode',
  wppconnect: 'wppconnectAllNode',
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
  if (flowNodeType === 'ai-agent') return 'aiAgent';
  if (['ai-response', 'ai-classifier', 'ai-extractor', 'ai-summarizer', 'ai-sentiment', 'ai-translator', 'ai-vision'].includes(flowNodeType)) return 'ai';
  if (['llm-claude', 'llm-openai', 'llm-gemini', 'llm-ollama'].includes(flowNodeType)) return 'llm';
  if (['memory-buffer', 'memory-vector', 'memory-window'].includes(flowNodeType)) return 'memory';
  if (['tool-code', 'tool-http', 'tool-search', 'tool-mcp'].includes(flowNodeType)) return 'tool';
  if (flowNodeType === 'wppconnect-all') return 'wppconnect';
  return 'logic';
}

// ---- Props ----
interface FlowCanvasProps {
  flowId: string;
  sessionId: string;
  initialNodes: FlowNodeSerialized[];
  initialEdges: FlowEdgeSerialized[];
  onSaveTimestamp?: (ts: Date) => void;
}

// ---- Inner canvas component (must be inside ReactFlowProvider) ----
function FlowCanvasInner({
  flowId,
  sessionId,
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

  // Context menu, quick-add popup, clipboard
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null);
  const [clipboard, setClipboard] = useState<Node<FlowNodeData>[]>([]);
  // Flow position where the palette was opened (double-click), null = use viewport center
  const paletteDropPosRef = useRef<{ x: number; y: number } | null>(null);

  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  // Screen position for the floating palette (double-click); null = anchored to toolbar
  const [paletteScreenPos, setPaletteScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [showMobileConfig, setShowMobileConfig] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

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
      type: 'colored',
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
            type: 'colored',
            style: { stroke: '#22c55e', strokeWidth: 3 },
            animated: true,
          };
        }
        if (targetState?.status === 'success' || targetState?.status === 'error') {
          return {
            ...edge,
            type: 'colored',
            style: { stroke: targetState.status === 'error' ? '#ef4444' : '#22c55e', strokeWidth: 3 },
            animated: false,
          };
        }
        return {
          ...edge,
          type: 'colored',
          style: { stroke: '#22c55e', strokeWidth: 2.5 },
          animated: true,
        };
      }

      if (sourceState?.status === 'error') {
        return {
          ...edge,
          type: 'colored',
          style: { stroke: '#ef4444', strokeWidth: 2.5 },
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
      aiNode: AiNode,
      aiAgentNode: AiAgentNodeComponent,
      llmNode: LlmNodeComponent,
      memoryNode: MemoryNodeComponent,
      toolNode: ToolNodeComponent,
      wppconnectAllNode: WppConnectAllNodeComponent,
    }),
    []
  );

  const edgeTypes = useMemo(() => ({ colored: FlowEdge }), []);

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
            type: 'colored',
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
    setContextMenu(null);
    setShowPalette(false);
    setPaletteScreenPos(null);
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

      const { type, nodeCategory, label, triggerType, triggerCategory } = JSON.parse(raw);

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      saveHistory();

      const triggerConfig: Record<string, unknown> = {};
      if (triggerType) triggerConfig.triggerType = triggerType;
      if (triggerCategory) triggerConfig.triggerCategory = triggerCategory;

      const newNode: Node<FlowNodeData> = {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: nodeTypeMap[nodeCategory] || 'logicNode',
        position,
        data: {
          label,
          type,
          config: Object.keys(triggerConfig).length > 0 ? triggerConfig : {},
          description: '',
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, saveHistory]
  );

  // Add a node at a specific flow-coordinate position (used by quick-add and context menu)
  const addNodeAtPosition = useCallback(
    (type: string, nodeCategory: string, label: string, flowX: number, flowY: number, triggerCategory?: string) => {
      saveHistory();
      const triggerConfig: Record<string, unknown> = {};
      if (type === 'trigger' && triggerCategory) {
        triggerConfig.triggerType = triggerTypeMap[label] || type;
        triggerConfig.triggerCategory = triggerCategory;
      }
      const newNode: Node<FlowNodeData> = {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: nodeTypeMap[nodeCategory] || 'logicNode',
        position: { x: flowX, y: flowY },
        data: {
          label,
          type: type as FlowNodeData['type'],
          config: Object.keys(triggerConfig).length > 0 ? triggerConfig : {},
          description: '',
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [saveHistory]
  );

  // Add node from palette (dropdown or mobile overlay)
  const handleMobilePaletteSelect = useCallback(
    (item: PaletteItem) => {
      saveHistory();

      // Use stored double-click position, or fall back to viewport center
      const dropPos = paletteDropPosRef.current;
      paletteDropPosRef.current = null;
      const position = dropPos
        ? dropPos
        : rfInstance
        ? rfInstance.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
        : { x: 200, y: 200 };

      const mobileTriggerConfig: Record<string, unknown> = {};
      if (triggerTypeMap[item.label]) mobileTriggerConfig.triggerType = triggerTypeMap[item.label];
      if (item.triggerCategory) mobileTriggerConfig.triggerCategory = item.triggerCategory;

      const newNode: Node<FlowNodeData> = {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: nodeTypeMap[item.nodeCategory] || 'logicNode',
        position,
        data: {
          label: item.label,
          type: item.type,
          config: Object.keys(mobileTriggerConfig).length > 0 ? mobileTriggerConfig : {},
          description: '',
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setShowPalette(false);
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

  // Auto-layout (BFS, horizontal left-to-right)
  const handleAutoLayout = useCallback(() => {
    saveHistory();

    const triggerNodes = nodes.filter((n) => n.data.type === 'trigger');
    const otherNodes = nodes.filter((n) => n.data.type !== 'trigger');

    const xSpacing = 220;   // node width (160) + 60px gap
    const ySpacing = 90;    // vertical gap between branches
    const startX = 60;
    const startY = 200;

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
        x: startX,
        y: startY + i * ySpacing,
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
            const offsetY = (idx - (kids.length - 1) / 2) * ySpacing;
            next.push({
              id: kidId,
              x: item.x + xSpacing,
              y: item.y + offsetY,
            });
          }
        });
      }
      queue = next;
    }

    let orphanY = startY;
    for (const n of otherNodes) {
      if (!positioned.has(n.id)) {
        newPositions[n.id] = { x: startX + 600, y: orphanY };
        orphanY += ySpacing;
      }
    }

    setNodes((nds) =>
      nds.map((n) =>
        newPositions[n.id] ? { ...n, position: newPositions[n.id] } : n
      )
    );

    // Fit view after repositioning so the whole flow is visible
    setTimeout(() => rfInstance?.fitView({ padding: 0.15, duration: 400, minZoom: 1.3, maxZoom: 1.3 }), 50);
  }, [nodes, edges, saveHistory, rfInstance]);

  // ---- Right-click context menu handlers ----
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!rfInstance || !reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const flowPos = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { kind: 'pane', flowX: flowPos.x, flowY: flowPos.y },
      });
    },
    [rfInstance]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<FlowNodeData>) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { kind: 'node', nodeId: node.id, nodeLabel: node.data.label },
      });
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { kind: 'edge', edgeId: edge.id },
      });
    },
    []
  );

  // ---- Double-click on canvas to open palette at click position ----
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!rfInstance || !reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const flowPos = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      paletteDropPosRef.current = flowPos;

      // Position the floating panel near the click, clamped to viewport
      const paletteW = 288;
      const paletteH = window.innerHeight * 0.7;
      const x = Math.min(event.clientX + 8, window.innerWidth - paletteW - 8);
      const y = Math.min(event.clientY + 8, window.innerHeight - paletteH - 8);
      setPaletteScreenPos({ x, y });
      setShowPalette(true);
    },
    [rfInstance]
  );

  // ---- Copy / Paste / Duplicate / Select-all ----
  const handleCopySelected = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length > 0) setClipboard(selected);
  }, [nodes]);

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;
    saveHistory();
    const offset = { x: 40, y: 40 };
    const newNodes = clipboard.map((n) => ({
      ...n,
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      selected: true,
    }));
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  }, [clipboard, saveHistory]);

  const handleDuplicateSelected = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    saveHistory();
    const newNodes = selected.map((n) => ({
      ...n,
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      selected: true,
    }));
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  }, [nodes, saveHistory]);

  const handleDeleteSelected = useCallback(() => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    saveHistory();
    setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)));
    setEdges((eds) => eds.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    setSelectedNode(null);
  }, [nodes, saveHistory]);

  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
  }, []);

  const handleDisconnectNode = useCallback(
    (nodeId: string) => {
      saveHistory();
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [saveHistory]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      saveHistory();
      const newNode = {
        ...node,
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        selected: true,
      };
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), newNode]);
    },
    [nodes, saveHistory]
  );

  // Skip autosave on the very first render (nodes are seeded from DB).
  const didHydrateRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Autosave: 1.5s after any nodes/edges change, persist the flow to DB.
  // Ensures that config tweaks (emoji picker, variable names, etc.) reach
  // the test chat and the real engine without requiring the user to click
  // the main Save button.
  useEffect(() => {
    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [nodes, edges, handleSave]);

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
      // Ctrl+C — copy selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopySelected();
      }
      // Ctrl+V — paste clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      }
      // Ctrl+D — duplicate selected
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
      }
      // Ctrl+A — select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
      // Escape — close menus
      if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedNode(null);
        setShowPalette(false);
        setPaletteScreenPos(null);
      }
    },
    [handleUndo, handleRedo, handleSave, handleCopySelected, handlePaste, handleDuplicateSelected, handleSelectAll]
  );

  // Track zoom
  const onMoveEnd = useCallback((_: unknown, viewport: { zoom: number }) => {
    setZoom(viewport.zoom);
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  const isEmpty = nodes.length === 0;

  return (
    <div className="flex w-full" style={{ height: '100%' }} onKeyDown={onKeyDown} tabIndex={0}>
      {/* Canvas — full width */}
      <div className="flex-1 relative" ref={reactFlowWrapper} style={{ minHeight: 0 }} onDoubleClick={onPaneDoubleClick}>
        {/* Floating toolbar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm border border-slate-200 dark:border-zinc-700 rounded-full px-2 py-1.5 shadow-lg shadow-slate-200/60 dark:shadow-zinc-900/60">
          {/* Add node dropdown button */}
          <div className="relative">
            <button
              onClick={() => { paletteDropPosRef.current = null; setPaletteScreenPos(null); setShowPalette((v) => !v); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${showPalette && !paletteScreenPos ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>
            {/* Toolbar-anchored dropdown (Add button) */}
            {showPalette && !paletteScreenPos && (
              <div className="absolute top-full left-0 mt-2 z-30 w-72 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden flex flex-col" style={{ height: '70vh' }}>
                <NodePalette
                  onClose={() => setShowPalette(false)}
                  onItemSelect={(item) => { handleMobilePaletteSelect(item); setShowPalette(false); }}
                />
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={!canUndo()}
            title="Undo (Ctrl+Z)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>
          {/* Redo */}
          <button
            onClick={handleRedo}
            disabled={!canRedo()}
            title="Redo (Ctrl+Shift+Z)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />

          {/* Auto layout */}
          <button
            onClick={handleAutoLayout}
            title="Auto Layout"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors text-xs font-medium"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Layout</span>
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />

          {/* Zoom display */}
          <span className="px-2 text-xs text-slate-500 dark:text-zinc-400 font-mono tabular-nums w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>

          {/* Divider */}
          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            title="Save (Ctrl+S)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-60 shadow-sm"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? 'Saving…' : 'Save'}</span>
          </button>

          {/* Live indicator */}
          {activeExecutionId && (
            <>
              <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />
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
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-700 flex items-center justify-center mx-auto mb-4">
                <Workflow className="w-8 h-8 text-slate-400 dark:text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-300">Click Add to add your first node</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">or double-click anywhere on the canvas</p>
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
          edgeTypes={edgeTypes}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          selectionMode={SelectionMode.Partial}
          selectionOnDrag={false}
          panOnDrag={true}
          multiSelectionKeyCode="Shift"
          selectionKeyCode="Shift"
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 1.3, maxZoom: 1.3 }}
          deleteKeyCode={['Backspace', 'Delete']}
          snapToGrid
          snapGrid={[20, 20]}
          minZoom={0.2}
          maxZoom={3}
          zoomOnDoubleClick={false}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{ stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5 4', opacity: 0.6 }}
          defaultEdgeOptions={{ type: 'colored' }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls position="bottom-left" className="shadow-lg border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden" />
          {!isMobile && (
            <MiniMap
              position="bottom-right"
              nodeColor={(n) => {
                const t = (n.data as { type?: string })?.type ?? '';
                const m: Record<string, string> = {
                  trigger: '#15803d',
                  'send-message': '#3f3f46', 'send-image': '#3f3f46', 'send-file': '#3f3f46',
                  'send-audio': '#3f3f46', 'send-video': '#3f3f46', 'send-location': '#3f3f46',
                  'send-contact': '#3f3f46', 'send-sticker': '#3f3f46', 'send-list': '#3f3f46',
                  'send-poll': '#3f3f46', 'send-buttons': '#3f3f46',
                  'send-reaction': '#5b21b6', 'forward-message': '#5b21b6', 'mark-as-read': '#5b21b6',
                  'typing-indicator': '#5b21b6', 'assign-label': '#5b21b6', 'remove-label': '#5b21b6',
                  'add-to-group': '#5b21b6', 'remove-from-group': '#5b21b6',
                  'block-contact': '#5b21b6', 'unblock-contact': '#5b21b6',
                  condition: '#c2410c', delay: '#c2410c', 'set-variable': '#c2410c',
                  'http-request': '#c2410c',
                  'go-to-flow': '#c2410c', 'wait-for-reply': '#c2410c',
                  'ai-response': '#0c4a6e', 'ai-agent': '#0c4a6e', 'ai-classifier': '#0c4a6e',
                  'ai-extractor': '#0c4a6e', 'ai-summarizer': '#0c4a6e', 'ai-sentiment': '#0c4a6e',
                  'ai-translator': '#0c4a6e', 'ai-vision': '#0c4a6e',
                  'llm-claude': '#312e81', 'llm-openai': '#312e81', 'llm-gemini': '#312e81', 'llm-ollama': '#312e81',
                  'memory-buffer': '#0f766e', 'memory-vector': '#0f766e', 'memory-window': '#0f766e',
                  'tool-code': '#92400e', 'tool-http': '#92400e',
                  'tool-search': '#92400e', 'tool-mcp': '#92400e',
                  'wppconnect-all': '#064e3b',
                  end: '#18181b',
                };
                return m[t] || '#52525b';
              }}
              nodeStrokeWidth={0}
              style={{
                backgroundColor: '#0f172a',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
              maskColor="rgba(0,0,0,0.55)"
            />
          )}
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={isDark ? '#3f3f46' : '#d4d4d8'}
          />
        </ReactFlow>
        </ExecutionContext.Provider>

        {/* Floating palette (double-click / right-click "Add here") */}
        {showPalette && paletteScreenPos && (
          <div
            className="fixed z-50 w-72 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden flex flex-col"
            style={{ left: paletteScreenPos.x, top: paletteScreenPos.y, height: '70vh' }}
          >
            <NodePalette
              onClose={() => { setShowPalette(false); setPaletteScreenPos(null); }}
              onItemSelect={(item) => { handleMobilePaletteSelect(item); setShowPalette(false); setPaletteScreenPos(null); }}
            />
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <CanvasContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            target={contextMenu.target}
            canPaste={clipboard.length > 0}
            onClose={() => setContextMenu(null)}
            actions={{
              // pane actions
              onAddNodeHere: contextMenu.target.kind === 'pane'
                ? () => {
                    const { flowX, flowY } = contextMenu.target as { flowX: number; flowY: number };
                    paletteDropPosRef.current = { x: flowX, y: flowY };
                    const paletteW = 288;
                    const paletteH = window.innerHeight * 0.7;
                    const x = Math.min(contextMenu.x + 8, window.innerWidth - paletteW - 8);
                    const y = Math.min(contextMenu.y + 8, window.innerHeight - paletteH - 8);
                    setPaletteScreenPos({ x, y });
                    setContextMenu(null);
                    setShowPalette(true);
                  }
                : undefined,
              onPaste: handlePaste,
              onSelectAll: handleSelectAll,
              onAutoLayout: handleAutoLayout,
              onFitView: () => rfInstance?.fitView({ padding: 0.15, duration: 400, minZoom: 1.3, maxZoom: 1.3 }),
              // node actions
              onDuplicate: contextMenu.target.kind === 'node'
                ? () => handleDuplicateNode((contextMenu.target as { nodeId: string }).nodeId)
                : undefined,
              onCopyNode: () => handleCopySelected(),
              onDeleteNode: contextMenu.target.kind === 'node'
                ? () => {
                    const nodeId = (contextMenu.target as { nodeId: string }).nodeId;
                    saveHistory();
                    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
                    if (selectedNode?.id === nodeId) setSelectedNode(null);
                  }
                : undefined,
              onDisconnect: contextMenu.target.kind === 'node'
                ? () => handleDisconnectNode((contextMenu.target as { nodeId: string }).nodeId)
                : undefined,
              // edge actions
              onDeleteEdge: contextMenu.target.kind === 'edge'
                ? () => {
                    const edgeId = (contextMenu.target as { edgeId: string }).edgeId;
                    saveHistory();
                    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
                  }
                : undefined,
            }}
          />
        )}

        {/* Mobile floating "+" button to open palette */}
        {isMobile && (
          <button
            onClick={() => setShowPalette(true)}
            className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-200 flex items-center justify-center hover:bg-emerald-600 active:scale-95 transition-all"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {/* Mobile palette overlay */}
        {isMobile && showPalette && (
          <NodePalette
            mode="overlay"
            onClose={() => setShowPalette(false)}
            onItemSelect={handleMobilePaletteSelect}
          />
        )}

        {/* Mobile config panel overlay */}
        {isMobile && showMobileConfig && selectedNode && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-800 overflow-y-auto">
            <NodeConfigPanel
              key={selectedNode.id}
              node={selectedNode}
              sessionId={sessionId}
              currentFlowId={flowId}
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
          key={selectedNode.id}
          node={selectedNode}
          sessionId={sessionId}
          currentFlowId={flowId}
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
