import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Flow } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const row = db.prepare(`SELECT * FROM flows WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return Response.json(
        { success: false, error: 'Flow not found' },
        { status: 404 }
      );
    }

    const flow: Flow = {
      id: row.id as string,
      sessionId: row.session_id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      isActive: !!(row.is_active),
      trigger: JSON.parse((row.trigger_config as string) || '{}'),
      nodes: JSON.parse((row.nodes as string) || '[]'),
      edges: JSON.parse((row.edges as string) || '[]'),
      variables: JSON.parse((row.variables as string) || '{}'),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };

    return Response.json({ success: true, data: flow });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get flow' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const existing = db.prepare(`SELECT * FROM flows WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      return Response.json(
        { success: false, error: 'Flow not found' },
        { status: 404 }
      );
    }

    const {
      name,
      description,
      isActive,
      trigger,
      nodes,
      edges,
      variables,
    } = body;

    db.prepare(
      `UPDATE flows SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        is_active = COALESCE(?, is_active),
        trigger_config = COALESCE(?, trigger_config),
        nodes = COALESCE(?, nodes),
        edges = COALESCE(?, edges),
        variables = COALESCE(?, variables),
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      name || null,
      description !== undefined ? description : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      trigger ? JSON.stringify(trigger) : null,
      nodes ? JSON.stringify(nodes) : null,
      edges ? JSON.stringify(edges) : null,
      variables ? JSON.stringify(variables) : null,
      id
    );

    const updated = db.prepare(`SELECT * FROM flows WHERE id = ?`).get(id) as Record<string, unknown>;
    const flow: Flow = {
      id: updated.id as string,
      sessionId: updated.session_id as string,
      name: updated.name as string,
      description: (updated.description as string) || undefined,
      isActive: !!(updated.is_active),
      trigger: JSON.parse((updated.trigger_config as string) || '{}'),
      nodes: JSON.parse((updated.nodes as string) || '[]'),
      edges: JSON.parse((updated.edges as string) || '[]'),
      variables: JSON.parse((updated.variables as string) || '{}'),
      createdAt: updated.created_at as string,
      updatedAt: updated.updated_at as string,
    };

    return Response.json({ success: true, data: flow });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update flow' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare(`SELECT id FROM flows WHERE id = ?`).get(id);
    if (!existing) {
      return Response.json(
        { success: false, error: 'Flow not found' },
        { status: 404 }
      );
    }

    db.prepare(`DELETE FROM flows WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete flow' },
      { status: 500 }
    );
  }
}
