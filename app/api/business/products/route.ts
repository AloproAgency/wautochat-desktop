import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { Product } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM products WHERE session_id = ? ORDER BY name ASC`
    ).all(sessionId) as Record<string, unknown>[];

    const products: Product[] = rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      price: row.price as number,
      currency: row.currency as string,
      imageUrl: (row.image_url as string) || undefined,
      isVisible: !!(row.is_visible),
      url: (row.url as string) || undefined,
    }));

    return Response.json({ success: true, data: products });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list products' },
      { status: 500 }
    );
  }
}

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

    const db = getDb();

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO products (id, session_id, name, description, price, currency, image_url, is_visible, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      sessionId,
      name,
      description || null,
      price || 0,
      currency || 'EUR',
      imageUrl || null,
      isVisible !== false ? 1 : 0,
      url || null
    );

    const product: Product = {
      id,
      sessionId,
      name,
      description,
      price: price || 0,
      currency: currency || 'EUR',
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
