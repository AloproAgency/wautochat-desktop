import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';
import type { Contact } from '@/lib/types';

const AVATAR_CACHE_DIR = path.join(process.cwd(), 'data', 'avatars');

/** Download an image URL and write it to the on-disk avatar cache. */
async function cacheAvatar(phone: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(AVATAR_CACHE_DIR, { recursive: true });
    await writeFile(path.join(AVATAR_CACHE_DIR, `${phone}.jpg`), buf);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const search = searchParams.get('search');

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    let rows: Record<string, unknown>[];

    // Only show contacts the user actually saved in their phone (is_my_contact = 1),
    // not all WhatsApp users discovered via groups or past messages.
    if (search) {
      rows = db.prepare(
        `SELECT * FROM contacts
         WHERE session_id = ?
           AND is_my_contact = 1
           AND wpp_id NOT LIKE '%@lid'
           AND (name LIKE ? OR push_name LIKE ? OR phone LIKE ?)
         ORDER BY name ASC`
      ).all(sessionId, `%${search}%`, `%${search}%`, `%${search}%`) as Record<string, unknown>[];
    } else {
      rows = db.prepare(
        `SELECT * FROM contacts
         WHERE session_id = ?
           AND is_my_contact = 1
           AND wpp_id NOT LIKE '%@lid'
         ORDER BY name ASC`
      ).all(sessionId) as Record<string, unknown>[];
    }

    const contacts: Contact[] = rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      wppId: row.wpp_id as string,
      name: row.name as string,
      pushName: (row.push_name as string) || undefined,
      phone: row.phone as string,
      profilePicUrl: (row.profile_pic_url as string) || undefined,
      isMyContact: !!(row.is_my_contact),
      isWAContact: !!(row.is_wa_contact),
      isBlocked: !!(row.is_blocked),
      labels: JSON.parse((row.labels as string) || '[]'),
      lastSeen: (row.last_seen as string) || undefined,
      createdAt: row.created_at as string,
    }));

    return Response.json({ success: true, data: contacts });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list contacts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Try to get client, and auto-reconnect if needed
    let client = manager.getClient(sessionId);
    if (!client) {
      // Attempt reconnect before giving up
      try {
        await manager.reconnectSession(sessionId);
        client = manager.getClient(sessionId);
      } catch {
        // ignore reconnect failure
      }
    }
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected. Please reconnect from the Sessions page.' },
        { status: 400 }
      );
    }

    const wppContacts = await client.getAllContacts();
    const db = getDb();

    // Clean up duplicate entries (e.g. @lid variants) before syncing
    db.prepare(`DELETE FROM contacts WHERE session_id = ? AND wpp_id NOT LIKE '%@c.us'`).run(sessionId);

    let synced = 0;
    const insertStmt = db.prepare(
      `INSERT OR REPLACE INTO contacts (id, session_id, wpp_id, name, push_name, phone, profile_pic_url, is_my_contact, is_wa_contact, is_blocked, labels, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const transaction = db.transaction(() => {
      for (const contact of wppContacts) {
        const c = contact as unknown as Record<string, unknown>;
        const wppId = (c.id as Record<string, unknown>)?._serialized as string || (c.id as string) || '';

        if (!wppId || wppId === 'status@broadcast') continue;
        // Skip non-contact IDs (group chats, LID duplicates) to avoid duplicates
        if (!wppId.endsWith('@c.us')) continue;

        const existingRow = db.prepare(
          `SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`
        ).get(sessionId, wppId) as { id: string; labels: string } | undefined;

        const contactId = existingRow?.id || uuidv4();
        const existingLabels = existingRow?.labels || '[]';
        const phone = wppId.replace('@c.us', '') || '';
        const pushName = (c.pushname as string) || '';
        const name = (c.name as string) || pushName || (c.shortName as string) || (phone ? `+${phone}` : wppId);
        const profilePicUrl = (c.profilePicThumbObj as Record<string, unknown>)?.eurl as string || '';
        const isMyContact = !!(c.isMyContact);
        const isWAContact = !!(c.isWAContact ?? true);
        const isBlocked = !!(c.isBlocked);

        insertStmt.run(
          contactId,
          sessionId,
          wppId,
          name,
          pushName || null,
          phone,
          profilePicUrl || null,
          isMyContact ? 1 : 0,
          isWAContact ? 1 : 0,
          isBlocked ? 1 : 0,
          existingLabels
        );
        synced++;
      }
    });

    transaction();

    // Fetch profile pictures in background. We fetch for ALL @c.us contacts
    // (not just the ones without a URL), because WhatsApp URLs expire within
    // ~24h — downloading to local cache ensures they stay accessible forever.
    const contactRows = db.prepare(
      `SELECT id, wpp_id, phone FROM contacts WHERE session_id = ? AND wpp_id LIKE '%@c.us'`
    ).all(sessionId) as { id: string; wpp_id: string; phone: string }[];

    if (contactRows.length > 0 && client) {
      const capturedClient = client;
      const capturedDb = db;
      (async () => {
        const BATCH_SIZE = 5;
        let cached = 0;
        for (let i = 0; i < contactRows.length; i += BATCH_SIZE) {
          const batch = contactRows.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(async (row) => {
              try {
                const pic = await capturedClient.getProfilePicFromServer(row.wpp_id);
                const picAny = pic as unknown;
                let picUrl = '';
                if (typeof picAny === 'string' && picAny.startsWith('http')) picUrl = picAny;
                else if (picAny && typeof picAny === 'object') {
                  const picObj = picAny as Record<string, unknown>;
                  picUrl = (picObj.eurl as string) || (picObj.imgFull as string) || '';
                }
                if (!picUrl) return;

                // Store the fresh URL as fallback
                capturedDb.prepare(`UPDATE contacts SET profile_pic_url = ? WHERE id = ?`).run(picUrl, row.id);
                capturedDb.prepare(`UPDATE chats SET profile_pic_url = ? WHERE session_id = ? AND wpp_id = ? AND (profile_pic_url IS NULL OR profile_pic_url = '')`).run(picUrl, sessionId, row.wpp_id);

                // Download and cache the actual image bytes so they stay
                // available even after WhatsApp's URL token expires.
                if (row.phone) {
                  const ok = await cacheAvatar(row.phone, picUrl);
                  if (ok) cached++;
                }
              } catch {
                // Contact may not have a profile pic or privacy setting blocks it
              }
            })
          );
        }
        console.log(`[contacts-sync] Profile pic cached on disk for ${cached}/${contactRows.length} contacts`);
      })();
    }

    return Response.json({
      success: true,
      data: { synced, message: `${synced} contacts synced. Profile pictures loading in background...` },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync contacts' },
      { status: 500 }
    );
  }
}
