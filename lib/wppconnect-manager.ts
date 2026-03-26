import { create, Whatsapp } from '@wppconnect-team/wppconnect';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import type { Session, SessionStatus, Flow } from '@/lib/types';
import { executeFlow, resumeFlowAfterWait } from '@/lib/flow-engine';

// Store wppconnect tokens outside the project to avoid Turbopack crashes
const TOKENS_PATH = path.join(os.tmpdir(), 'wautochat-tokens');

interface ActiveSession {
  client: Whatsapp;
  sessionId: string;
  status: SessionStatus;
}

// Paused flow conversations: key = `${sessionId}:${chatId}:${flowId}`
interface PausedConversation {
  flowId: string;
  resumeAfterNodeId: string; // the wait-for-reply node id
  variables: Record<string, string>;
  timestamp: number;
}

class WppConnectManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private qrCodes: Map<string, string> = new Map();
  private pausedConversations: Map<string, PausedConversation> = new Map();
  private autoReconnectDone = false;

  /**
   * Auto-reconnect all sessions that were previously connected.
   * Called once on first API access.
   */
  async autoReconnect(): Promise<void> {
    if (this.autoReconnectDone) return;
    this.autoReconnectDone = true;

    try {
      const db = getDb();
      const rows = db.prepare(
        `SELECT id, device_name FROM sessions WHERE status = 'connected' OR status = 'qr_ready'`
      ).all() as Record<string, unknown>[];

      for (const row of rows) {
        const sid = row.id as string;
        if (!this.sessions.has(sid)) {
          console.log(`[auto-reconnect] Reconnecting session ${sid}...`);
          // Mark as connecting
          db.prepare(`UPDATE sessions SET status = 'connecting', updated_at = datetime('now') WHERE id = ?`).run(sid);
          this.initClient(sid, row.device_name as string).catch((err) => {
            console.error(`[auto-reconnect] Failed to reconnect ${sid}:`, err);
            db.prepare(`UPDATE sessions SET status = 'disconnected', updated_at = datetime('now') WHERE id = ?`).run(sid);
          });
        }
      }
    } catch (err) {
      console.error('[auto-reconnect] Error:', err);
    }
  }

  async createSession(
    sessionId: string,
    name: string,
    deviceName?: string
  ): Promise<string> {
    const db = getDb();

    db.prepare(
      `INSERT INTO sessions (id, name, status, device_name, created_at, updated_at)
       VALUES (?, ?, 'connecting', ?, datetime('now'), datetime('now'))`
    ).run(sessionId, name, deviceName || 'WAutoChat');

    // Start client initialization in the background (don't await)
    // The QR code will be available via polling /api/sessions/[id]/qr
    this.initClient(sessionId, deviceName).catch((error) => {
      console.error(`[${sessionId}] Failed to initialize client:`, error);
      this.updateSessionStatus(sessionId, 'failed');
    });

    return sessionId;
  }

  private async initClient(
    sessionId: string,
    deviceName?: string
  ): Promise<void> {
    const db = getDb();

    try {
      this.updateSessionStatus(sessionId, 'connecting');

      const client = await create({
        session: sessionId,
        headless: true,
        useChrome: false,
        autoClose: 0,
        deviceName: deviceName || 'WAutoChat',
        logQR: false,
        disableWelcome: true,
        folderNameToken: TOKENS_PATH,
        updatesLog: false,
        catchQR: (
          base64Qr: string,
          _asciiQR: string,
          _attempts: number,
          _urlCode: string | undefined
        ) => {
          this.qrCodes.set(sessionId, base64Qr);
          this.updateSessionStatus(sessionId, 'qr_ready');
        },
        statusFind: (statusSession: string, _session: string) => {
          if (
            statusSession === 'isLogged' ||
            statusSession === 'inChat' ||
            statusSession === 'qrReadSuccess'
          ) {
            this.updateSessionStatus(sessionId, 'connected');
            this.qrCodes.delete(sessionId);
          } else if (
            statusSession === 'notLogged' ||
            statusSession === 'browserClose' ||
            statusSession === 'desconnectedMobile' ||
            statusSession === 'deleteToken'
          ) {
            this.updateSessionStatus(sessionId, 'disconnected');
          }
        },
      });

      this.sessions.set(sessionId, {
        client,
        sessionId,
        status: 'connected',
      });

      this.updateSessionStatus(sessionId, 'connected');
      this.qrCodes.delete(sessionId);

      const hostDevice = await client.getHostDevice();
      if (hostDevice && (hostDevice as unknown as Record<string, unknown>).wid) {
        const wid = (hostDevice as unknown as Record<string, unknown>).wid as Record<string, unknown>;
        const phone = (wid.user as string) || '';
        db.prepare(`UPDATE sessions SET phone = ?, updated_at = datetime('now') WHERE id = ?`).run(
          phone,
          sessionId
        );
      }

      this.registerEventHandlers(sessionId, client);
    } catch (error) {
      this.updateSessionStatus(sessionId, 'failed');
      throw error;
    }
  }

  private registerEventHandlers(sessionId: string, client: Whatsapp): void {
    client.onMessage(async (message) => {
      await this.handleIncomingMessage(sessionId, message as unknown as Record<string, unknown>);
    });

    client.onAck(async (ack) => {
      const db = getDb();
      const ackData = ack as unknown as Record<string, unknown>;
      const wppId = (ackData.id as Record<string, unknown>)?._serialized as string || (ackData.id as string) || '';
      let status: string = 'sent';
      const ackValue = ackData.ack as number;
      if (ackValue === 1) status = 'sent';
      else if (ackValue === 2) status = 'delivered';
      else if (ackValue === 3) status = 'read';

      db.prepare(`UPDATE messages SET status = ? WHERE wpp_id = ?`).run(status, wppId);
    });

    client.onStateChange((state) => {
      if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
        this.updateSessionStatus(sessionId, 'disconnected');
      } else if (state === 'CONNECTED') {
        this.updateSessionStatus(sessionId, 'connected');
      }
    });

    client.onIncomingCall(async (call) => {
      // Log incoming calls - can be extended with flow triggers
      console.log(`[${sessionId}] Incoming call from:`, (call as unknown as Record<string, unknown>).peerJid);
    });

    client.onAddedToGroup(async (chat) => {
      const db = getDb();
      const chatData = chat as unknown as Record<string, unknown>;
      const groupId = uuidv4();
      const wppId = (chatData.id as Record<string, unknown>)?._serialized as string || (chatData.id as string) || '';
      const name = (chatData.contact as Record<string, unknown>)?.name as string
        || (chatData.name as string)
        || 'Unknown Group';

      db.prepare(
        `INSERT OR IGNORE INTO groups_table (id, session_id, wpp_id, name, participant_count, created_at)
         VALUES (?, ?, ?, ?, 0, datetime('now'))`
      ).run(groupId, sessionId, wppId, name);

      db.prepare(
        `INSERT OR IGNORE INTO chats (id, session_id, wpp_id, name, is_group, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'))`
      ).run(uuidv4(), sessionId, wppId, name);
    });

    client.onParticipantsChanged(async (participantChange) => {
      const db = getDb();
      const data = participantChange as unknown as Record<string, unknown>;
      const groupId = data.groupId as string || '';

      if (data.action === 'add' || data.action === 'remove') {
        try {
          const activeSession = this.sessions.get(sessionId);
          if (activeSession) {
            const members = await activeSession.client.getGroupMembers(groupId);
            db.prepare(
              `UPDATE groups_table SET participant_count = ? WHERE session_id = ? AND wpp_id = ?`
            ).run(members.length, sessionId, groupId);
          }
        } catch {
          // Group may no longer be accessible
        }
      }
    });

    client.onReactionMessage(async (reaction) => {
      const db = getDb();
      const reactionData = reaction as unknown as Record<string, unknown>;
      const msgId = uuidv4();
      const chatId = (reactionData.chatId as Record<string, unknown>)?._serialized as string
        || (reactionData.chatId as string) || '';
      const sender = (reactionData.senderId as string) || '';
      const body = (reactionData.reactionText as string) || '';
      const parentMsgId = (reactionData.msgId as Record<string, unknown>)?._serialized as string
        || (reactionData.msgId as string) || '';

      const chatRow = db.prepare(
        `SELECT id FROM chats WHERE session_id = ? AND wpp_id = ?`
      ).get(sessionId, chatId) as { id: string } | undefined;

      if (chatRow) {
        db.prepare(
          `INSERT INTO messages (id, session_id, chat_id, wpp_id, type, body, sender, from_me, timestamp, status, quoted_msg_id)
           VALUES (?, ?, ?, ?, 'reaction', ?, ?, 0, datetime('now'), 'delivered', ?)`
        ).run(msgId, sessionId, chatRow.id, '', body, sender, parentMsgId);
      }
    });

    client.onPollResponse(async (pollResponse) => {
      const db = getDb();
      const pollData = pollResponse as unknown as Record<string, unknown>;
      const msgId = uuidv4();
      const chatId = (pollData.chatId as Record<string, unknown>)?._serialized as string
        || (pollData.chatId as string) || '';
      const sender = (pollData.sender as string) || '';
      const selectedOptions = JSON.stringify(pollData.selectedOptions || []);

      const chatRow = db.prepare(
        `SELECT id FROM chats WHERE session_id = ? AND wpp_id = ?`
      ).get(sessionId, chatId) as { id: string } | undefined;

      if (chatRow) {
        db.prepare(
          `INSERT INTO messages (id, session_id, chat_id, wpp_id, type, body, sender, from_me, timestamp, status)
           VALUES (?, ?, ?, ?, 'poll', ?, ?, 0, datetime('now'), 'delivered')`
        ).run(msgId, sessionId, chatRow.id, '', selectedOptions, sender);
      }
    });
  }

  private async handleIncomingMessage(
    sessionId: string,
    message: Record<string, unknown>
  ): Promise<void> {
    const db = getDb();

    const wppChatId =
      (message.chatId as Record<string, unknown>)?._serialized as string ||
      (message.chatId as string) ||
      (message.from as string) ||
      '';
    const wppMsgId =
      (message.id as Record<string, unknown>)?._serialized as string ||
      (message.id as string) ||
      '';
    const sender = (message.sender as Record<string, unknown>)?.id as string ||
      (message.from as string) || '';
    const senderName =
      (message.sender as Record<string, unknown>)?.pushname as string ||
      (message.sender as Record<string, unknown>)?.name as string ||
      '';
    const body = (message.body as string) || (message.caption as string) || '';
    const fromMe = !!(message.fromMe);
    const isGroup = !!(message.isGroupMsg);

    // Determine message type
    let type = 'text';
    if (message.isMedia || message.isMMS) {
      const mimetype = (message.mimetype as string) || '';
      if (mimetype.startsWith('image/')) type = 'image';
      else if (mimetype.startsWith('video/')) type = 'video';
      else if (mimetype.startsWith('audio/')) type = message.type === 'ptt' ? 'ptt' : 'audio';
      else type = 'document';
    } else if (message.type === 'sticker') {
      type = 'sticker';
    } else if (message.type === 'location' || message.type === 'live_location') {
      type = 'location';
    } else if (message.type === 'vcard' || message.type === 'multi_vcard') {
      type = 'contact';
    } else if (message.type === 'list_response' || message.type === 'list') {
      type = 'list';
    } else if (message.type === 'poll_creation') {
      type = 'poll';
    }

    // Ensure chat exists
    let chatRow = db.prepare(
      `SELECT id FROM chats WHERE session_id = ? AND wpp_id = ?`
    ).get(sessionId, wppChatId) as { id: string } | undefined;

    if (!chatRow) {
      const chatId = uuidv4();
      const chatName =
        (message.chat as Record<string, unknown>)?.name as string ||
        (message.sender as Record<string, unknown>)?.pushname as string ||
        wppChatId;

      db.prepare(
        `INSERT INTO chats (id, session_id, wpp_id, name, is_group, unread_count, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
      ).run(chatId, sessionId, wppChatId, chatName, isGroup ? 1 : 0);

      chatRow = { id: chatId };
    }

    // Store message
    const msgId = uuidv4();
    const mediaUrl = (message.mediaUrl as string) || '';
    const mediaType = (message.mimetype as string) || '';
    const caption = (message.caption as string) || '';
    const isForwarded = !!(message.isForwarded);
    const quotedMsgId =
      (message.quotedMsgId as Record<string, unknown>)?._serialized as string ||
      (message.quotedMsg as Record<string, unknown>)?.id as string ||
      '';

    db.prepare(
      `INSERT INTO messages (id, session_id, chat_id, wpp_id, type, body, sender, sender_name, from_me, timestamp, status, quoted_msg_id, media_url, media_type, caption, is_forwarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'delivered', ?, ?, ?, ?, ?)`
    ).run(
      msgId,
      sessionId,
      chatRow.id,
      wppMsgId,
      type,
      body,
      sender,
      senderName,
      fromMe ? 1 : 0,
      quotedMsgId || null,
      mediaUrl || null,
      mediaType || null,
      caption || null,
      isForwarded ? 1 : 0
    );

    // Update chat
    db.prepare(
      `UPDATE chats SET last_message_id = ?, unread_count = CASE WHEN ? = 0 THEN unread_count + 1 ELSE unread_count END, updated_at = datetime('now') WHERE id = ?`
    ).run(msgId, fromMe ? 1 : 0, chatRow.id);

    // Ensure contact exists for non-group direct messages
    if (!isGroup && !fromMe) {
      const contactWppId = sender;
      const existing = db.prepare(
        `SELECT id FROM contacts WHERE session_id = ? AND wpp_id = ?`
      ).get(sessionId, contactWppId);

      if (!existing) {
        db.prepare(
          `INSERT INTO contacts (id, session_id, wpp_id, name, push_name, phone, is_wa_contact, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
        ).run(uuidv4(), sessionId, contactWppId, senderName || contactWppId, senderName, contactWppId.replace('@c.us', ''));
      }
    }

    // --- Trigger active flows ---
    if (!fromMe) {
      this.triggerFlows(sessionId, message, body, type, isGroup).catch((err) => {
        console.error(`[${sessionId}] Flow execution error:`, err);
      });
    }
  }

  pauseConversation(sessionId: string, chatId: string, flowId: string, waitNodeId: string, variables: Record<string, string>): void {
    const key = `${sessionId}:${chatId}:${flowId}`;
    this.pausedConversations.set(key, {
      flowId,
      resumeAfterNodeId: waitNodeId,
      variables,
      timestamp: Date.now(),
    });
    console.log(`[${sessionId}] Flow "${flowId}" paused at wait-for-reply for chat ${chatId}`);
  }

  private async triggerFlows(
    sessionId: string,
    message: Record<string, unknown>,
    body: string,
    msgType: string,
    isGroup: boolean
  ): Promise<void> {
    const db = getDb();
    const session = this.getSession(sessionId);
    if (!session) return;

    const chatId =
      (message.chatId as Record<string, unknown>)?._serialized as string ||
      (message.chatId as string) ||
      (message.from as string) || '';

    // First: check for any paused conversations waiting for a reply from this chat
    let resumedAny = false;
    for (const [key, paused] of this.pausedConversations.entries()) {
      if (!key.startsWith(`${sessionId}:${chatId}:`)) continue;
      if (Date.now() - paused.timestamp > 5 * 60 * 1000) {
        this.pausedConversations.delete(key);
        continue;
      }

      // Resume this flow from after the wait-for-reply node
      this.pausedConversations.delete(key);
      resumedAny = true;

      try {
        const flowRow = db.prepare(`SELECT * FROM flows WHERE id = ? AND is_active = 1`).get(paused.flowId) as Record<string, unknown> | undefined;
        if (!flowRow) continue;

        const flow: Flow = {
          id: flowRow.id as string,
          sessionId: flowRow.session_id as string,
          name: flowRow.name as string,
          description: (flowRow.description as string) || undefined,
          isActive: true,
          trigger: JSON.parse((flowRow.trigger_config as string) || '{}'),
          nodes: JSON.parse((flowRow.nodes as string) || '[]'),
          edges: JSON.parse((flowRow.edges as string) || '[]'),
          variables: { ...JSON.parse((flowRow.variables as string) || '{}'), ...paused.variables, message: body },
          createdAt: flowRow.created_at as string,
          updatedAt: flowRow.updated_at as string,
        };

        console.log(`[${sessionId}] Resuming flow "${flow.name}" after wait-for-reply`);
        const log = await resumeFlowAfterWait(
          flow,
          message,
          session,
          paused.resumeAfterNodeId,
          paused.variables
        );
        console.log(`[${sessionId}] Flow "${flow.name}" resumed, completed:`, log.length, 'steps');
      } catch (err) {
        console.error(`[${sessionId}] Error resuming flow:`, err);
      }
    }

    // If we resumed a paused conversation, don't trigger new flows
    if (resumedAny) return;

    // Normal: check active flows and their triggers
    const flowRows = db.prepare(
      `SELECT * FROM flows WHERE session_id = ? AND is_active = 1`
    ).all(sessionId) as Record<string, unknown>[];

    for (const row of flowRows) {
      try {
        const flow: Flow = {
          id: row.id as string,
          sessionId: row.session_id as string,
          name: row.name as string,
          description: (row.description as string) || undefined,
          isActive: true,
          trigger: JSON.parse((row.trigger_config as string) || '{}'),
          nodes: JSON.parse((row.nodes as string) || '[]'),
          edges: JSON.parse((row.edges as string) || '[]'),
          variables: JSON.parse((row.variables as string) || '{}'),
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };

        if (flow.nodes.length === 0) continue;

        const triggerNode = flow.nodes.find((n) => n.data.type === 'trigger');
        if (!triggerNode) continue;

        const triggerType = (triggerNode.data.config?.triggerType as string) || 'message_received';
        const shouldTrigger = this.checkTrigger(triggerType, triggerNode.data.config, body, msgType, isGroup);

        if (shouldTrigger) {
          console.log(`[${sessionId}] Triggering flow "${flow.name}" (${triggerType})`);
          const log = await executeFlow(flow, message, session);
          console.log(`[${sessionId}] Flow "${flow.name}" completed:`, log.length, 'steps');
        }
      } catch (err) {
        console.error(`[${sessionId}] Error executing flow ${row.name}:`, err);
      }
    }
  }

  private checkTrigger(
    triggerType: string,
    config: Record<string, unknown>,
    body: string,
    msgType: string,
    isGroup: boolean
  ): boolean {
    switch (triggerType) {
      case 'message_received':
        return true;

      case 'keyword': {
        const keywords = ((config?.keywords as string) || '').split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean);
        if (keywords.length === 0) return true;
        const lowerBody = body.toLowerCase();
        const matchMode = (config?.matchMode as string) || 'contains';
        if (matchMode === 'exact') {
          return keywords.some((k) => lowerBody === k);
        }
        return keywords.some((k) => lowerBody.includes(k));
      }

      case 'regex': {
        const pattern = (config?.pattern as string) || '';
        if (!pattern) return false;
        try {
          return new RegExp(pattern, 'i').test(body);
        } catch {
          return false;
        }
      }

      case 'media_received': {
        const allowedTypes = (config?.mediaTypes as string[]) || [];
        if (allowedTypes.length === 0) return ['image', 'video', 'audio', 'document', 'sticker'].includes(msgType);
        return allowedTypes.includes(msgType);
      }

      case 'group_message':
        return isGroup;

      case 'contact_message': {
        const contactId = (config?.contactId as string) || '';
        if (!contactId) return !isGroup;
        return !isGroup; // TODO: match specific contact
      }

      case 'new_contact':
        return false; // Handled separately

      case 'added_to_group':
        return false; // Handled by onAddedToGroup event

      case 'webhook':
        return false; // Handled by webhook API route

      case 'schedule':
        return false; // Handled by cron

      default:
        return false;
    }
  }

  async connectSession(sessionId: string): Promise<void> {
    const db = getDb();
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;

    if (!session) {
      throw new Error('Session not found');
    }

    if (this.sessions.has(sessionId)) {
      const activeSession = this.sessions.get(sessionId)!;
      try {
        const state = await activeSession.client.getConnectionState();
        if (state === 'CONNECTED') {
          this.updateSessionStatus(sessionId, 'connected');
          return;
        }
      } catch {
        // Client may be stale, reinitialize
      }
      this.sessions.delete(sessionId);
    }

    // Start client initialization in the background
    this.initClient(sessionId, session.device_name as string).catch((error) => {
      console.error(`[${sessionId}] Failed to reconnect client:`, error);
      this.updateSessionStatus(sessionId, 'failed');
    });
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const activeSession = this.sessions.get(sessionId);
    if (activeSession) {
      try {
        await activeSession.client.logout();
      } catch {
        // May already be disconnected
      }
      try {
        await activeSession.client.close();
      } catch {
        // Ignore close errors
      }
      this.sessions.delete(sessionId);
    }
    this.qrCodes.delete(sessionId);
    this.updateSessionStatus(sessionId, 'disconnected');
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.disconnectSession(sessionId);

    const db = getDb();
    db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM chats WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM contacts WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM groups_table WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM flows WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM labels WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM broadcasts WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM products WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM collections WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }

  getSession(sessionId: string): Session | null {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToSession(row);
  }

  getAllSessions(): Session[] {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToSession(row));
  }

  getClient(sessionId: string): Whatsapp | null {
    const activeSession = this.sessions.get(sessionId);
    return activeSession?.client || null;
  }

  getQrCode(sessionId: string): string | null {
    return this.qrCodes.get(sessionId) || null;
  }

  private updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const db = getDb();
    db.prepare(`UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
      status,
      sessionId
    );

    const activeSession = this.sessions.get(sessionId);
    if (activeSession) {
      activeSession.status = status;
    }
  }

  private rowToSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      name: row.name as string,
      phone: (row.phone as string) || undefined,
      status: row.status as SessionStatus,
      qrCode: this.qrCodes.get(row.id as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      deviceName: (row.device_name as string) || undefined,
    };
  }
}

// Singleton that survives Next.js hot reloads
const globalForManager = globalThis as unknown as { __wppManager: WppConnectManager };

if (!globalForManager.__wppManager) {
  globalForManager.__wppManager = new WppConnectManager();
}

const manager = globalForManager.__wppManager;
export default manager;
