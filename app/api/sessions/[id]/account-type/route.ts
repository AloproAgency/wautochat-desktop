import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

/**
 * Detect whether the connected WhatsApp account is Business or Personal.
 * Catalog/Products are gated to Business accounts on WhatsApp's side, so
 * the UI uses this to show an explanatory popup instead of letting the user
 * fight failing API calls.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const client = manager.getClient(sessionId);
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
    if (!page) {
      return Response.json({ success: true, data: { isBusiness: false, knownByServer: false } });
    }

    // Store.User / Store.Conn aren't always populated immediately after a
    // fresh connect. Retry up to 5 times with backoff so we don't return a
    // false negative ("Personal account") to the UI.
    let info: { isBusiness: boolean; source: string; ready: boolean } = { isBusiness: false, source: '', ready: false };
    for (let attempt = 0; attempt < 5; attempt++) {
      info = (await page.evaluate(`
        (async () => {
          try {
            let isBusiness = false;
            let source = '';
            let ready = false;

            try {
              if (window.Store && window.Store.Conn && typeof window.Store.Conn.isBusiness !== 'undefined') {
                isBusiness = !!window.Store.Conn.isBusiness;
                source = 'Store.Conn';
                ready = true;
              }
            } catch(e) {}

            if (!ready && window.Store && window.Store.User && typeof window.Store.User.getMaybeMeUser === 'function') {
              try {
                const me = window.Store.User.getMaybeMeUser();
                if (me) {
                  isBusiness = !!(me.isBusiness || me.__x_isBusiness);
                  source = source || 'Store.User';
                  ready = true;
                }
              } catch(e) {}
            }

            return { isBusiness, source, ready };
          } catch (e) {
            return { isBusiness: false, source: 'error', ready: false };
          }
        })()
      `)) as { isBusiness: boolean; source: string; ready: boolean };
      if (info.ready) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    return Response.json({
      success: true,
      data: {
        isBusiness: !!info?.isBusiness,
        knownByServer: !!info?.ready,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to detect account type' },
      { status: 500 }
    );
  }
}
