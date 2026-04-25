import { NextRequest } from 'next/server';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';
import { getDataDir } from '@/lib/paths';

const CACHE_DIR = path.join(getDataDir(), 'media');

/**
 * Lazy media proxy: serves the binary content of a WhatsApp message on demand.
 *
 * Why:
 *   When `onMessage` fires, we store the message metadata but NOT the binary
 *   payload (images, audio, docs). That keeps the DB small, but the UI needs
 *   something to render. This route downloads the media via wppconnect on
 *   first request, caches it on disk, and serves it from the cache after that.
 *
 * URL:  /api/messages/:id/media
 *   - `id` is the `messages.id` row UUID (internal), not the WhatsApp msg id.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return new Response('missing id', { status: 400 });

    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, session_id, wpp_id, type, media_url, body, caption, media_type
         FROM messages WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          session_id: string;
          wpp_id: string;
          type: string;
          media_url: string | null;
          body: string | null;
          caption: string | null;
          media_type: string | null;
        }
      | undefined;

    if (!row) return new Response('message not found', { status: 404 });

    const cacheFile = path.join(CACHE_DIR, `${id}`);

    // 1. Serve cached bytes when present — disk cache is the source of truth.
    try {
      await stat(cacheFile);
      const buf = await readFile(cacheFile);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': row.media_type || guessContentType(row.type),
          'Cache-Control': 'private, max-age=86400',
        },
      });
    } catch {
      // not cached yet
    }

    // 2. If the row already has a base64 body, decode and cache.
    if (row.body && isBase64Like(row.body)) {
      const data = row.body.startsWith('data:')
        ? row.body.split(',')[1] || ''
        : row.body;
      try {
        const buf = Buffer.from(data, 'base64');
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cacheFile, buf);
        return new Response(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': row.media_type || guessContentType(row.type),
            'Cache-Control': 'private, max-age=86400',
          },
        });
      } catch {
        /* fall through */
      }
    }

    // 3. Try a stored URL as a fast path (may be expired).
    if (row.media_url && row.media_url.startsWith('http')) {
      try {
        const r = await fetch(row.media_url, {
          signal: AbortSignal.timeout(10_000),
        });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          await mkdir(CACHE_DIR, { recursive: true });
          await writeFile(cacheFile, buf);
          return new Response(new Uint8Array(buf), {
            status: 200,
            headers: {
              'Content-Type':
                r.headers.get('content-type') ||
                row.media_type ||
                guessContentType(row.type),
              'Cache-Control': 'private, max-age=86400',
            },
          });
        }
      } catch {
        /* fall through */
      }
    }

    // 4. Ask wppconnect to download the media from WhatsApp. Needs an active
    //    browser client and the raw WhatsApp message id.
    const client = manager.getClient(row.session_id);
    if (!client) {
      return new Response('WhatsApp session not connected', { status: 503 });
    }
    if (!row.wpp_id) {
      return new Response('no wpp message id stored', { status: 404 });
    }

    // The `msgChunks` error from wppconnect means the chat isn't loaded in
    // WhatsApp Web's in-memory store yet. We pre-load the chat via openChat
    // + loadEarlierMessages, then try two download paths.
    const clientAny = client as unknown as {
      downloadMedia: (msgId: string) => Promise<string | Buffer>;
      getMessageById: (msgId: string) => Promise<unknown>;
      decryptFile: (message: unknown) => Promise<Buffer>;
      openChat?: (chatId: string) => Promise<boolean>;
      loadEarlierMessages?: (chatId: string) => Promise<unknown>;
      loadAndGetAllMessagesInChat?: (chatId: string, includeMe?: boolean) => Promise<unknown>;
      waPage?: {
        evaluate: (fn: string | ((...a: unknown[]) => unknown), ...args: unknown[]) => Promise<unknown>;
      };
    };

    // Extract the chat wpp id. Either from our DB (chats.wpp_id via chat_id)
    // or by parsing the message wpp_id structure: "false_<chatId>_<msgId>_<sender>".
    let chatWppId = '';
    try {
      const chatRow = db
        .prepare(`SELECT wpp_id FROM chats WHERE id = (SELECT chat_id FROM messages WHERE id = ?)`)
        .get(id) as { wpp_id: string } | undefined;
      if (chatRow?.wpp_id) chatWppId = chatRow.wpp_id;
    } catch {
      /* ignore */
    }
    if (!chatWppId) {
      // Fallback: parse from the message id
      const parts = row.wpp_id.split('_');
      if (parts.length >= 2) chatWppId = parts[1];
    }

    // Pre-load the chat so `msgChunks` is populated before decrypt attempts.
    if (chatWppId) {
      try {
        if (typeof clientAny.openChat === 'function') {
          await clientAny.openChat(chatWppId);
        }
      } catch {
        /* ignore */
      }
      try {
        if (typeof clientAny.loadEarlierMessages === 'function') {
          await clientAny.loadEarlierMessages(chatWppId);
        }
      } catch {
        /* ignore */
      }
    }

    let buf: Buffer | null = null;
    let contentType = row.media_type || guessContentType(row.type);
    const errors: string[] = [];

    // Attempt 1 — getMessageById + decryptFile
    try {
      const msg = await clientAny.getMessageById(row.wpp_id);
      if (msg) {
        const decrypted = await clientAny.decryptFile(msg);
        if (decrypted && decrypted.length > 0) {
          buf = decrypted;
          const m = msg as Record<string, unknown>;
          if (typeof m.mimetype === 'string' && m.mimetype) contentType = m.mimetype;
        }
      }
    } catch (err) {
      errors.push(`getMessageById/decryptFile: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    // Attempt 2 — classic downloadMedia (base64 / data URI)
    if (!buf) {
      try {
        const result = await clientAny.downloadMedia(row.wpp_id);
        if (result) {
          if (typeof result === 'string') {
            if (result.startsWith('data:')) {
              const [header, payload] = result.split(',', 2);
              const mt = /data:([^;]+);base64/.exec(header);
              if (mt) contentType = mt[1];
              buf = Buffer.from(payload || '', 'base64');
            } else {
              buf = Buffer.from(result, 'base64');
            }
          } else {
            buf = result as Buffer;
          }
        }
      } catch (err) {
        errors.push(`downloadMedia: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // Attempt 3 — last resort: load everything in the chat then retry
    if (!buf && chatWppId) {
      try {
        if (typeof clientAny.loadAndGetAllMessagesInChat === 'function') {
          await clientAny.loadAndGetAllMessagesInChat(chatWppId, true);
        }
        const msg = await clientAny.getMessageById(row.wpp_id);
        if (msg) {
          const decrypted = await clientAny.decryptFile(msg);
          if (decrypted && decrypted.length > 0) {
            buf = decrypted;
            const m = msg as Record<string, unknown>;
            if (typeof m.mimetype === 'string' && m.mimetype) contentType = m.mimetype;
          }
        }
      } catch (err) {
        errors.push(`loadAndGetAll+retry: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // Attempt 4 — run WPP's downloadMedia directly inside the WhatsApp Web
    // tab via Puppeteer's page.evaluate. Bypasses wppconnect helper wrappers
    // that keep failing on `msgChunks` for historical media. Returns a data
    // URL ("data:video/mp4;base64,AAAA...").
    if (!buf && clientAny.waPage) {
      try {
        const esc = row.wpp_id.replace(/'/g, "\\'");
        const script = `
          (async () => {
            try {
              if (typeof WPP === 'undefined' || !WPP.chat) {
                return { ok: false, error: 'WPP not available' };
              }
              // Make sure the chat is loaded (hydrates msgChunks)
              const ${'parts'} = '${esc}'.split('_');
              const chatId = ${'parts'}.length >= 2 ? ${'parts'}[1] : '';
              if (chatId && WPP.chat.openChatFromId) {
                try { await WPP.chat.openChatFromId(chatId); } catch (e) {}
              }
              // Fetch via WPP
              const media = await WPP.chat.downloadMedia('${esc}');
              if (!media) return { ok: false, error: 'empty result' };
              if (typeof media === 'string') return { ok: true, data: media };
              // MediaBlob → read as data URL
              const blob = media.toBlob ? await media.toBlob() : media;
              return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({ ok: true, data: reader.result });
                reader.onerror = () => resolve({ ok: false, error: 'reader failed' });
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              return { ok: false, error: (e && e.message) || 'unknown' };
            }
          })()
        `;
        const result = (await clientAny.waPage.evaluate(script)) as
          | { ok: true; data: string }
          | { ok: false; error: string }
          | null;
        if (result && result.ok && typeof result.data === 'string' && result.data.startsWith('data:')) {
          const [header, payload] = result.data.split(',', 2);
          const mt = /data:([^;]+);base64/.exec(header);
          if (mt) contentType = mt[1];
          buf = Buffer.from(payload || '', 'base64');
        } else if (result && 'error' in result) {
          errors.push(`page.evaluate: ${result.error}`);
        }
      } catch (err) {
        errors.push(`page.evaluate: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    if (!buf || buf.length === 0) {
      return new Response(
        `download failed: ${errors.join(' | ') || 'empty payload'}`,
        { status: 502 }
      );
    }

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, buf);

    try {
      db.prepare(
        `UPDATE messages SET media_url = ?, media_type = ? WHERE id = ?`
      ).run(`/api/messages/${id}/media`, contentType, id);
    } catch {
      /* ignore */
    }

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : 'unexpected error',
      { status: 500 }
    );
  }
}

function isBase64Like(s: string): boolean {
  if (!s || s.length < 32) return false;
  if (s.startsWith('data:')) return true;
  // Heuristic: mostly base64 charset, no whitespace, reasonably long
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s.slice(0, 200));
}

function guessContentType(messageType: string): string {
  switch (messageType) {
    case 'image':
      return 'image/jpeg';
    case 'video':
      return 'video/mp4';
    case 'audio':
    case 'ptt':
      return 'audio/ogg';
    case 'sticker':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
