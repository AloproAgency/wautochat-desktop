import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';

export async function GET() {
  try {
    // Trigger auto-reconnect on first access
    await manager.autoReconnect();
    let sessions = manager.getAllSessions();

    // Backfill the phone number for connected sessions where we never captured
    // it (e.g. session predates the refresh logic, or initial fetch failed).
    // We do this in parallel and with a short ceiling so the API stays snappy.
    const missing = sessions.filter((s) => s.status === 'connected' && !s.phone);
    if (missing.length > 0) {
      await Promise.allSettled(
        missing.map((s) =>
          Promise.race([
            manager.refreshHostPhone(s.id),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ])
        )
      );
      // Re-read sessions after the DB updates land
      sessions = manager.getAllSessions();
    }

    return Response.json({ success: true, data: sessions });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, deviceName, phoneNumber } = body;

    if (!name) {
      return Response.json(
        { success: false, error: 'Session name is required' },
        { status: 400 }
      );
    }

    const sessionId = uuidv4();
    await manager.createSession(sessionId, name, deviceName, phoneNumber);

    const session = manager.getSession(sessionId);
    return Response.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
