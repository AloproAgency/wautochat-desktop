import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';
import type { Group } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM groups_table WHERE session_id = ? ORDER BY name ASC`
    ).all(sessionId) as Record<string, unknown>[];

    const groups: Group[] = rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      wppId: row.wpp_id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      profilePicUrl: (row.profile_pic_url as string) || undefined,
      participantCount: row.participant_count as number,
      admins: JSON.parse((row.admins as string) || '[]'),
      isAdmin: !!(row.is_admin),
      inviteLink: (row.invite_link as string) || undefined,
      createdAt: row.created_at as string,
    }));

    return Response.json({ success: true, data: groups });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list groups' },
      { status: 500 }
    );
  }
}

// PUT: Sync all groups from WhatsApp
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    let client = manager.getClient(sessionId);
    if (!client) {
      try {
        await manager.reconnectSession(sessionId);
        client = manager.getClient(sessionId);
      } catch { /* ignore */ }
    }
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    const db = getDb();
    const wppChats = await client.getAllChats();
    const groupChats = (wppChats as unknown as Record<string, unknown>[]).filter((c) => !!(c.isGroup));

    let synced = 0;

    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO groups_table (id, session_id, wpp_id, name, description, profile_pic_url, participant_count, admins, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 0, datetime('now'))`
    );
    const updateStmt = db.prepare(
      `UPDATE groups_table SET name = ?, participant_count = ? WHERE session_id = ? AND wpp_id = ?`
    );

    const transaction = db.transaction(() => {
      for (const chat of groupChats) {
        const c = chat as Record<string, unknown>;
        const wppId = (c.id as Record<string, unknown>)?._serialized as string || (c.id as string) || '';
        if (!wppId) continue;

        const name = (c.contact as Record<string, unknown>)?.name as string
          || (c.name as string)
          || wppId;
        const participantCount = (c.groupMetadata as Record<string, unknown>)?.participants
          ? ((c.groupMetadata as Record<string, unknown>).participants as unknown[]).length
          : 0;
        const description = (c.groupMetadata as Record<string, unknown>)?.desc as string || '';

        const result = insertStmt.run(uuidv4(), sessionId, wppId, name, description || null, null, participantCount);
        if (result.changes === 0) {
          updateStmt.run(name, participantCount, sessionId, wppId);
        }
        synced++;
      }
    });

    transaction();

    return Response.json({
      success: true,
      data: { synced, message: `${synced} groups synced` },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync groups' },
      { status: 500 }
    );
  }
}

// POST: Create a new group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, name, participants } = body;

    if (!sessionId || !name) {
      return Response.json(
        { success: false, error: 'sessionId and name are required' },
        { status: 400 }
      );
    }

    const client = manager.getClient(sessionId);
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    const participantList = participants || [];
    const result = await client.createGroup(name, participantList);
    const resultData = result as Record<string, unknown>;
    const gid = (resultData.gid as Record<string, unknown>)?._serialized as string
      || (resultData.id as string) || '';

    const db = getDb();
    const groupId = uuidv4();

    db.prepare(
      `INSERT INTO groups_table (id, session_id, wpp_id, name, participant_count, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`
    ).run(groupId, sessionId, gid, name, participantList.length + 1);

    // Also create a chat entry for the group
    db.prepare(
      `INSERT OR IGNORE INTO chats (id, session_id, wpp_id, name, is_group, updated_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`
    ).run(uuidv4(), sessionId, gid, name);

    const group: Group = {
      id: groupId,
      sessionId,
      wppId: gid,
      name,
      participantCount: participantList.length + 1,
      admins: [],
      isAdmin: true,
      createdAt: new Date().toISOString(),
    };

    return Response.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create group' },
      { status: 500 }
    );
  }
}
