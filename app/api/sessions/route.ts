import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';

export async function GET() {
  try {
    // Trigger auto-reconnect on first access
    manager.autoReconnect();
    const sessions = manager.getAllSessions();
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
    const { name, deviceName } = body;

    if (!name) {
      return Response.json(
        { success: false, error: 'Session name is required' },
        { status: 400 }
      );
    }

    const sessionId = uuidv4();
    await manager.createSession(sessionId, name, deviceName);

    const session = manager.getSession(sessionId);
    return Response.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
