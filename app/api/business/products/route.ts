import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';
import type { Product } from '@/lib/types';

// Helper to get waPage from client
function getPage(sessionId: string) {
  const client = manager.getClient(sessionId);
  if (!client) return null;
  return (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage || null;
}

// GET: Fetch products from WhatsApp catalog, with local DB cache fallback
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const page = getPage(sessionId);
    if (!page) {
      return Response.json({ success: true, data: [] });
    }

    const result = await page.evaluate(`
      (async () => {
        try {
          if (typeof WPP === 'undefined' || !WPP.catalog) return [];

          const catalog = await WPP.catalog.getMyCatalog();
          if (!catalog) return [];

          let productModels = [];
          if (catalog.productCollection) {
            productModels = catalog.productCollection.getModelsArray
              ? catalog.productCollection.getModelsArray()
              : (catalog.productCollection._models || []);
          }
          if (productModels.length === 0 && catalog.__x__products) {
            productModels = Array.isArray(catalog.__x__products)
              ? catalog.__x__products
              : (catalog.__x__products._models || []);
          }

          return productModels.map(p => {
            let imageUrl = '';
            if (p.imageUrl) imageUrl = p.imageUrl;
            else if (p.imageCdnUrl) imageUrl = p.imageCdnUrl;
            else if (p.additionalImageCdnUrl && p.additionalImageCdnUrl.length > 0) imageUrl = p.additionalImageCdnUrl[0];

            const priceRaw = p.priceAmount1000 || p.price || 0;
            const salePriceRaw = p.salePriceAmount1000 || p.salePrice || 0;
            const curr = p.currency || 'XOF';
            const noDecimal = ['XOF','XAF','GNF','JPY','KRW','VND'].includes(curr);
            const price = typeof priceRaw === 'number'
              ? (noDecimal ? priceRaw / 1000 : priceRaw / 1000)
              : 0;
            const salePrice = typeof salePriceRaw === 'number' && salePriceRaw > 0
              ? (noDecimal ? salePriceRaw / 1000 : salePriceRaw / 1000)
              : 0;

            return {
              id: p.id || p.retailerId || '',
              name: p.name || '',
              description: p.description || '',
              price: price,
              salePrice: salePrice > 0 ? salePrice : undefined,
              currency: curr,
              imageUrl: imageUrl,
              url: p.url || p.retailerUrl || '',
              isVisible: p.availability !== 'out of stock',
            };
          });
        } catch(e) {
          return [];
        }
      })()
    `) as Record<string, unknown>[];

    const products: Product[] = (result || []).map((p) => ({
      id: p.id as string,
      sessionId,
      name: p.name as string,
      description: (p.description as string) || undefined,
      price: p.price as number,
      salePrice: (p.salePrice as number) || undefined,
      currency: p.currency as string,
      imageUrl: (p.imageUrl as string) || undefined,
      isVisible: (p.isVisible as boolean) !== false,
      url: (p.url as string) || undefined,
    }));

    return Response.json({ success: true, data: products });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list products' },
      { status: 500 }
    );
  }
}

// POST: Create product directly on WhatsApp catalog
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, name, description, price, currency, imageUrl, isVisible, url } = body;

    if (!sessionId || !name) {
      return Response.json(
        { success: false, error: 'sessionId and name are required' },
        { status: 400 }
      );
    }

    const page = getPage(sessionId);
    if (!page) {
      // Wait for connection
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const p = getPage(sessionId);
        if (p) break;
      }
    }

    const activePage = getPage(sessionId);
    if (!activePage) {
      return Response.json(
        { success: false, error: 'Session is not connected. Please wait and try again.' },
        { status: 400 }
      );
    }

    const curr = currency || 'XOF';
    const noDecimal = ['XOF', 'XAF', 'GNF', 'JPY', 'KRW', 'VND'].includes(curr);
    const priceAmount1000 = noDecimal
      ? Math.round(price || 0)
      : Math.round((price || 0) * 1000);

    console.log(`[products] Creating "${name}" on WhatsApp: price=${price}, priceAmount1000=${priceAmount1000}, currency=${curr}`);

    const result = await activePage.evaluate(`
      (async () => {
        try {
          if (typeof WPP === 'undefined' || !WPP.catalog || !WPP.catalog.createProduct) {
            return { success: false, error: 'WPP.catalog.createProduct not available' };
          }
          const product = await WPP.catalog.createProduct({
            name: ${JSON.stringify(name)},
            description: ${JSON.stringify(description || '')},
            priceAmount1000: ${priceAmount1000},
            currency: ${JSON.stringify(curr)},
            url: ${JSON.stringify(url || '')},
            isHidden: ${isVisible === false},
            ${imageUrl ? `image: ${JSON.stringify(imageUrl)},` : ''}
          });
          if (product) {
            return { success: true, id: product.id || '' };
          }
          return { success: false, error: 'No product returned' };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })()
    `) as { success: boolean; id?: string; error?: string };

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error || 'Failed to create product on WhatsApp' },
        { status: 500 }
      );
    }

    console.log(`[products] Created "${name}" on WhatsApp: ${result.id}`);

    const product: Product = {
      id: result.id || '',
      sessionId,
      name,
      description,
      price: price || 0,
      currency: curr,
      imageUrl,
      isVisible: isVisible !== false,
      url,
    };

    return Response.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create product' },
      { status: 500 }
    );
  }
}
