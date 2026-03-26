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
