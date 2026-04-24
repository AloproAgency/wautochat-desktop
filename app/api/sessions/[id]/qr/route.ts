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

    const qrCode = manager.getQrCode(id);
    const pairCode = manager.getPairCode(id);

    if (!qrCode && !pairCode) {
      return Response.json({
        success: true,
        data: {
          qrCode: null,
          pairCode: null,
          status: session.status,
          message:
            session.status === 'connected'
              ? 'Session is already connected'
              : 'QR code not yet available. Session status: ' + session.status,
        },
      });
    }

    return Response.json({
      success: true,
      data: {
        qrCode,
        pairCode,
        status: session.status,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get QR code' },
      { status: 500 }
    );
  }
}
