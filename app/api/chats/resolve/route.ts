import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Resolve a chat from a (sessionId, wppId | phone | contactId) tuple.
 *
 * Why this exists: when navigating from Contacts → Conversations we know the
 * contact, but the chat in DB may have been stored under a different wpp_id
 * (typically @lid vs @c.us) where the digits don't even line up. Pure
 * client-side string matching can't reconcile that. This endpoint joins
 * `contacts` and `chats` server-side to find the right row, and inserts a
 * fresh chat row if nothing matches so the caller always lands on a real,
 * persisted chat — no more "phantom" chats.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, wppId: rawWppId, phone: rawPhone, contactId, name: providedName } = body as {
      sessionId?: string;
      wppId?: string;
      phone?: string;
      contactId?: string;
      name?: string;
    };

    if (!sessionId) {
      return Response.json({ success: false, error: 'sessionId required' }, { status: 400 });
    }
    if (!rawWppId && !rawPhone && !contactId) {
      return Response.json({ success: false, error: 'wppId, phone or contactId required' }, { status: 400 });
    }

    const db = getDb();

    // Hydrate phone/wppId from the contact row if a contactId was provided.
    let wppId = rawWppId || '';
    let phone = (rawPhone || '').replace(/\D/g, '');
    let contactName = providedName || '';
    let profilePicUrl = '';

    if (contactId) {
      const contact = db.prepare(
        `SELECT wpp_id, phone, name, push_name, profile_pic_url FROM contacts WHERE id = ? AND session_id = ?`
      ).get(contactId, sessionId) as
        | { wpp_id: string; phone: string; name: string; push_name: string | null; profile_pic_url: string | null }
        | undefined;
      if (contact) {
        if (!wppId) wppId = contact.wpp_id;
        if (!phone) phone = (contact.phone || '').replace(/\D/g, '');
        if (!contactName) contactName = contact.name || contact.push_name || '';
        if (contact.profile_pic_url) profilePicUrl = contact.profile_pic_url;
      }
    } else if (phone) {
      // Look up a contact by phone to enrich name/profile pic if available.
      const contact = db.prepare(
        `SELECT name, push_name, profile_pic_url FROM contacts WHERE session_id = ? AND phone = ? LIMIT 1`
      ).get(sessionId, phone) as { name: string; push_name: string | null; profile_pic_url: string | null } | undefined;
      if (contact) {
        if (!contactName) contactName = contact.name || contact.push_name || '';
        if (contact.profile_pic_url) profilePicUrl = contact.profile_pic_url;
      }
    }

    type ChatRow = { id: string; wpp_id: string; name: string; profile_pic_url: string | null };

    // Strategy 1 — exact wpp_id match.
    let chat: ChatRow | undefined;
    if (wppId) {
      chat = db.prepare(
        `SELECT id, wpp_id, name, profile_pic_url FROM chats WHERE session_id = ? AND wpp_id = ?`
      ).get(sessionId, wppId) as ChatRow | undefined;
    }

    // Strategy 2 — phone digits comparison. Uses LIKE to handle suffix variants.
    if (!chat && phone) {
      chat = db.prepare(
        `SELECT id, wpp_id, name, profile_pic_url FROM chats
         WHERE session_id = ? AND is_group = 0
           AND (wpp_id = ? OR wpp_id = ? OR wpp_id = ?)
         LIMIT 1`
      ).get(sessionId, `${phone}@c.us`, `${phone}@s.whatsapp.net`, `${phone}@lid`) as ChatRow | undefined;
    }

    // Strategy 3 — strip non-digits and compare exact phone digits (handles odd suffixes).
    if (!chat && phone) {
      const candidates = db.prepare(
        `SELECT id, wpp_id, name, profile_pic_url FROM chats WHERE session_id = ? AND is_group = 0`
      ).all(sessionId) as ChatRow[];
      chat = candidates.find((c) => {
        const digits = (c.wpp_id || '').replace(/\D/g, '');
        if (!digits) return false;
        return digits === phone || digits.endsWith(phone) || phone.endsWith(digits);
      });
    }

    // Strategy 4 — match by name against contacts (last resort, scoped to non-groups).
    if (!chat && contactName) {
      chat = db.prepare(
        `SELECT id, wpp_id, name, profile_pic_url FROM chats
         WHERE session_id = ? AND is_group = 0 AND name = ?
         LIMIT 1`
      ).get(sessionId, contactName) as ChatRow | undefined;
    }

    if (chat) {
      return Response.json({
        success: true,
        data: {
          id: chat.id,
          sessionId,
          wppId: chat.wpp_id,
          name: chat.name || contactName || phone || chat.wpp_id,
          isGroup: false,
          unreadCount: 0,
          isArchived: false,
          isPinned: false,
          isMuted: false,
          profilePicUrl: chat.profile_pic_url || profilePicUrl || undefined,
          updatedAt: new Date().toISOString(),
          isNew: false,
        },
      });
    }

    // Nothing matched — persist a fresh chat row so /api/messages can fetch
    // history from WhatsApp on the next request using a stable wpp_id.
    const finalWppId = wppId
      || (phone ? `${phone}@c.us` : '');
    if (!finalWppId) {
      return Response.json({ success: false, error: 'Cannot resolve chat without wppId or phone' }, { status: 400 });
    }
    const finalName = contactName || phone || finalWppId;
    const newId = uuidv4();
    db.prepare(
      `INSERT INTO chats (id, session_id, wpp_id, name, is_group, unread_count, profile_pic_url, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, datetime('now'))`
    ).run(newId, sessionId, finalWppId, finalName, profilePicUrl || null);

    return Response.json({
      success: true,
      data: {
        id: newId,
        sessionId,
        wppId: finalWppId,
        name: finalName,
        isGroup: false,
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isMuted: false,
        profilePicUrl: profilePicUrl || undefined,
        updatedAt: new Date().toISOString(),
        isNew: true,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to resolve chat' },
      { status: 500 }
    );
  }
}
