import { create, Whatsapp } from '@wppconnect-team/wppconnect';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import type { Session, SessionStatus, Flow } from '@/lib/types';
import { executeFlow, resumeFlowAfterWait } from '@/lib/flow-engine';

// Store wppconnect tokens outside the project to avoid Turbopack crashes
const TOKENS_PATH = path.join(os.tmpdir(), 'wautochat-tokens');

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
      process.kill(pid);
    } catch {
      // Browser may already be exiting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
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

    const db = getDb();
    const rows = db.prepare(
      `SELECT id FROM sessions WHERE status = 'connected' ORDER BY updated_at DESC`
    ).all() as { id: string }[];

    // Clean up orphaned browsers from previous dev server runs
    // These are browsers that were opened by a prior Node.js process that's now dead
    for (const row of rows) {
      await terminateLockedBrowser(row.id, 'Cleaning up orphaned browser from previous run');
    }

    // Start sessions sequentially with 3s delay to avoid overload
    for (const row of rows) {
      void this.reconnectSession(row.id).catch((error) => {
        console.error(`[${row.id}] Auto-reconnect failed:`, error);
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
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

          // When pair code mode is requested we do NOT pass phoneNumber to create().
          // Instead we intercept catchQR (fires once WhatsApp has rendered the canvas
          // and has a valid QR URL) and call this.loginByCode() from there, using the
          // HostLayer `this` that wppconnect passes via .call(this, ...).
          const catchQRCallback = phoneNumber
            ? function (this: { loginByCode: (p: string) => Promise<void> }) {
                console.log(`[${sessionId}] QR canvas ready — requesting pair code for ${phoneNumber}`);
                this.loginByCode(phoneNumber).catch((err: Error) => {
                  console.error(`[${sessionId}] loginByCode failed:`, err);
                });
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
            autoClose: 300000,
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
              console.log(`[${sessionId}] Pair code generated: ${code}`);
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

      try {
        const hostDevice = await client.getHostDevice();
        if (hostDevice && (hostDevice as unknown as Record<string, unknown>).wid) {
          const wid = (hostDevice as unknown as Record<string, unknown>).wid as Record<string, unknown>;
          const phone = (wid.user as string) || '';
          db.prepare(`UPDATE sessions SET phone = ?, updated_at = datetime('now') WHERE id = ?`).run(
            phone,
            sessionId
          );
        }
      } catch {
        console.log(`[${sessionId}] Could not get host device info (may not be logged in yet).`);
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

        // Optional custom matcher (ex: specific emoji, presence state)
        if (matcher && !matcher(triggerNode.data.config || {})) continue;

        console.log(`[${sessionId}] Triggering flow "${flow.name}" (${triggerType})`);
        const log = await executeFlow(flow, eventData, session);
        console.log(`[${sessionId}] Flow "${flow.name}" completed:`, log.length, 'steps');
      } catch (err) {
        console.error(`[${sessionId}] Error in event flow "${row.name}":`, err);
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
    const chatId =
      (message?.chatId as Record<string, unknown>)?._serialized as string ||
      (message?.chatId as string) ||
      (message?.from as string) || '';
    const caption = (message?.caption as string) || '';
    const sender =
      (message?.from as Record<string, unknown>)?._serialized as string ||
      (message?.from as string) ||
      (message?.author as string) || '';

    // Advanced filters — applied to all message-based triggers
    const applyCommonFilters = (): boolean => {
      if (!message) return true;

      // Legacy: ignore own messages
      const ignoreOwn = (config?.ignoreOwnMessages as boolean) !== false;
      if (ignoreOwn && message.fromMe) return false;

      // Legacy: ignore forwarded
      const ignoreForwarded = (config?.ignoreForwarded as boolean) || false;
      if (ignoreForwarded && message.isForwarded) return false;

      // ============ NEW FILTER SELECTOR LOGIC ============
      const filters = (config?.filters as Record<string, unknown>) || {};

      // 1. Keyword filter
      const keywordFilter = (filters.keyword as Record<string, unknown>) || {};
      if (keywordFilter.enabled === true) {
        const words = ((keywordFilter.words as string) || '')
          .split(/[,\n]/)
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean);
        if (words.length > 0) {
          const searchText = (body + ' ' + caption).toLowerCase();
          const mode = (keywordFilter.mode as string) || 'contains';
          const matched = words.some((w) => {
            if (mode === 'exact') return body.toLowerCase() === w;
            if (mode === 'startsWith') return searchText.startsWith(w);
            return searchText.includes(w);
          });
          if (!matched) return false;
        }
      }

      // 1b. Message Type filter (event kind)
      const messageTypeFilter = (filters.messageType as string) || 'any';
      if (messageTypeFilter !== 'any') {
        const hasReaction = !!message.reactionText;
        const hasQuoted = !!(message.quotedMsg || message.quotedMsgId);
        const quotedFromMe = hasQuoted && !!((message.quotedMsg as Record<string, unknown>)?.fromMe);
        const mentionedMe = Array.isArray(message.mentionedIds) && (message.mentionedIds as unknown[]).length > 0;

        if (messageTypeFilter === 'reply' && !quotedFromMe) return false;
        if (messageTypeFilter === 'mention' && !mentionedMe) return false;
        if (messageTypeFilter === 'reaction' && !hasReaction) return false;
        if (messageTypeFilter === 'forwarded' && !message.isForwarded) return false;
        if (messageTypeFilter === 'quoted' && !hasQuoted) return false;
        // 'edited', 'deleted', 'read' are triggered by dedicated events, not here
        // 'new' is any fresh incoming message - always true
      }

      // 2. Media type filter
      const mediaTypeFilter = (filters.mediaType as string) || 'none';
      if (mediaTypeFilter !== 'none') {
        const mediaTypes = ['image', 'video', 'audio', 'ptt', 'document', 'sticker', 'location', 'contact', 'vcard', 'multi_vcard'];
        const isMedia = mediaTypes.includes(msgType);
        if (mediaTypeFilter === 'text_only' && isMedia) return false;
        if (mediaTypeFilter === 'any_media' && !isMedia) return false;
        if (mediaTypeFilter === 'image' && msgType !== 'image') return false;
        if (mediaTypeFilter === 'video' && msgType !== 'video') return false;
        if (mediaTypeFilter === 'audio' && !['audio', 'ptt'].includes(msgType)) return false;
        if (mediaTypeFilter === 'document' && msgType !== 'document') return false;
        if (mediaTypeFilter === 'sticker' && msgType !== 'sticker') return false;
        if (mediaTypeFilter === 'location' && msgType !== 'location') return false;
        if (mediaTypeFilter === 'contact' && !['contact', 'vcard', 'multi_vcard'].includes(msgType)) return false;
        if (mediaTypeFilter === 'link') {
          const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/i;
          if (!urlRegex.test(body)) return false;
        }
        if (mediaTypeFilter === 'poll' && msgType !== 'poll' && msgType !== 'poll_creation') return false;
      }

      // 3. Message content filter
      const contentFilter = (filters.content as Record<string, unknown>) || {};
      if (contentFilter.enabled === true) {
        const operator = (contentFilter.operator as string) || 'contains';
        const value = (contentFilter.value as string) || '';
        if (value) {
          const lowerBody = body.toLowerCase();
          const lowerValue = value.toLowerCase();
          let matched = false;
          switch (operator) {
            case 'contains': matched = lowerBody.includes(lowerValue); break;
            case 'equals': matched = lowerBody === lowerValue; break;
            case 'startsWith': matched = lowerBody.startsWith(lowerValue); break;
            case 'endsWith': matched = lowerBody.endsWith(lowerValue); break;
            case 'regex': {
              try { matched = new RegExp(value, 'i').test(body); } catch { matched = false; }
              break;
            }
            case 'minLength': matched = body.length >= parseInt(value, 10); break;
            case 'maxLength': matched = body.length <= parseInt(value, 10); break;
          }
          if (!matched) return false;
        }
      }

      // 4. Sender filter (supports comma-separated list)
      const senderFilter = (filters.sender as string) || '';
      if (senderFilter.trim()) {
        const allowedSenders = senderFilter
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => (s.includes('@') ? s : `${s}@c.us`));
        const senderPhone = sender.replace(/@.*$/, '');
        const matched = allowedSenders.some((allowed) => {
          const allowedPhone = allowed.replace(/@.*$/, '');
          return sender === allowed || senderPhone === allowedPhone;
        });
        if (!matched) return false;
      }

      // 5. Chat type filter (+ optional specific group ID)
      const chatTypeFilter = (filters.chatType as string) || 'all';
      if (chatTypeFilter !== 'all') {
        const isBroadcast = chatId.endsWith('@broadcast') || chatId === 'status@broadcast';
        if (chatTypeFilter === 'private' && (isGroup || isBroadcast)) return false;
        if (chatTypeFilter === 'group' && !isGroup) return false;
        if (chatTypeFilter === 'broadcast' && !isBroadcast) return false;
        if (chatTypeFilter === 'private_or_group' && isBroadcast) return false;
      }
      // Specific group ID filter (only relevant if in group)
      const filterGroupId = (filters.groupId as string) || '';
      if (filterGroupId && isGroup && chatId !== filterGroupId) return false;

      return true;
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
