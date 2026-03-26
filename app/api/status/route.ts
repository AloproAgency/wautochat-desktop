import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();

    const totalSessions = (db.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number }).count;
    const activeSessions = (db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE status = 'connected'`).get() as { count: number }).count;
    const totalContacts = (db.prepare(`SELECT COUNT(*) as count FROM contacts`).get() as { count: number }).count;
    const totalMessages = (db.prepare(`SELECT COUNT(*) as count FROM messages`).get() as { count: number }).count;
    const totalFlows = (db.prepare(`SELECT COUNT(*) as count FROM flows`).get() as { count: number }).count;
    const activeFlows = (db.prepare(`SELECT COUNT(*) as count FROM flows WHERE is_active = 1`).get() as { count: number }).count;
    const totalGroups = (db.prepare(`SELECT COUNT(*) as count FROM groups_table`).get() as { count: number }).count;
    const messagesLast24h = (db.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE timestamp >= datetime('now', '-1 day')`
    ).get() as { count: number }).count;

    const stats: DashboardStats = {
      totalSessions,
      activeSessions,
      totalContacts,
      totalMessages,
      totalFlows,
      activeFlows,
      totalGroups,
      messagesLast24h,
    };

    return Response.json({ success: true, data: stats });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, type, content, caption } = body;

    if (!sessionId || !type || !content) {
      return Response.json(
        { success: false, error: 'sessionId, type, and content are required' },
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

    let result: unknown;

    switch (type) {
      case 'text': {
        result = await client.sendText('status@broadcast', content);
        break;
      }
      case 'image': {
        result = await client.sendImage('status@broadcast', content, 'status', caption || '');
        break;
      }
      case 'video': {
        result = await client.sendFile('status@broadcast', content, 'status', caption || '');
        break;
      }
      default:
        return Response.json(
          { success: false, error: `Unsupported status type: ${type}` },
          { status: 400 }
        );
    }

    return Response.json({
      success: true,
      data: { sent: true, result },
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send status' },
      { status: 500 }
    );
  }
}
