import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import type { Flow } from '@/lib/types';
import FlowEditorClient from './flow-editor-client';

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM flows WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    notFound();
  }

  const flow: Flow = {
    id: row.id as string,
    sessionId: row.session_id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    isActive: Boolean(row.is_active),
    trigger: JSON.parse((row.trigger_config as string) || '{}'),
    nodes: JSON.parse((row.nodes as string) || '[]'),
    edges: JSON.parse((row.edges as string) || '[]'),
    variables: JSON.parse((row.variables as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };

  return <FlowEditorClient flow={flow} />;
}
