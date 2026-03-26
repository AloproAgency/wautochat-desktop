import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';
import type { Group, GroupParticipant } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const row = db.prepare(`SELECT * FROM groups_table WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return Response.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    const group: Group = {
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
    };

    // Try to get members from wppconnect
    let members: GroupParticipant[] = [];
    const client = manager.getClient(row.session_id as string);
    if (client) {
      try {
        const wppMembers = await client.getGroupMembers(row.wpp_id as string);
        members = (wppMembers as unknown as Record<string, unknown>[]).map((m) => {
          const memberId = (m.id as Record<string, unknown>)?._serialized as string || (m.id as string) || '';
          return {
            id: memberId,
            name: (m.name as string) || (m.pushname as string) || memberId,
            phone: memberId.replace('@c.us', ''),
            isAdmin: !!(m.isAdmin),
            isSuperAdmin: !!(m.isSuperAdmin),
            profilePicUrl: (m.profilePicThumbObj as Record<string, unknown>)?.eurl as string || undefined,
          };
        });
      } catch {
        // Could not fetch live members
      }
    }

    return Response.json({ success: true, data: { ...group, members } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get group' },
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

    const row = db.prepare(`SELECT * FROM groups_table WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return Response.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    const client = manager.getClient(row.session_id as string);
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    const wppId = row.wpp_id as string;
    const { name, description, icon, addParticipants, removeParticipants } = body;

    if (name) {
      await client.setGroupSubject(wppId, name);
      db.prepare(`UPDATE groups_table SET name = ? WHERE id = ?`).run(name, id);
    }

    if (description !== undefined) {
      await client.setGroupDescription(wppId, description);
      db.prepare(`UPDATE groups_table SET description = ? WHERE id = ?`).run(description, id);
    }

    if (icon) {
      await client.setGroupIcon(wppId, icon);
      db.prepare(`UPDATE groups_table SET profile_pic_url = ? WHERE id = ?`).run(icon, id);
    }

    if (addParticipants && Array.isArray(addParticipants)) {
      for (const participant of addParticipants) {
        await client.addParticipant(wppId, participant);
      }
    }

    if (removeParticipants && Array.isArray(removeParticipants)) {
      for (const participant of removeParticipants) {
        await client.removeParticipant(wppId, participant);
      }
    }

    // Refresh participant count
    try {
      const members = await client.getGroupMembers(wppId);
      db.prepare(`UPDATE groups_table SET participant_count = ? WHERE id = ?`).run(
        members.length,
        id
      );
    } catch {
      // Ignore
    }

    const updated = db.prepare(`SELECT * FROM groups_table WHERE id = ?`).get(id) as Record<string, unknown>;
    const group: Group = {
      id: updated.id as string,
      sessionId: updated.session_id as string,
      wppId: updated.wpp_id as string,
      name: updated.name as string,
      description: (updated.description as string) || undefined,
      profilePicUrl: (updated.profile_pic_url as string) || undefined,
      participantCount: updated.participant_count as number,
      admins: JSON.parse((updated.admins as string) || '[]'),
      isAdmin: !!(updated.is_admin),
      inviteLink: (updated.invite_link as string) || undefined,
      createdAt: updated.created_at as string,
    };

    return Response.json({ success: true, data: group });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update group' },
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

    const row = db.prepare(`SELECT * FROM groups_table WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return Response.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    const client = manager.getClient(row.session_id as string);
    if (client) {
      try {
        await client.leaveGroup(row.wpp_id as string);
      } catch {
        // May already have left
      }
    }

    db.prepare(`DELETE FROM groups_table WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to leave group' },
      { status: 500 }
    );
  }
}
