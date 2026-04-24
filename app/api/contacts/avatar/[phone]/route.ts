import { NextRequest } from 'next/server';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';

const CACHE_DIR = path.join(process.cwd(), 'data', 'avatars');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh once a day

/**
 * Serve a contact's profile picture through a stable URL.
 *
 * Why this exists: WhatsApp returns profile picture URLs (`pps.whatsapp.net/...?oh=...&oe=...`)
 * with a short-lived OAuth token. After ~24h the browser gets a 403 and the
 * avatar disappears. We proxy + cache on disk so the frontend can use
 * `/api/contacts/avatar/<phone>` as a permanent URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return new Response('invalid phone', { status: 400 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId') || '';
  const cacheFile = path.join(CACHE_DIR, `${digits}.jpg`);

  // 1. Serve cached file if fresh
  try {
    const s = await stat(cacheFile);
    if (Date.now() - s.mtimeMs < CACHE_TTL_MS) {
      const buf = await readFile(cacheFile);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
  } catch {
    // not cached yet or stale; fall through to refresh
  }

  // 2. Refresh from WhatsApp — try the configured session first, then any connected session
  const wppId = `${digits}@c.us`;
  let picUrl = '';

  try {
    let client = sessionId ? manager.getClient(sessionId) : null;
    if (!client) {
      // Fall back to any connected session (useful if the query doesn't pass sessionId)
      const db = getDb();
      const rows = db
        .prepare(`SELECT id FROM sessions WHERE status = 'connected' ORDER BY updated_at DESC`)
        .all() as { id: string }[];
      for (const r of rows) {
        const c = manager.getClient(r.id);
        if (c) {
          client = c;
          break;
        }
      }
    }

    if (client) {
      const pic = await client.getProfilePicFromServer(wppId).catch(() => null);
      const picAny = pic as unknown;
      if (typeof picAny === 'string' && picAny.startsWith('http')) {
        picUrl = picAny;
      } else if (picAny && typeof picAny === 'object') {
        const picObj = picAny as Record<string, unknown>;
        picUrl = (picObj.eurl as string) || (picObj.imgFull as string) || '';
      }
    }
  } catch {
    // ignore — we'll try the stored URL as a last resort
  }

  // 3. Fall back to whatever URL is stored in DB (may be expired)
  if (!picUrl) {
    try {
      const db = getDb();
      const row = db
        .prepare(
          `SELECT profile_pic_url FROM contacts
           WHERE phone = ? AND profile_pic_url IS NOT NULL AND profile_pic_url != ''
           LIMIT 1`
        )
        .get(digits) as { profile_pic_url: string } | undefined;
      if (row) picUrl = row.profile_pic_url;
    } catch {
      // ignore
    }
  }

  if (!picUrl) {
    // No picture available — serve stale cache if any, else 404
    try {
      const buf = await readFile(cacheFile);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch {
      return new Response('no avatar', { status: 404 });
    }
  }

  // 4. Fetch the image and cache it
  try {
    const imgRes = await fetch(picUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!imgRes.ok) throw new Error(`upstream ${imgRes.status}`);
    const arrBuf = await imgRes.arrayBuffer();
    const buf = Buffer.from(arrBuf);

    // Cache asynchronously (don't block the response)
    (async () => {
      try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cacheFile, buf);
        // Update DB with the fresh URL so the Avatar fallback still works
        const db = getDb();
        db.prepare(
          `UPDATE contacts SET profile_pic_url = ? WHERE phone = ?`
        ).run(picUrl, digits);
      } catch {
        // ignore cache write errors
      }
    })();

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    // Last resort: serve stale cache
    try {
      const buf = await readFile(cacheFile);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch {
      return new Response('upstream fetch failed', { status: 502 });
    }
  }
}
