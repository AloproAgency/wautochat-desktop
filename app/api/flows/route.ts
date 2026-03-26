import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { Flow } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    const db = getDb();
    let rows: Record<string, unknown>[];

    if (sessionId) {
      rows = db.prepare(
        `SELECT * FROM flows WHERE session_id = ? ORDER BY updated_at DESC`
      ).all(sessionId) as Record<string, unknown>[];
    } else {
      rows = db.prepare(
        `SELECT * FROM flows ORDER BY updated_at DESC`
      ).all() as Record<string, unknown>[];
    }

    const flows: Flow[] = rows.map((row) => ({
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
    }));

    return Response.json({ success: true, data: flows });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list flows' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, name, description, trigger, nodes, edges, variables } = body;

    if (!sessionId || !name) {
      return Response.json(
        { success: false, error: 'sessionId and name are required' },
        { status: 400 }
      );
    }

    const db = getDb();

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO flows (id, session_id, name, description, is_active, trigger_config, nodes, edges, variables, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      id,
      sessionId,
      name,
      description || null,
      JSON.stringify(trigger || { type: 'message_received', config: {} }),
      JSON.stringify(nodes || []),
      JSON.stringify(edges || []),
      JSON.stringify(variables || {})
    );

    const flow: Flow = {
      id,
      sessionId,
      name,
      description,
      isActive: false,
      trigger: trigger || { type: 'message_received', config: {} },
      nodes: nodes || [],
      edges: edges || [],
      variables: variables || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return Response.json({ success: true, data: flow }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create flow' },
      { status: 500 }
    );
  }
}
