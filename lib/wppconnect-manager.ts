import { create, Whatsapp } from '@wppconnect-team/wppconnect';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import { applyTriggerFilters } from '@/lib/trigger-filters';
import type { Session, SessionStatus, Flow } from '@/lib/types';
import { executeFlow, resumeFlowAfterWait } from '@/lib/flow-engine';
import { getDataDir } from '@/lib/paths';

// In Electron, browser sessions persist in userData/browser-sessions so they
// survive across app restarts. In dev, fall back to /tmp to avoid Turbopack crashes.
function getTokensPath(): string {
  const dataDir = process.env.WAUTOCHAT_DATA_DIR;
  return dataDir
    ? path.join(dataDir, 'browser-sessions')
    : path.join(os.tmpdir(), 'wautochat-tokens');
}
const TOKENS_PATH = getTokensPath();

import fs from 'fs';

function browserDataDirFor(sessionId: string): string {
  return path.join(TOKENS_PATH, sessionId);
}

// Per-session lock files to support multiple WhatsApp accounts simultaneously
function lockFileFor(sessionId: string): string {
  return path.join(os.tmpdir(), `wautochat-browser-${sessionId}.lock`);
}

function readLockPid(sessionId: string): number | null {
  try {
    const lockFile = lockFileFor(sessionId);
    if (!fs.existsSync(lockFile)) return null;

    const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isSessionRunning(sessionId: string): boolean {
  try {
    const pid = readLockPid(sessionId);
    if (!pid) {
      clearLock(sessionId);
      return false;
    }

    if (isPidRunning(pid)) {
      return true;
    }

    clearLock(sessionId);
  } catch { /* ignore */ }
  return false;
}

function writeLock(sessionId: string, pid: number): void {
  try { fs.writeFileSync(lockFileFor(sessionId), String(pid)); } catch { /* ignore */ }
}

function clearLock(sessionId: string): void {
  try {
    const lockFile = lockFileFor(sessionId);
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch { /* ignore */ }
}

async function terminateLockedBrowser(sessionId: string, reason: string): Promise<void> {
  const pid = readLockPid(sessionId);
  if (!pid) {
    clearLock(sessionId);
    return;
  }

  if (pid === process.pid) {
    clearLock(sessionId);
    return;
  }

  if (isPidRunning(pid)) {
    console.log(`[${sessionId}] ${reason}. Stopping orphaned browser PID ${pid}...`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Browser may already be exiting.
    }
    // Give Chromium time to release its userDataDir lock.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  clearLock(sessionId);
}

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
  private pairCodes: Map<string, string> = new Map();
  private pausedConversations: Map<string, PausedConversation> = new Map();
  private autoReconnectDone = false;
  private reconnectPromises: Map<string, Promise<void>> = new Map();
  // Sessions that WhatsApp has reported as Unpaired - stop auto-reconnect
  private blockedSessions: Set<string> = new Set();

  /**
   * Auto-reconnect all sessions that were previously connected.
   * Called once on first API access.
   */
  async autoReconnect(): Promise<void> {
    if (this.autoReconnectDone) return;
    this.autoReconnectDone = true;
    await this.reconnectAllSessions('startup');
  }

  /**
   * Reconnect all non-failed sessions regardless of the autoReconnect guard.
   * Called on system resume from sleep — force-closes any zombie browsers first
   * so getConnectionState() can't return a stale CONNECTED result.
   */
  async reconnectAll(): Promise<void> {
    const db = getDb();
    const rows = db.prepare(
      `SELECT id FROM sessions WHERE status NOT IN ('failed') ORDER BY updated_at DESC`
    ).all() as { id: string }[];

    console.log(`[reconnectAll] force-closing ${rows.length} session(s) then reconnecting`);
    if (rows.length === 0) return;

    // Force-close every running browser so we start completely fresh.
    // This avoids getConnectionState() returning a stale CONNECTED after sleep.
    for (const row of rows) {
      const active = this.sessions.get(row.id);
      if (active) {
        try { await active.client.close(); } catch { /* ignore */ }
        this.sessions.delete(row.id);
      }
      await terminateLockedBrowser(row.id, 'Force-close before resume reconnect');
      this.updateSessionStatus(row.id, 'disconnected');
    }

    // Small pause to let OS release file handles.
    await new Promise((r) => setTimeout(r, 1000));

    // Mark all as 'connecting' for UI feedback.
    for (const row of rows) {
      this.updateSessionStatus(row.id, 'connecting');
    }

    // Fire-and-forget with 3 s stagger.
    void (async () => {
      for (const row of rows) {
        console.log(`[reconnectAll] reconnecting ${row.id}`);
        void this.reconnectSession(row.id).catch((error) => {
          console.error(`[${row.id}] Reconnect failed (resume):`, error);
        });
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();
  }

  private async reconnectAllSessions(reason: string): Promise<void> {
    const db = getDb();
    const rows = (db.prepare(
      `SELECT id FROM sessions WHERE status IN ('connected', 'connecting', 'disconnected') ORDER BY updated_at DESC`
    ).all() as { id: string }[])
      // Skip sessions explicitly blocked (UNPAIRED, awaiting user action) so
      // we don't ping-pong a dead browser into another reconnect cycle.
      .filter((r) => !this.blockedSessions.has(r.id));

    console.log(`[reconnectAllSessions:${reason}] found ${rows.length} session(s)`);
    if (rows.length === 0) return;

    for (const row of rows) {
      await terminateLockedBrowser(row.id, `Cleaning up browser before ${reason} reconnect`);
    }

    for (const row of rows) {
      this.updateSessionStatus(row.id, 'connecting');
    }

    void (async () => {
      for (const row of rows) {
        if (this.blockedSessions.has(row.id)) continue;
        console.log(`[reconnectAllSessions:${reason}] reconnecting ${row.id}`);
        void this.reconnectSession(row.id).catch((error) => {
          console.error(`[${row.id}] Reconnect failed (${reason}):`, error);
        });
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();
  }

  async createSession(
    sessionId: string,
    name: string,
    deviceName?: string,
    phoneNumber?: string
  ): Promise<string> {
    const db = getDb();

    // Unblock this session (user is explicitly creating it)
    this.blockedSessions.delete(sessionId);

    db.prepare(
      `INSERT INTO sessions (id, name, status, device_name, created_at, updated_at)
       VALUES (?, ?, 'connecting', ?, datetime('now'), datetime('now'))`
    ).run(sessionId, name, deviceName || 'WAutoChat');

    // Start client initialization in the background (don't await)
    // The QR code will be available via polling /api/sessions/[id]/qr
    this.initClient(sessionId, deviceName, phoneNumber).catch((error) => {
      console.error(`[${sessionId}] Failed to initialize client:`, error);
      this.updateSessionStatus(sessionId, 'failed');
    });

    return sessionId;
  }

  private async initClient(
    sessionId: string,
    deviceName?: string,
    phoneNumber?: string
  ): Promise<void> {
    const db = getDb();
    const userDataDir = browserDataDirFor(sessionId);

    try {
      this.updateSessionStatus(sessionId, 'connecting');
      console.log(`[${sessionId}] Starting WPPConnect browser...`);
      fs.mkdirSync(userDataDir, { recursive: true });

      // Wrap create() with a timeout to avoid infinite hanging
      const createWithTimeout = (timeoutMs: number) => {
        return new Promise<Awaited<ReturnType<typeof create>>>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`WPPConnect create() timed out after ${timeoutMs / 1000}s`));
          }, timeoutMs);

          // Capture manager instance — needed inside regular-function callbacks
          // where arrow functions can't be used (we rely on `.call(this,...)` binding).
          const managerRef = this;

          // Sanitize phone number: strip +, spaces, dashes — wa-js expects digits only
          const sanitizedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : undefined;

          // In pair code mode: catchQR fires once the QR canvas is ready (this = HostLayer,
          // which has this.page). We call WPP.conn.genLinkDeviceCodeForPhoneNumber directly
          // via page.evaluate — bypasses wppconnect's internal scrapeImg dependency.
          // In QR mode: catchQR stores the base64 normally.
          const catchQRCallback = sanitizedPhone
            ? async function (this: { page: { evaluate: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> } }) {
                console.log(`[${sessionId}] QR canvas ready — generating pair code for ${sanitizedPhone}`);
                for (let attempt = 1; attempt <= 3; attempt++) {
                  type Result = { ok: true; code: string } | { ok: false; rateLimit: boolean; detail: string };
                  const result = await this.page.evaluate(async (phone: unknown) => {
                    try {
                      type WPPWin = { WPP: { conn: { isRegistered: () => boolean; genLinkDeviceCodeForPhoneNumber: (p: string) => Promise<string> } } };
                      const WPP = (window as unknown as WPPWin).WPP;
                      // Wait until the WS is stable: isRegistered() returns false without throwing
                      for (let i = 0; i < 40; i++) {
                        try { if (WPP.conn.isRegistered() === false) break; } catch { /* not ready yet */ }
                        await new Promise(r => setTimeout(r, 250));
                      }
                      const code = await WPP.conn.genLinkDeviceCodeForPhoneNumber(phone as string);
                      return { ok: true, code } as { ok: true; code: string };
                    } catch (err) {
                      const detail = (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
                      const rateLimit = detail.includes('rate-overlimit') || detail.includes('429') || detail.includes('RateOverlimit');
                      return { ok: false, rateLimit, detail } as { ok: false; rateLimit: boolean; detail: string };
                    }
                  }, sanitizedPhone) as Result;

                  if (result.ok) {
                    // Don't log the pair code itself — anyone with disk access
                    // to the logs could pair the session.
                    console.log(`[${sessionId}] Pair code generated on attempt ${attempt}`);
                    managerRef.pairCodes.set(sessionId, result.code);
                    managerRef.updateSessionStatus(sessionId, 'qr_ready');
                    return;
                  }

                  if (result.rateLimit) {
                    console.warn(`[${sessionId}] WhatsApp rate-limited pair code for ${sanitizedPhone} (attempt ${attempt}/3). Waiting 15s…`);
                    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 15000));
                  } else {
                    console.warn(`[${sessionId}] Pair code attempt ${attempt}/3 failed: ${result.detail}`);
                    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 4000));
                  }
                }
                console.error(`[${sessionId}] Could not generate pair code for ${sanitizedPhone} after 3 attempts`);
              }
            : (base64Qr: string, _asciiQR: string, attempts: number) => {
                console.log(`[${sessionId}] QR code generated (attempt ${attempts})`);
                managerRef.qrCodes.set(sessionId, base64Qr);
                managerRef.updateSessionStatus(sessionId, 'qr_ready');
              };

          create({
            session: sessionId,
            headless: true,
            useChrome: false,
            autoClose: 0,
            deviceName: deviceName || 'WAutoChat',
            logQR: false,
            disableWelcome: true,
            folderNameToken: TOKENS_PATH,
            updatesLog: false,
            puppeteerOptions: {
              userDataDir,
            },
            browserArgs: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--no-first-run',
              '--disable-extensions',
            ],
            catchQR: catchQRCallback as (base64Qr: string, asciiQR: string, attempts: number, urlCode?: string) => void,
            catchLinkCode: (code: string) => {
              // Don't log the code itself — sensitive auth material.
              console.log(`[${sessionId}] Pair code generated`);
              managerRef.pairCodes.set(sessionId, code);
              managerRef.updateSessionStatus(sessionId, 'qr_ready');
            },
            statusFind: (statusSession: string) => {
              console.log(`[${sessionId}] Status: ${statusSession}`);
              if (
                statusSession === 'isLogged' ||
                statusSession === 'qrReadSuccess'
              ) {
                this.updateSessionStatus(sessionId, 'connected');
                this.qrCodes.delete(sessionId);
                this.pairCodes.delete(sessionId);
              } else if (statusSession === 'inChat') {
                // "inChat" can also appear before a QR is shown on unpaired sessions.
                // Only treat it as connected when no QR/pair code is pending for this session.
                if (!this.qrCodes.has(sessionId) && !this.pairCodes.has(sessionId)) {
                  this.updateSessionStatus(sessionId, 'connected');
                }
              } else if (statusSession === 'notLogged') {
                // Only downgrade status if we're NOT already connected.
                // WPPConnect sometimes emits notLogged spuriously after login.
                const currentSession = this.sessions.get(sessionId);
                if (!currentSession || currentSession.status !== 'connected') {
                  this.updateSessionStatus(
                    sessionId,
                    (this.qrCodes.has(sessionId) || this.pairCodes.has(sessionId)) ? 'qr_ready' : 'connecting'
                  );
                }
              } else if (
                statusSession === 'browserClose' ||
                statusSession === 'disconnectedMobile' ||
                statusSession === 'desconnectedMobile' ||
                statusSession === 'deleteToken'
              ) {
                // wppconnect fires disconnectedMobile as a false positive on fresh sessions:
                // the isRegistered() poll sees null→false and fires immediately.
                // Only treat this as a real disconnect if the session was already connected.
                const activeSession = this.sessions.get(sessionId);
                if (!activeSession || activeSession.status !== 'connected') {
                  // Still in pairing phase — ignore spurious disconnect events.
                  return;
                }
                this.updateSessionStatus(sessionId, 'disconnected');
                this.qrCodes.delete(sessionId);
                this.pairCodes.delete(sessionId);
                // Block this session from being auto-reconnected again
                this.blockedSessions.add(sessionId);
                // Session was logged out from the phone - stop auto-reconnect loop
                void this.disconnectSession(sessionId).catch(() => {});
              }
            },
          })
            .then((client) => {
              clearTimeout(timer);
              resolve(client);
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        });
      };

      const client = await createWithTimeout(300000); // 5 min timeout

      console.log(`[${sessionId}] Browser started successfully.`);

      // Write lock with browser PID for THIS session only
      try {
        const pid = await client.getPID();
        if (pid) writeLock(sessionId, pid);
      } catch { /* ignore */ }

      this.sessions.set(sessionId, {
        client,
        sessionId,
        status: 'connected',
      });

      this.updateSessionStatus(sessionId, 'connected');
      this.qrCodes.delete(sessionId);

      console.log(`[${sessionId}] Fetching phone number via page.evaluate...`);
      try {
        const phoneRaw = await Promise.race<string | null>([
          client.page.evaluate(() => {
            try {
              type WPPConn = { getMyUserId?: () => { user?: string; _serialized?: string } | undefined; getMe?: () => { id?: string; user?: string; wid?: string } };
              type WPPWin = { WPP?: { conn?: WPPConn }; WAPI?: { getWid?: () => string } };
              const w = window as unknown as WPPWin;
              const digits = (raw: string) => raw.replace(/@c\.us$/i, '').replace(/\D/g, '');
              const wid = w.WPP?.conn?.getMyUserId?.();
              if (wid?.user) return digits(wid.user);
              if (wid?._serialized) return digits(wid._serialized);
              const me = w.WPP?.conn?.getMe?.();
              if (me) {
                const raw = (me.id || me.wid || me.user || '') as string;
                const d = digits(raw);
                if (d) return d;
              }
              const widStr = w.WAPI?.getWid?.() as string | undefined;
              if (widStr) return digits(widStr);
              return null;
            } catch {
              return null;
            }
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        console.log(`[${sessionId}] phone fetched:`, phoneRaw);
        if (phoneRaw) {
          db.prepare(`UPDATE sessions SET phone = ?, updated_at = datetime('now') WHERE id = ?`).run(phoneRaw, sessionId);
        }
      } catch (e) {
        console.log(`[${sessionId}] Could not fetch phone:`, e);
      }

      this.registerEventHandlers(sessionId, client);
    } catch (error) {
      console.error(`[${sessionId}] initClient failed:`, error);
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

      // Trigger "Message Read" flows when ack = 3 (read)
      if (ackValue === 3) {
        this.triggerFlowsByEvent(sessionId, 'message_read', ackData).catch(() => {});
      }
    });

    client.onStateChange((state) => {
      console.log(`[${sessionId}] State changed: ${state}`);
      if (state === 'CONNECTED') {
        this.updateSessionStatus(sessionId, 'connected');
        void this.refreshHostPhone(sessionId).then((phone) => {
          if (phone) console.log(`[${sessionId}] phone refreshed on CONNECTED: ${phone}`);
        });
      } else if (state === 'CONFLICT') {
        // CONFLICT means WhatsApp is open on another device
        // Just call useHere() to reclaim, don't reconnect
        console.log(`[${sessionId}] CONFLICT detected, reclaiming session...`);
        client.useHere().catch(() => {});
      } else if (state === 'UNPAIRED') {
        // Session was logged out from phone - mark as disconnected
        // Don't auto-reconnect to avoid zombie browser loops
        console.log(`[${sessionId}] UNPAIRED - session logged out`);
        this.updateSessionStatus(sessionId, 'disconnected');
      } else if (state === 'UNLAUNCHED') {
        console.log(`[${sessionId}] UNLAUNCHED - browser closed`);
        this.updateSessionStatus(sessionId, 'disconnected');
      }
    });


    client.onIncomingCall(async (call) => {
      const callData = call as unknown as Record<string, unknown>;
      console.log(`[${sessionId}] Incoming call from:`, callData.peerJid);
      const isVideo = !!callData.isVideo;
      this.triggerFlowsByEvent(sessionId, 'incoming_call', callData, (config) => {
        const callType = (config.callType as string) || 'any';
        if (callType === 'any') return true;
        if (callType === 'video') return isVideo;
        if (callType === 'voice') return !isVideo;
        return true;
      }).catch(() => {});
    });

    client.onAddedToGroup(async (chat) => {
      const db = getDb();
      const chatData = chat as unknown as Record<string, unknown>;
      const groupId = uuidv4();
      const chatId = uuidv4();
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
      ).run(chatId, sessionId, wppId, name);

      // Fetch group profile pic in background
      try {
        const activeSession = this.sessions.get(sessionId);
        if (activeSession) {
          const pic = await activeSession.client.getProfilePicFromServer(wppId);
          let picUrl = '';
          const picAny = pic as unknown;
          if (typeof picAny === 'string' && picAny.startsWith('http')) picUrl = picAny;
          else if (picAny && typeof picAny === 'object') {
            const picObj = picAny as Record<string, unknown>;
            picUrl = (picObj.eurl as string) || (picObj.imgFull as string) || '';
          }
          if (picUrl) {
            db.prepare(`UPDATE chats SET profile_pic_url = ? WHERE session_id = ? AND wpp_id = ?`).run(picUrl, sessionId, wppId);
            db.prepare(`UPDATE groups_table SET profile_pic_url = ? WHERE session_id = ? AND wpp_id = ?`).run(picUrl, sessionId, wppId);
          }
        }
      } catch {
        // Profile pic may not be available
      }

      // Trigger "Added to Group" flows
      this.triggerFlowsByEvent(sessionId, 'added_to_group', chatData).catch(() => {});
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

      // Trigger group_joined / group_left flows
      const triggerType = data.action === 'add' ? 'group_joined' :
                          data.action === 'remove' ? 'group_left' : null;
      if (triggerType) {
        this.triggerFlowsByEvent(sessionId, triggerType, data, (config) => {
          const filterGroupId = (config.groupId as string) || '';
          if (filterGroupId && filterGroupId !== groupId) return false;
          return true;
        }).catch(() => {});
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

      // Trigger reaction_received flows
      this.triggerFlowsByEvent(sessionId, 'reaction_received', reactionData, (config) => {
        const filterEmoji = (config.emoji as string) || '';
        if (filterEmoji && filterEmoji !== body) return false;
        return true;
      }).catch(() => {});
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

      // Trigger poll_response flows
      this.triggerFlowsByEvent(sessionId, 'poll_response', pollData).catch(() => {});
    });

    // Message Edit trigger
    try {
      const clientAny = client as unknown as { onMessageEdit?: (cb: (m: unknown) => void) => void };
      if (typeof clientAny.onMessageEdit === 'function') {
        clientAny.onMessageEdit((edited: unknown) => {
          const editData = edited as Record<string, unknown>;
          this.triggerFlowsByEvent(sessionId, 'message_edited', editData).catch(() => {});
        });
      }
    } catch { /* event not available in this version */ }

    // Message Revoked/Deleted trigger
    try {
      const clientAny = client as unknown as { onRevokedMessage?: (cb: (m: unknown) => void) => void };
      if (typeof clientAny.onRevokedMessage === 'function') {
        clientAny.onRevokedMessage((revoked: unknown) => {
          const revokedData = revoked as Record<string, unknown>;
          this.triggerFlowsByEvent(sessionId, 'message_deleted', revokedData).catch(() => {});
        });
      }
    } catch { /* event not available */ }

    // Presence Changed trigger
    try {
      const clientAny = client as unknown as { onPresenceChanged?: (cb: (p: unknown) => void) => void };
      if (typeof clientAny.onPresenceChanged === 'function') {
        clientAny.onPresenceChanged((presence: unknown) => {
          const pData = presence as Record<string, unknown>;
          const state = (pData.isOnline as boolean) ? 'available' :
                        (pData.isTyping as boolean) ? 'composing' :
                        (pData.isRecording as boolean) ? 'recording' :
                        (pData.state as string) || 'unavailable';
          this.triggerFlowsByEvent(sessionId, 'presence_changed', pData, (config) => {
            const filterState = (config.presenceState as string) || 'any';
            if (filterState === 'any') return true;
            return filterState === state;
          }).catch(() => {});
        });
      }
    } catch { /* event not available */ }

    // Label events — onUpdateLabel fires for assign/unassign.
    // For created/updated/deleted we poll getAllLabels() and diff.
    try {
      const clientAny = client as unknown as {
        onUpdateLabel?: (cb: (l: unknown) => void) => void;
      };
      if (typeof clientAny.onUpdateLabel === 'function') {
        clientAny.onUpdateLabel((labelUpdate: unknown) => {
          const lData = labelUpdate as Record<string, unknown>;
          const changeType = (lData.type as string) || 'add';
          const labels = (lData.labels as Array<Record<string, unknown>>) || [];
          const chat = (lData.chat as Record<string, unknown>) || {};
          const chatWppId = (chat.id as Record<string, unknown>)?._serialized as string
            || (chat.id as string) || '';
          const isGroupTarget = !!chat.isGroup || chatWppId.endsWith('@g.us');

          const triggerType = changeType === 'remove' ? 'label_unassigned' : 'label_assigned';

          for (const label of labels) {
            const eventData: Record<string, unknown> = {
              ...lData,
              label,
              labelName: label.name,
              labelId: label.id,
              labelColor: label.hexColor || label.color,
              chatId: chatWppId,
              targetType: isGroupTarget ? 'group' : 'chat',
            };
            this.triggerFlowsByEvent(sessionId, triggerType, eventData, (config) =>
              this.matchLabelFilters(config, eventData)
            ).catch(() => {});
          }
        });
      }
    } catch { /* event not available */ }

    // Polling for created / updated / deleted labels
    this.startLabelPolling(sessionId, client);
  }

  // Per-session label snapshot used to diff against getAllLabels() poll
  private labelSnapshots: Map<string, Map<string, { name: string; color: string }>> = new Map();
  private labelPollTimers: Map<string, NodeJS.Timeout> = new Map();

  private startLabelPolling(sessionId: string, client: Whatsapp): void {
    // Clear any previous timer for this session
    const prev = this.labelPollTimers.get(sessionId);
    if (prev) clearInterval(prev);

    const clientAny = client as unknown as { getAllLabels?: () => Promise<Array<Record<string, unknown>>> };
    if (typeof clientAny.getAllLabels !== 'function') return;

    const poll = async () => {
      try {
        if (!this.sessions.has(sessionId)) return;
        const labels = await clientAny.getAllLabels!();
        const current = new Map<string, { name: string; color: string }>();
        for (const l of labels || []) {
          const id = String(l.id || '');
          if (!id) continue;
          current.set(id, {
            name: (l.name as string) || '',
            color: ((l.hexColor as string) || (l.color as string) || '').toString(),
          });
        }

        const previous = this.labelSnapshots.get(sessionId);
        if (previous) {
          // Detect created
          for (const [id, cur] of current) {
            if (!previous.has(id)) {
              const eventData: Record<string, unknown> = { labelId: id, labelName: cur.name, labelColor: cur.color };
              this.triggerFlowsByEvent(sessionId, 'label_created', eventData, (config) =>
                this.matchLabelFilters(config, eventData)
              ).catch(() => {});
            }
          }
          // Detect updated (name or color change)
          for (const [id, cur] of current) {
            const prevLabel = previous.get(id);
            if (prevLabel && (prevLabel.name !== cur.name || prevLabel.color !== cur.color)) {
              const eventData: Record<string, unknown> = {
                labelId: id,
                labelName: cur.name,
                labelColor: cur.color,
                previousName: prevLabel.name,
                previousColor: prevLabel.color,
              };
              this.triggerFlowsByEvent(sessionId, 'label_updated', eventData, (config) =>
                this.matchLabelFilters(config, eventData)
              ).catch(() => {});
            }
          }
          // Detect deleted
          for (const [id, prevLabel] of previous) {
            if (!current.has(id)) {
              const eventData: Record<string, unknown> = { labelId: id, labelName: prevLabel.name, labelColor: prevLabel.color };
              this.triggerFlowsByEvent(sessionId, 'label_deleted', eventData, (config) =>
                this.matchLabelFilters(config, eventData)
              ).catch(() => {});
            }
          }
        }
        this.labelSnapshots.set(sessionId, current);
      } catch { /* WhatsApp may not be ready yet */ }
    };

    // Warm up the snapshot immediately, then poll every 30s
    void poll();
    const timer = setInterval(poll, 30000);
    this.labelPollTimers.set(sessionId, timer);
  }

  private stopLabelPolling(sessionId: string): void {
    const timer = this.labelPollTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.labelPollTimers.delete(sessionId);
    }
    this.labelSnapshots.delete(sessionId);
  }

  // Applies all label filter options from the node config
  private matchLabelFilters(
    config: Record<string, unknown>,
    event: Record<string, unknown>
  ): boolean {
    const labelName = (event.labelName as string) || '';
    const labelColor = ((event.labelColor as string) || '').toLowerCase();
    const targetType = (event.targetType as string) || '';
    const targetId = (event.chatId as string) || '';

    // Name filter with match mode
    const filterRaw = ((config.labelName as string) || '').trim();
    if (filterRaw) {
      const mode = (config.labelMatchMode as string) || 'exact';
      const names = filterRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const lowerLabel = labelName.toLowerCase();
      const matched = names.some((n) => {
        const lowerN = n.toLowerCase();
        if (mode === 'contains') return lowerLabel.includes(lowerN);
        if (mode === 'startsWith') return lowerLabel.startsWith(lowerN);
        if (mode === 'regex') {
          try { return new RegExp(n, 'i').test(labelName); } catch { return false; }
        }
        return lowerLabel === lowerN;
      });
      if (!matched) return false;
    }

    // Color filter
    const colorFilter = ((config.labelColor as string) || '').trim().toLowerCase();
    if (colorFilter && labelColor && labelColor !== colorFilter) return false;

    // Target type filter (only meaningful for assigned/unassigned)
    const targetFilter = (config.labelTargetType as string) || 'any';
    if (targetFilter !== 'any' && targetType) {
      if (targetFilter === 'contact' && targetType !== 'chat') return false;
      if (targetFilter === 'chat' && targetType === 'group') return false;
      if (targetFilter === 'group' && targetType !== 'group') return false;
    }

    // Specific target ID
    const targetIdFilter = ((config.labelTargetId as string) || '').trim();
    if (targetIdFilter && targetId && targetIdFilter !== targetId) return false;

    // Label count comparison (e.g. ">2", "<=5", "=1")
    const countFilter = ((config.labelCountFilter as string) || '').trim();
    if (countFilter) {
      const labelsArr = (event.labels as unknown[]) || [];
      const count = Array.isArray(labelsArr) ? labelsArr.length : 0;
      const m = countFilter.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
      if (m) {
        const op = m[1] || '=';
        const threshold = parseInt(m[2], 10);
        if (op === '>' && !(count > threshold)) return false;
        if (op === '<' && !(count < threshold)) return false;
        if (op === '>=' && !(count >= threshold)) return false;
        if (op === '<=' && !(count <= threshold)) return false;
        if (op === '=' && count !== threshold) return false;
      }
    }

    return true;
  }

  /**
   * Decrypt and cache a media message's binary payload on disk immediately
   * after the message is received. Running during `onMessage` is critical:
   * wppconnect still holds the message in memory so `decryptFile` works
   * without hitting the "msgChunks" error we get on older messages.
   *
   * On success, updates the DB so `media_url` points to our internal proxy
   * endpoint and future page loads are served from disk cache.
   */
  private async cacheMediaInBackground(
    client: Whatsapp,
    message: Record<string, unknown>,
    msgId: string,
    fallbackMime: string
  ): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const CACHE_DIR = path.join(getDataDir(), 'media');

    try {
      const clientAny = client as unknown as {
        decryptFile: (m: unknown) => Promise<Buffer>;
        downloadMedia: (id: string) => Promise<string | Buffer>;
      };

      let buf: Buffer | null = null;
      let mime = fallbackMime || 'application/octet-stream';

      // Primary path: decryptFile with the fresh message object.
      try {
        const decrypted = await clientAny.decryptFile(message);
        if (decrypted && decrypted.length > 0) {
          buf = decrypted;
          const m = message as Record<string, unknown>;
          if (typeof m.mimetype === 'string' && m.mimetype) mime = m.mimetype;
        }
      } catch {
        // Fallback: downloadMedia via the message id.
        const wppMsgId =
          (message.id as Record<string, unknown>)?._serialized as string ||
          (message.id as string) || '';
        if (wppMsgId) {
          try {
            const result = await clientAny.downloadMedia(wppMsgId);
            if (typeof result === 'string') {
              if (result.startsWith('data:')) {
                const [header, payload] = result.split(',', 2);
                const mt = /data:([^;]+);base64/.exec(header);
                if (mt) mime = mt[1];
                buf = Buffer.from(payload || '', 'base64');
              } else {
                buf = Buffer.from(result, 'base64');
              }
            } else if (result) {
              buf = result as Buffer;
            }
          } catch {
            /* give up */
          }
        }
      }

      if (!buf || buf.length === 0) return;

      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(path.join(CACHE_DIR, msgId), buf);

      const db = getDb();
      db.prepare(
        `UPDATE messages SET media_url = ?, media_type = ? WHERE id = ?`
      ).run(`/api/messages/${msgId}/media`, mime, msgId);
    } catch (err) {
      console.warn('[cacheMediaInBackground] error:', err);
    }
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
    // fromMe can live on m.id (the MsgKey) — same reconciliation as the
    // history fetch in app/api/messages/route.ts, kept aligned on purpose.
    const msgIdObj = message.id as Record<string, unknown> | undefined;
    const fromMe = !!(message.fromMe || msgIdObj?.fromMe || (message as Record<string, unknown>).__x_isSentByMe);
    const isGroup = !!(message.isGroupMsg);

    // Determine message type — use message.type as primary source (set by wppconnect)
    // then fall back to mimetype for unknown media. This avoids stickers being
    // classified as 'image' because they share mimetype 'image/webp'.
    let type = 'text';
    const rawMsgType = (message.type as string) || 'chat';
    switch (rawMsgType) {
      case 'image':        type = 'image';    break;
      case 'video':        type = 'video';    break;
      case 'ptt':          type = 'ptt';      break;
      case 'audio':        type = 'audio';    break;
      case 'document':     type = 'document'; break;
      case 'sticker':      type = 'sticker';  break;
      case 'location':
      case 'live_location':type = 'location'; break;
      case 'vcard':
      case 'multi_vcard':  type = 'contact';  break;
      case 'list':
      case 'list_response':type = 'list';     break;
      case 'poll_creation':type = 'poll';     break;
      case 'chat':         type = 'text';     break;
      default:
        // Unknown type — fall back to mimetype if it's flagged as media
        if (message.isMedia || message.isMMS) {
          const mimetype = (message.mimetype as string) || '';
          if (mimetype.startsWith('image/'))      type = 'image';
          else if (mimetype.startsWith('video/')) type = 'video';
          else if (mimetype.startsWith('audio/')) type = 'audio';
          else                                    type = 'document';
        }
    }

    // Helper: fetch profile pic URL from WPPConnect (non-blocking)
    const fetchProfilePic = async (contactId: string): Promise<string> => {
      try {
        const activeSession = this.sessions.get(sessionId);
        if (!activeSession) return '';
        const pic = await activeSession.client.getProfilePicFromServer(contactId);
        const picAny = pic as unknown;
        if (typeof picAny === 'string' && picAny.startsWith('http')) return picAny;
        if (picAny && typeof picAny === 'object') {
          const picObj = picAny as Record<string, unknown>;
          return (picObj.eurl as string) || (picObj.imgFull as string) || '';
        }
        return '';
      } catch {
        return '';
      }
    };

    // Ensure chat exists
    let chatRow = db.prepare(
      `SELECT id, profile_pic_url FROM chats WHERE session_id = ? AND wpp_id = ?`
    ).get(sessionId, wppChatId) as { id: string; profile_pic_url?: string } | undefined;

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

      // Fetch profile pic in background for new chat
      fetchProfilePic(wppChatId).then((picUrl) => {
        if (picUrl) {
          db.prepare(`UPDATE chats SET profile_pic_url = ? WHERE id = ?`).run(picUrl, chatId);
        }
      });
    } else if (!chatRow.profile_pic_url) {
      // Update profile pic for existing chat that has none
      fetchProfilePic(wppChatId).then((picUrl) => {
        if (picUrl) {
          db.prepare(`UPDATE chats SET profile_pic_url = ? WHERE id = ?`).run(picUrl, chatRow!.id);
        }
      });
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

    // For media messages, kick off a background download right now while the
    // `message` object is still fresh in wppconnect's memory. This avoids the
    // dreaded `msgChunks` error that happens when we try to download older
    // messages after the chat cache has been evicted.
    if (['image', 'video', 'audio', 'ptt', 'sticker', 'document'].includes(type)) {
      const client = this.sessions.get(sessionId)?.client;
      if (client) {
        this.cacheMediaInBackground(client, message, msgId, mediaType || '').catch(
          (err) => {
            console.warn(`[${sessionId}] Media cache failed for ${msgId}:`, err?.message || err);
          }
        );
      }
    }

    // Update chat
    db.prepare(
      `UPDATE chats SET last_message_id = ?, unread_count = CASE WHEN ? = 0 THEN unread_count + 1 ELSE unread_count END, updated_at = datetime('now') WHERE id = ?`
    ).run(msgId, fromMe ? 1 : 0, chatRow.id);

    // Ensure contact exists for non-group direct messages
    let isNewContact = false;
    if (!isGroup && !fromMe) {
      const contactWppId = sender;
      const existing = db.prepare(
        `SELECT id, profile_pic_url FROM contacts WHERE session_id = ? AND wpp_id = ?`
      ).get(sessionId, contactWppId) as { id: string; profile_pic_url?: string } | undefined;

      if (!existing) {
        isNewContact = true;
        const contactId = uuidv4();
        db.prepare(
          `INSERT INTO contacts (id, session_id, wpp_id, name, push_name, phone, is_wa_contact, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
        ).run(contactId, sessionId, contactWppId, senderName || contactWppId, senderName, contactWppId.replace('@c.us', ''));

        // Fetch profile pic in background for new contact
        fetchProfilePic(contactWppId).then((picUrl) => {
          if (picUrl) {
            db.prepare(`UPDATE contacts SET profile_pic_url = ? WHERE id = ?`).run(picUrl, contactId);
          }
        });
      } else if (!existing.profile_pic_url) {
        // Update profile pic for existing contact that has none
        fetchProfilePic(contactWppId).then((picUrl) => {
          if (picUrl) {
            db.prepare(`UPDATE contacts SET profile_pic_url = ? WHERE id = ?`).run(picUrl, existing.id);
          }
        });
      }
    }

    // Trigger "New Contact" flows when first message from unknown contact
    if (isNewContact) {
      this.triggerFlowsByEvent(sessionId, 'new_contact', message).catch(() => {});
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

  /**
   * Check whether a conversation is currently paused at a specific wait-for-reply node.
   * Used by the flow-engine timeout scheduler to avoid sending the timeout message
   * if the user already replied and the flow resumed.
   */
  isPausedAt(sessionId: string, chatId: string, flowId: string, waitNodeId: string): boolean {
    const key = `${sessionId}:${chatId}:${flowId}`;
    const paused = this.pausedConversations.get(key);
    return !!paused && paused.resumeAfterNodeId === waitNodeId;
  }

  /**
   * Clear a paused conversation entry. Called when the wait-for-reply timeout fires
   * so the chat isn't stuck waiting forever.
   */
  clearPausedConversation(sessionId: string, chatId: string, flowId: string): void {
    const key = `${sessionId}:${chatId}:${flowId}`;
    this.pausedConversations.delete(key);
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

    // Ignore system chats (status broadcasts)
    if (chatId === 'status@broadcast' || chatId.endsWith('@broadcast')) {
      return;
    }

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
        const shouldTrigger = this.checkTrigger(triggerType, triggerNode.data.config, body, msgType, isGroup, message);

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

  /**
   * Trigger flows for event-based triggers (not message-based).
   * Used for: reaction, call, presence, edit, delete, poll, ack, label, group events.
   */
  private async triggerFlowsByEvent(
    sessionId: string,
    triggerType: string,
    eventData: Record<string, unknown>,
    matcher?: (config: Record<string, unknown>) => boolean
  ): Promise<void> {
    const db = getDb();
    const session = this.getSession(sessionId);
    if (!session) return;

    const flowRows = db.prepare(
      `SELECT * FROM flows WHERE session_id = ? AND is_active = 1`
    ).all(sessionId) as Record<string, unknown>[];

    // Collect all matching flows first, then run them sequentially. If two
    // flows share the same exclusive trigger (e.g. keyword "menu"), only the
    // most recently updated one runs so the user doesn't get N parallel
    // replies clobbering each other's variables.
    type Candidate = { flow: Flow; updatedAt: string; exclusive: boolean };
    const candidates: Candidate[] = [];
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

        const flowTriggerType = (triggerNode.data.config?.triggerType as string) || '';
        if (flowTriggerType !== triggerType) continue;

        if (matcher && !matcher(triggerNode.data.config || {})) continue;

        // Triggers that respond to one specific message ("keyword", "regex",
        // "message_received", "media_received", "contact_message") are
        // exclusive: at most one flow should answer. Event-style triggers
        // (schedule, added_to_group, …) can fan out to all listeners.
        const exclusive = ['keyword', 'regex', 'message_received', 'media_received', 'contact_message'].includes(triggerType);
        candidates.push({ flow, updatedAt: flow.updatedAt, exclusive });
      } catch (err) {
        console.error(`[${sessionId}] Error parsing flow "${row.name}":`, err);
      }
    }

    if (candidates.length === 0) return;

    candidates.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));

    const exclusiveOnly = candidates.some((c) => c.exclusive);
    const toRun = exclusiveOnly ? [candidates[0]] : candidates;

    for (const { flow } of toRun) {
      try {
        console.log(`[${sessionId}] Triggering flow "${flow.name}" (${triggerType})`);
        const log = await executeFlow(flow, eventData, session);
        console.log(`[${sessionId}] Flow "${flow.name}" completed:`, log.length, 'steps');
      } catch (err) {
        console.error(`[${sessionId}] Error in event flow "${flow.name}":`, err);
      }
    }
  }

  private checkTrigger(
    triggerType: string,
    config: Record<string, unknown>,
    body: string,
    msgType: string,
    isGroup: boolean,
    message?: Record<string, unknown>
  ): boolean {
    // chatId: group JID in groups, contact JID in private. Can be Wid object or plain string.
    const chatId =
      (message?.chatId as Record<string, unknown>)?._serialized as string ||
      (message?.chatId as string) ||
      (message?.to as string) ||
      (message?.from as string) || '';

    const caption = (message?.caption as string) || '';

    // message.from is always a plain string ("xxxxxxx@c.us") per wppconnect model.
    // In groups: from = individual sender JID; chatId = group JID.
    const sender =
      (message?.sender as Record<string, unknown>)?.id as string ||
      (message?.from as string) ||
      (message?.author as string) || '';

    const applyCommonFilters = (): boolean => {
      if (!message) return true;

      const quotedMsgId =
        (message.quotedMsgId as Record<string, unknown>)?._serialized as string ||
        (message.quotedMsgId as string) || '';
      const quotedFromMe = !!quotedMsgId && !!((message.quotedMsg as Record<string, unknown>)?.fromMe);
      const isBroadcast = chatId.endsWith('@broadcast') || chatId === 'status@broadcast';

      return applyTriggerFilters(config, {
        body,
        caption,
        msgType,
        isGroup,
        isBroadcast,
        sender,
        chatId,
        fromMe: !!(message.fromMe),
        mentionedJidList: (message.mentionedJidList as string[]) || [],
        isForwarded: !!(message.isForwarded),
        quotedMsgId,
        quotedFromMe,
      });
    };

    switch (triggerType) {
      case 'message_received':
        return applyCommonFilters();

      case 'keyword': {
        if (!applyCommonFilters()) return false;
        const keywords = ((config?.keywords as string) || '').split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean);
        if (keywords.length === 0) return true;
        const matchLocation = (config?.matchLocation as string) || 'body';
        const searchText =
          matchLocation === 'caption' ? caption.toLowerCase() :
          matchLocation === 'both' ? (body + ' ' + caption).toLowerCase() :
          body.toLowerCase();
        const matchMode = (config?.matchMode as string) || 'contains';
        if (matchMode === 'exact') return keywords.some((k) => searchText === k);
        return keywords.some((k) => searchText.includes(k));
      }

      case 'regex': {
        if (!applyCommonFilters()) return false;
        const pattern = (config?.pattern as string) || '';
        if (!pattern) return false;
        try {
          return new RegExp(pattern, 'i').test(body);
        } catch {
          return false;
        }
      }

      case 'direct_message':
        return !isGroup && applyCommonFilters();

      case 'group_message': {
        if (!isGroup || !applyCommonFilters()) return false;
        const filterGroupId = (config?.groupId as string) || '';
        if (filterGroupId && chatId !== filterGroupId) return false;
        return true;
      }

      case 'contact_message': {
        if (isGroup || !applyCommonFilters()) return false;
        const phone = (config?.contactPhone as string) || (config?.contactId as string) || '';
        if (!phone) return true;
        const expectedWppId = phone.includes('@') ? phone : `${phone}@c.us`;
        return chatId === expectedWppId;
      }

      case 'new_contact':
        return false; // Handled by dedicated check in handleIncomingMessage

      case 'media_received': {
        if (!applyCommonFilters()) return false;
        const allowedTypes = (config?.mediaTypes as string[]) || [];
        const mediaTypes = ['image', 'video', 'audio', 'ptt', 'document'];
        if (!mediaTypes.includes(msgType)) return false;
        if (allowedTypes.length === 0 || allowedTypes.includes('any')) return true;
        return allowedTypes.includes(msgType);
      }

      case 'sticker_received':
        return msgType === 'sticker' && applyCommonFilters();

      case 'location_received':
        return msgType === 'location' && applyCommonFilters();

      case 'contact_card_received':
        return (msgType === 'vcard' || msgType === 'contact' || msgType === 'multi_vcard') && applyCommonFilters();

      case 'link_received': {
        if (!applyCommonFilters()) return false;
        const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/i;
        return urlRegex.test(body);
      }

      case 'mention_received': {
        if (!applyCommonFilters()) return false;
        const mentionedIds = (message?.mentionedIds as string[]) || [];
        if (mentionedIds.length === 0) return false;
        const filterGroupId = (config?.groupId as string) || '';
        if (filterGroupId && chatId !== filterGroupId) return false;
        return true;
      }

      case 'reply_received': {
        if (!applyCommonFilters()) return false;
        const quoted = message?.quotedMsg || message?.quotedMsgId;
        if (!quoted) return false;
        const quotedData = quoted as Record<string, unknown>;
        return !!(quotedData.fromMe);
      }

      // Events handled by dedicated event handlers, not onMessage
      case 'added_to_group':
      case 'group_joined':
      case 'group_left':
      case 'reaction_received':
      case 'message_edited':
      case 'message_deleted':
      case 'poll_response':
      case 'message_read':
      case 'incoming_call':
      case 'presence_changed':
      case 'label_updated':
        return false;

      case 'webhook':
        return false; // Handled by webhook API route

      case 'schedule':
        return false; // Handled by cron

      default:
        return false;
    }
  }

  async connectSession(sessionId: string, phoneNumber?: string): Promise<void> {
    const db = getDb();
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;

    if (!session) {
      throw new Error('Session not found');
    }

    // User explicitly requested reconnect — unblock and force a fresh start.
    // Removing from reconnectPromises ensures the new call doesn't wait for
    // a stale in-flight promise (e.g. a previous 120 s timeout still running).
    this.blockedSessions.delete(sessionId);
    this.reconnectPromises.delete(sessionId);

    // Kill any in-memory browser handle left from a previous attempt so
    // performReconnectSession can start cleanly without conflict.
    const existing = this.sessions.get(sessionId);
    if (existing) {
      try { await existing.client.close(); } catch { /* ignore */ }
      this.sessions.delete(sessionId);
      clearLock(sessionId);
    }

    void this.reconnectSession(sessionId, phoneNumber).catch((error) => {
      console.error(`[${sessionId}] Failed to reconnect client:`, error);
      this.updateSessionStatus(sessionId, 'failed');
    });
  }

  async reconnectSession(sessionId: string, phoneNumber?: string): Promise<void> {
    const inFlight = this.reconnectPromises.get(sessionId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const reconnectPromise = this.performReconnectSession(sessionId, phoneNumber);
    this.reconnectPromises.set(sessionId, reconnectPromise);

    try {
      await reconnectPromise;
    } finally {
      this.reconnectPromises.delete(sessionId);
    }
  }

  private async performReconnectSession(sessionId: string, phoneNumber?: string): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      try {
        const state = await existing.client.getConnectionState();
        if (state === 'CONNECTED') {
          this.updateSessionStatus(sessionId, 'connected');
          return;
        }
      } catch {
        // Client handle is stale and needs a clean restart.
      }
    }

    // If Fast Refresh or a server restart dropped our in-memory handle but left
    // the headless browser alive, recover by stopping that orphaned browser first.
    if (!existing && isSessionRunning(sessionId)) {
      await terminateLockedBrowser(
        sessionId,
        'Recovering session after server reload'
      );
    }

    if (existing) {
      try {
        const pid = await existing.client.getPID();
        if (pid) {
          try { process.kill(pid); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      try { await existing.client.close(); } catch { /* ignore */ }
      this.sessions.delete(sessionId);
      clearLock(sessionId);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const db = getDb();
    const row = db.prepare(`SELECT device_name FROM sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return;

    console.log(`[${sessionId}] Reconnecting...`);
    this.updateSessionStatus(sessionId, 'connecting');

    try {
      await this.initClient(sessionId, row.device_name as string, phoneNumber);
      console.log(`[${sessionId}] Reconnected successfully.`);
    } catch (err) {
      console.error(`[${sessionId}] Reconnect failed:`, err);
      // Clean up any browser that started but didn't fully connect.
      clearLock(sessionId);
      this.sessions.delete(sessionId);
      this.updateSessionStatus(sessionId, 'disconnected');
    }
  }

  async disconnectSession(sessionId: string): Promise<void> {
    this.stopLabelPolling(sessionId);
    const activeSession = this.sessions.get(sessionId);
    if (activeSession) {
      const client = activeSession.client;
      this.sessions.delete(sessionId);

      const safeCall = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/Connection closed|Target closed|Session closed/i.test(msg)) {
            console.warn(`[${sessionId}] disconnect cleanup:`, msg);
          }
        }
      };

      await safeCall(() => client.logout());
      await safeCall(() => client.close());
      clearLock(sessionId);
    }
    this.qrCodes.delete(sessionId);
    this.updateSessionStatus(sessionId, 'disconnected');
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.disconnectSession(sessionId);

    const db = getDb();
    // Collect media files referenced by this session's messages so we can
    // wipe them off disk after the row deletion. Without this the media dir
    // grows forever every time the user deletes a session.
    const mediaRows = db.prepare(
      `SELECT id, media_url FROM messages WHERE session_id = ? AND (media_url IS NOT NULL OR id IS NOT NULL)`
    ).all(sessionId) as { id: string; media_url: string | null }[];

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

    // Best-effort filesystem cleanup. Errors here are non-fatal — the row is
    // already gone and orphan files are recoverable manually.
    void (async () => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const { getDataDir } = await import('@/lib/paths');
        const mediaDir = path.join(getDataDir(), 'media');
        for (const m of mediaRows) {
          const target = path.join(mediaDir, m.id);
          await fs.unlink(target).catch(() => { /* file already gone */ });
        }
      } catch (err) {
        console.error(`[deleteSession:${sessionId}] media cleanup failed:`, err);
      }
    })();
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

  /**
   * Ask WhatsApp Web for the host device metadata (phone number of the linked
   * account) and persist it. Safe to call on any session — returns silently
   * if the session isn't connected or the client is missing.
   */
  async refreshHostPhone(sessionId: string): Promise<string | null> {
    const active = this.sessions.get(sessionId);
    if (!active || !active.client) return null;
    try {
      const phoneRaw = await Promise.race<string | null>([
        active.client.page.evaluate(() => {
          try {
            type WPPConn = { getMyUserId?: () => { user?: string; _serialized?: string } | undefined; getMe?: () => { id?: string; user?: string; wid?: string } };
            type WPPWin = { WPP?: { conn?: WPPConn }; WAPI?: { getWid?: () => string } };
            const w = window as unknown as WPPWin;
            const digits = (raw: string) => raw.replace(/@c\.us$/i, '').replace(/\D/g, '');
            const wid = w.WPP?.conn?.getMyUserId?.();
            if (wid?.user) return digits(wid.user);
            if (wid?._serialized) return digits(wid._serialized);
            const me = w.WPP?.conn?.getMe?.();
            if (me) {
              const raw = (me.id || me.wid || me.user || '') as string;
              const d = digits(raw);
              if (d) return d;
            }
            const widStr = w.WAPI?.getWid?.() as string | undefined;
            if (widStr) return digits(widStr);
            return null;
          } catch {
            return null;
          }
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      if (!phoneRaw) return null;
      const db = getDb();
      db.prepare(
        `UPDATE sessions SET phone = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(phoneRaw, sessionId);
      return phoneRaw;
    } catch {
      return null;
    }
  }

  getClient(sessionId: string): Whatsapp | null {
    const activeSession = this.sessions.get(sessionId);
    if (!activeSession) return null;
    // Accept any status where the browser is alive (not failed/disconnected)
    // The client might be 'connecting', 'qr_ready' or 'connected' - all are usable if in memory
    if (activeSession.status === 'failed' || activeSession.status === 'disconnected') return null;
    return activeSession.client;
  }

  getQrCode(sessionId: string): string | null {
    return this.qrCodes.get(sessionId) || null;
  }

  getPairCode(sessionId: string): string | null {
    return this.pairCodes.get(sessionId) || null;
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
