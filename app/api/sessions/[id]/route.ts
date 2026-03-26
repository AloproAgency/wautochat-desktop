import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = manager.getSession(id);

    if (!session) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return Response.json({ success: true, data: session });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get session' },
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
    const session = manager.getSession(id);

    if (!session) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = (body as Record<string, unknown>).action as string;

    if (action === 'disconnect') {
      await manager.disconnectSession(id);
    } else {
      // Default action: connect (non-blocking, starts in background)
      await manager.connectSession(id);
    }

    const updated = manager.getSession(id);
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update session' },
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
    const session = manager.getSession(id);

    if (!session) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    await manager.deleteSession(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete session' },
      { status: 500 }
    );
  }
}
