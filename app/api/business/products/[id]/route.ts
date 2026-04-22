import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

function getPage(sessionId: string) {
  const client = manager.getClient(sessionId);
  if (!client) return null;
  return (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage || null;
}

// PUT: Edit product directly on WhatsApp
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { sessionId, name, description, price, currency, isVisible, url } = body;

    if (!sessionId) {
      return Response.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }

    const page = getPage(sessionId);
    if (!page) {
      return Response.json({ success: false, error: 'Session is not connected' }, { status: 400 });
    }

    const curr = currency || 'XOF';
    const noDecimal = ['XOF', 'XAF', 'GNF', 'JPY', 'KRW', 'VND'].includes(curr);
    const priceAmount1000 = price !== undefined
      ? (noDecimal ? Math.round(price) : Math.round(price * 1000))
      : undefined;

    const result = await page.evaluate(`
      (async () => {
        try {
          if (typeof WPP === 'undefined' || !WPP.catalog || !WPP.catalog.editProduct) {
            return { success: false, error: 'WPP.catalog.editProduct not available' };
          }
          await WPP.catalog.editProduct(${JSON.stringify(id)}, {
            ${name ? `name: ${JSON.stringify(name)},` : ''}
            ${description !== undefined ? `description: ${JSON.stringify(description)},` : ''}
            ${priceAmount1000 !== undefined ? `priceAmount1000: ${priceAmount1000},` : ''}
            ${currency ? `currency: ${JSON.stringify(currency)},` : ''}
            ${url !== undefined ? `url: ${JSON.stringify(url)},` : ''}
            ${isVisible !== undefined ? `isHidden: ${!isVisible},` : ''}
          });
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `) as { success: boolean; error?: string };

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error || 'Failed to update product' },
        { status: 500 }
      );
    }

    return Response.json({ success: true, data: { id, updated: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update product' },
      { status: 500 }
    );
  }
}

// DELETE: Delete product from WhatsApp catalog
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      // Try to get from body
      try {
        const body = await request.json();
        if (body.sessionId) {
          const page = getPage(body.sessionId);
          if (page) {
            await page.evaluate(`
              (async () => {
                try {
                  if (WPP.catalog && WPP.catalog.delProducts) {
                    await WPP.catalog.delProducts([${JSON.stringify(id)}]);
                  }
                } catch(e) {}
              })()
            `);
          }
          return Response.json({ success: true, data: { deleted: true } });
        }
      } catch { /* ignore */ }
      return Response.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }

    const page = getPage(sessionId);
    if (!page) {
      return Response.json({ success: false, error: 'Session is not connected' }, { status: 400 });
    }

    const result = await page.evaluate(`
      (async () => {
        try {
          if (typeof WPP === 'undefined' || !WPP.catalog || !WPP.catalog.delProducts) {
            return { success: false, error: 'WPP.catalog.delProducts not available' };
          }
          await WPP.catalog.delProducts([${JSON.stringify(id)}]);
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `) as { success: boolean; error?: string };

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error || 'Failed to delete product' },
        { status: 500 }
      );
    }

    console.log(`[products] Deleted product ${id} from WhatsApp`);
    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete product' },
      { status: 500 }
    );
  }
}
