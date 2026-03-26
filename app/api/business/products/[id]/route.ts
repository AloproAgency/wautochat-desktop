import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Product } from '@/lib/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const existing = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      return Response.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    const { name, description, price, currency, imageUrl, isVisible, url } = body;

    db.prepare(
      `UPDATE products SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        currency = COALESCE(?, currency),
        image_url = COALESCE(?, image_url),
        is_visible = COALESCE(?, is_visible),
        url = COALESCE(?, url)
       WHERE id = ?`
    ).run(
      name || null,
      description !== undefined ? description : null,
      price !== undefined ? price : null,
      currency || null,
      imageUrl !== undefined ? imageUrl : null,
      isVisible !== undefined ? (isVisible ? 1 : 0) : null,
      url !== undefined ? url : null,
      id
    );

    const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Record<string, unknown>;
    const product: Product = {
      id: updated.id as string,
      sessionId: updated.session_id as string,
      name: updated.name as string,
      description: (updated.description as string) || undefined,
      price: updated.price as number,
      currency: updated.currency as string,
      imageUrl: (updated.image_url as string) || undefined,
      isVisible: !!(updated.is_visible),
      url: (updated.url as string) || undefined,
    };

    return Response.json({ success: true, data: product });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update product' },
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

    const existing = db.prepare(`SELECT id FROM products WHERE id = ?`).get(id);
    if (!existing) {
      return Response.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Remove product from any collections
    const collections = db.prepare(`SELECT id, product_ids FROM collections`).all() as { id: string; product_ids: string }[];
    for (const collection of collections) {
      const productIds: string[] = JSON.parse(collection.product_ids || '[]');
      const idx = productIds.indexOf(id);
      if (idx !== -1) {
        productIds.splice(idx, 1);
        db.prepare(`UPDATE collections SET product_ids = ? WHERE id = ?`).run(
          JSON.stringify(productIds),
          collection.id
        );
      }
    }

    db.prepare(`DELETE FROM products WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete product' },
      { status: 500 }
    );
  }
}
