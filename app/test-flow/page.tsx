'use client';

import { useCallback, useState } from 'react';
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
  ReactFlowProvider,
  Background,
  Controls,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

function CustomNode({ data, selected }: NodeProps) {
  return (
    <div
      style={{
        width: 200,
        padding: '12px 16px',
        backgroundColor: 'white',
        borderRadius: 8,
        border: selected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ width: 12, height: 12, background: '#22c55e', border: '2px solid white' }}
      />
      <div style={{ fontWeight: 600, fontSize: 14 }}>{data.label}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{data.subtitle}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ width: 12, height: 12, background: '#22c55e', border: '2px solid white' }}
      />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

const initialNodes: Node[] = [
  { id: '1', type: 'custom', position: { x: 250, y: 50 }, data: { label: 'Trigger', subtitle: 'Message received' } },
  { id: '2', type: 'custom', position: { x: 250, y: 200 }, data: { label: 'Send Text', subtitle: 'Hello world' } },
  { id: '3', type: 'custom', position: { x: 250, y: 350 }, data: { label: 'Condition', subtitle: 'If contains "help"' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
];

function FlowTest() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default function TestFlowPage() {
  return (
    <ReactFlowProvider>
      <FlowTest />
    </ReactFlowProvider>
  );
}
