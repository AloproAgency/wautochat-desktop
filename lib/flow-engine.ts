import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';
import flowExecutionBus from '@/lib/flow-execution-bus';
import type {
  Flow,
  FlowNodeSerialized,
  FlowEdgeSerialized,
  FlowNodeType,
  Session,
} from '@/lib/types';

interface FlowContext {
  variables: Record<string, string>;
  message: Record<string, unknown>;
  session: Session;
  sender: string;
  chatId: string;
}

interface ExecutionLogEntry {
  nodeId: string;
  nodeType: FlowNodeType;
  label: string;
  status: 'success' | 'error' | 'skipped';
  result?: unknown;
  error?: string;
  timestamp: string;
}

/**
 * Normalize a WhatsApp contact ID to the @c.us format expected by most
 * wppconnect methods (blockContact, unblockContact, sendText, etc.).
 * Handles @lid, @s.whatsapp.net, raw phone numbers, and already-formatted IDs.
 * Returns empty string if the input is unusable.
 */
function normalizeContactId(raw: string): string {
  if (!raw) return '';
  // Groups stay in @g.us
  if (raw.endsWith('@g.us')) return raw;
  // Extract just the digits
  const phone = raw.replace(/@c\.us|@g\.us|@lid|@s\.whatsapp\.net/g, '').replace(/\D/g, '');
  if (!phone) return '';
  return `${phone}@c.us`;
}

/**
 * Resolve a contact row for label operations. Handles the @lid ↔ @c.us
 * mismatch: WhatsApp sometimes sends messages with sender in @lid format,
 * while the synced contacts table stores the same person as @c.us.
 * Strategy: try wpp_id match, then phone match, then create a visible
 * contact entry so the label is never lost.
 */
function resolveContactForLabel(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  senderId: string
): { id: string; labels: string } {
  // 1. Exact wpp_id match
  let contact = db
    .prepare(`SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`)
    .get(sessionId, senderId) as { id: string; labels: string } | undefined;
  if (contact) return contact;

  // 2. Extract numeric phone from ID and match on phone column
  const phone = senderId.replace(/@c\.us|@g\.us|@lid|@s\.whatsapp\.net/g, '').replace(/\D/g, '');
  if (phone) {
    contact = db
      .prepare(`SELECT id, labels FROM contacts WHERE session_id = ? AND phone = ?`)
      .get(sessionId, phone) as { id: string; labels: string } | undefined;
    if (contact) return contact;
  }

  // 3. Try "@c.us" variant if no suffix in sender
  if (!senderId.includes('@')) {
    contact = db
      .prepare(`SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`)
      .get(sessionId, `${senderId}@c.us`) as { id: string; labels: string } | undefined;
    if (contact) return contact;
  }

  // 4. Create a new visible contact as last resort
  const newContactId = crypto.randomUUID();
  const wppId = senderId.includes('@') ? senderId : `${senderId}@c.us`;
  const displayPhone = phone || wppId;
  db.prepare(
    `INSERT INTO contacts (id, session_id, wpp_id, name, phone, is_my_contact, is_wa_contact, labels)
     VALUES (?, ?, ?, ?, ?, 1, 1, '[]')`
  ).run(newContactId, sessionId, wppId, displayPhone, displayPhone);
  return { id: newContactId, labels: '[]' };
}

/**
 * Translates technical wppconnect / puppeteer / network errors into
 * user-friendly messages. Falls back to a generic message with the raw
 * technical detail appended for debugging.
 */
export function humanizeError(rawError: string, nodeType: FlowNodeType): string {
  const err = rawError || '';
  const lower = err.toLowerCase();

  // Buttons / lists — WhatsApp-specific restrictions (most common pain point)
  if (nodeType === 'send-buttons') {
    if (lower.includes('is not a function') || lower.includes('sendbuttons')) {
      return "Les boutons interactifs ne sont pas supportés sur ce compte WhatsApp. Ils nécessitent un compte WhatsApp Business. Le flow a été automatiquement converti en message texte numéroté.";
    }
    if (lower.includes('blocked') || lower.includes('forbidden') || lower.includes('restricted')) {
      return "WhatsApp a bloqué l'envoi des boutons interactifs. Cette fonctionnalité est réservée aux comptes WhatsApp Business. Essayez un message texte classique.";
    }
    // Generic send-buttons fallback
    return `Impossible d'envoyer les boutons interactifs. WhatsApp restreint cette fonctionnalité aux comptes Business. Détail : ${err}`;
  }
  if (nodeType === 'send-list' && (lower.includes('is not a function') || lower.includes('not supported'))) {
    return "Les listes interactives ne sont pas supportées sur ce compte WhatsApp. Elles nécessitent un compte WhatsApp Business.";
  }

  // Action-specific errors
  if (nodeType === 'forward-message') {
    if (lower.includes('no recipients selected')) {
      return "Aucun destinataire sélectionné. Ouvrez la configuration du nœud et ajoutez au moins un contact vers qui transférer.";
    }
    if (lower.includes('target chat id is required')) {
      return "Le destinataire est requis pour transférer un message.";
    }
    if (lower.includes('no message to forward')) {
      return "Aucun message à transférer. Ce nœud ne peut s'exécuter que dans un flow déclenché par un message entrant.";
    }
    if (lower.includes('forwarding failed for all recipients')) {
      return `Échec du transfert vers tous les destinataires. ${err}`;
    }
  }
  if (nodeType === 'add-to-group' || nodeType === 'remove-from-group') {
    if (lower.includes('not a group') || lower.includes('invalid group')) {
      return "L'ID du groupe est invalide. Utilisez le format '123456@g.us'.";
    }
    if (lower.includes('not admin') || lower.includes('forbidden')) {
      return "Vous devez être administrateur du groupe pour effectuer cette action.";
    }
    if (lower.includes('privacy') || lower.includes('not allowed')) {
      return "Impossible d'ajouter ce contact : ses réglages de confidentialité WhatsApp l'empêchent d'être ajouté à un groupe.";
    }
  }
  if (nodeType === 'block-contact' || nodeType === 'unblock-contact') {
    if (lower.includes('without a chat') || lower.includes('block_list')) {
      return "Impossible de bloquer ce contact : aucune conversation WhatsApp n'existe avec lui. Envoyez-lui au moins un message d'abord, ou utilisez ce nœud dans un flow déclenché par un message reçu de ce contact.";
    }
    if (lower.includes('not a contact') || lower.includes('invalid wid')) {
      return "Contact invalide. Vérifiez que le numéro est au format '1234567890@c.us'.";
    }
    if (lower.includes('invalid contact id')) {
      return "ID de contact invalide. Le flow n'a pas pu identifier le destinataire à bloquer.";
    }
  }
  if (nodeType === 'send-reaction') {
    if (lower.includes('invalid emoji') || lower.includes('reaction')) {
      return "L'emoji de réaction est invalide. Utilisez un emoji Unicode comme 👍 ou ❤️.";
    }
    if (lower.includes('message') && lower.includes('not found')) {
      return "Message introuvable. Impossible d'ajouter une réaction à un message qui n'existe plus.";
    }
  }
  if (nodeType === 'typing-indicator' || nodeType === 'mark-as-read') {
    if (lower.includes('chat') && lower.includes('not found')) {
      return "Conversation introuvable. Le destinataire n'existe pas ou la session n'est pas active.";
    }
  }
  if ((nodeType === 'assign-label' || nodeType === 'remove-label') && lower.includes('contact')) {
    return "Contact introuvable dans la base. Synchronisez d'abord vos contacts depuis la page Contacts.";
  }

  // Puppeteer / wppconnect connection hiccups
  if (err.includes('Execution context was destroyed')) {
    return "WhatsApp Web s'est rafraîchi pendant l'envoi. Merci de réessayer dans quelques secondes.";
  }
  if (err.includes('Target closed') || err.includes('Session closed')) {
    return 'La connexion WhatsApp a été interrompue. Vérifiez que votre téléphone est connecté à Internet.';
  }
  if (err.includes('Protocol error')) {
    return 'Erreur de communication avec WhatsApp. Réessayez dans un instant.';
  }
  if (err.includes('Navigation timeout') || err.includes('waiting for selector')) {
    return "WhatsApp Web n'a pas répondu à temps. Vérifiez que la session est bien connectée.";
  }

  // Network
  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('econnreset')) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion Internet.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return "L'opération a pris trop de temps. Réessayez.";
  }

  // Media / URL
  if (lower.includes('invalid url') || lower.includes('err_invalid_url')) {
    return "L'URL du fichier est invalide.";
  }
  if (lower.includes('failed to fetch') || lower.includes('fetch failed')) {
    return 'Impossible de télécharger le fichier. Vérifiez que le lien est accessible.';
  }
  if (lower.includes('unsupported media') || lower.includes('unsupported format')) {
    return 'Format de fichier non supporté par WhatsApp.';
  }

  // Recipient / chat
  if (lower.includes('not found') && nodeType.startsWith('send-')) {
    return "Destinataire introuvable. Vérifiez le numéro ou l'ID du chat.";
  }
  if (lower.includes('not a contact') || lower.includes('wid error')) {
    return "Ce numéro n'est pas un contact WhatsApp valide.";
  }

  // Flow configuration
  if (lower.includes('unknown node type')) {
    return `Type de nœud inconnu. Ce nœud n'est pas reconnu par le moteur d'exécution.`;
  }
  if (lower.includes('missing') && lower.includes('config')) {
    return "Configuration du nœud incomplète. Vérifiez les paramètres.";
  }

  // Fallback: keep the raw message but prefix for clarity
  return `Erreur lors de l'exécution : ${err}`;
}

function interpolateVariables(
  text: string,
  ctx: FlowContext
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    // Built-in variables matching what the UI offers
    if (key === 'name' || key === 'senderName')
      return (ctx.message.sender as Record<string, unknown>)?.pushname as string ||
             (ctx.message.sender as Record<string, unknown>)?.name as string || ctx.sender;
    if (key === 'phone' || key === 'sender') return ctx.sender.replace('@c.us', '');
    if (key === 'message' || key === 'messageBody') return (ctx.message.body as string) || '';
    if (key === 'chatId') return ctx.chatId;
    return ctx.variables[key] ?? `{{${key}}}`;
  });
}

function evaluateCondition(
  operator: string,
  value: string,
  actual: string
): boolean {
  const lowerActual = actual.toLowerCase();
  const lowerValue = value.toLowerCase();

  switch (operator) {
    case 'contains':
      return lowerActual.includes(lowerValue);
    case 'equals':
      return lowerActual === lowerValue;
    case 'startsWith':
      return lowerActual.startsWith(lowerValue);
    case 'endsWith':
      return lowerActual.endsWith(lowerValue);
    case 'regex': {
      try {
        const regex = new RegExp(value, 'i');
        return regex.test(actual);
      } catch {
        return false;
      }
    }
    case 'exists':
      return actual.length > 0;
    case 'notExists':
      return actual.length === 0;
    case 'greaterThan':
      return parseFloat(actual) > parseFloat(value);
    case 'lessThan':
      return parseFloat(actual) < parseFloat(value);
    default:
      return false;
  }
}

function getNextNodes(
  nodeId: string,
  edges: FlowEdgeSerialized[],
  sourceHandle?: string
): string[] {
  return edges
    .filter(
      (e) =>
        e.source === nodeId &&
        (sourceHandle === undefined || e.sourceHandle === sourceHandle)
    )
    .map((e) => e.target);
}

function getNodeById(
  nodeId: string,
  nodes: FlowNodeSerialized[]
): FlowNodeSerialized | undefined {
  return nodes.find((n) => n.id === nodeId);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resumeFlowAfterWait(
  flow: Flow,
  message: Record<string, unknown>,
  session: Session,
  waitNodeId: string,
  savedVariables: Record<string, string>
): Promise<ExecutionLogEntry[]> {
  const executionId = randomUUID();
  const log: ExecutionLogEntry[] = [];
  const ctx: FlowContext = {
    variables: { ...savedVariables, message: (message.body as string) || '' },
    message,
    session,
    sender:
      (message.from as string) ||
      ((message.sender as Record<string, unknown>)?.id as string) ||
      '',
    chatId:
      (message.chatId as Record<string, unknown>)?._serialized as string ||
      (message.chatId as string) ||
      (message.from as string) ||
      '',
  };

  flowExecutionBus.emit({
    type: 'execution:start',
    flowId: flow.id,
    executionId,
    timestamp: new Date().toISOString(),
  });

  // Find next nodes after the wait-for-reply node
  const nextTargets = getNextNodes(waitNodeId, flow.edges);

  for (const targetId of nextTargets) {
    await executeNode(targetId, flow.nodes, flow.edges, ctx, log, new Set(), flow.id, executionId);
  }

  flowExecutionBus.emit({
    type: 'execution:end',
    flowId: flow.id,
    executionId,
    timestamp: new Date().toISOString(),
    data: { status: 'success' },
  });

  return log;
}

export async function executeFlow(
  flow: Flow,
  message: Record<string, unknown>,
  session: Session
): Promise<ExecutionLogEntry[]> {
  const executionId = randomUUID();
  const log: ExecutionLogEntry[] = [];
  const ctx: FlowContext = {
    variables: { ...flow.variables },
    message,
    session,
    sender:
      (message.from as string) ||
      ((message.sender as Record<string, unknown>)?.id as string) ||
      '',
    chatId:
      (message.chatId as Record<string, unknown>)?._serialized as string ||
      (message.chatId as string) ||
      (message.from as string) ||
      '',
  };

  flowExecutionBus.emit({
    type: 'execution:start',
    flowId: flow.id,
    executionId,
    timestamp: new Date().toISOString(),
  });

  // Find trigger node
  const triggerNode = flow.nodes.find((n) => n.data.type === 'trigger');
  if (!triggerNode) {
    log.push({
      nodeId: 'none',
      nodeType: 'trigger',
      label: 'Missing Trigger',
      status: 'error',
      error: 'No trigger node found in flow',
      timestamp: new Date().toISOString(),
    });
    flowExecutionBus.emit({
      type: 'execution:end',
      flowId: flow.id,
      executionId,
      timestamp: new Date().toISOString(),
      data: { status: 'error', error: 'No trigger node found in flow' },
    });
    return log;
  }

  // Emit trigger node execution events (with small delay so UI can show the pulse)
  flowExecutionBus.emit({
    type: 'node:executing',
    flowId: flow.id,
    executionId,
    nodeId: triggerNode.id,
    nodeType: 'trigger',
    nodeLabel: triggerNode.data.label,
    timestamp: new Date().toISOString(),
  });
  await delay(300);
  flowExecutionBus.emit({
    type: 'node:completed',
    flowId: flow.id,
    executionId,
    nodeId: triggerNode.id,
    nodeType: 'trigger',
    nodeLabel: triggerNode.data.label,
    timestamp: new Date().toISOString(),
    data: { status: 'success', durationMs: 0 },
  });

  // Start from trigger, get next nodes
  const startTargets = getNextNodes(triggerNode.id, flow.edges);

  for (const targetId of startTargets) {
    await executeNode(targetId, flow.nodes, flow.edges, ctx, log, new Set(), flow.id, executionId);
  }

  flowExecutionBus.emit({
    type: 'execution:end',
    flowId: flow.id,
    executionId,
    timestamp: new Date().toISOString(),
    data: { status: 'success' },
  });

  return log;
}

async function executeNode(
  nodeId: string,
  nodes: FlowNodeSerialized[],
  edges: FlowEdgeSerialized[],
  ctx: FlowContext,
  log: ExecutionLogEntry[],
  visited: Set<string>,
  flowId: string,
  executionId: string
): Promise<void> {
  if (visited.has(nodeId)) return; // Prevent infinite loops
  visited.add(nodeId);

  const node = getNodeById(nodeId, nodes);
  if (!node) return;

  const config = node.data.config;
  const client = manager.getClient(ctx.session.id);

  const startTime = Date.now();

  flowExecutionBus.emit({
    type: 'node:executing',
    flowId,
    executionId,
    nodeId: node.id,
    nodeType: node.data.type,
    nodeLabel: node.data.label,
    timestamp: new Date().toISOString(),
  });

  // Small delay so the UI can show the "executing" pulse before the node runs
  await delay(200);

  const entry: ExecutionLogEntry = {
    nodeId: node.id,
    nodeType: node.data.type,
    label: node.data.label,
    status: 'success',
    timestamp: new Date().toISOString(),
  };

  try {
    switch (node.data.type) {
      case 'send-message': {
        if (!client) throw new Error('Client not connected');
        const text = interpolateVariables((config.text as string) || (config.message as string) || '', ctx);
        const result = await client.sendText(ctx.chatId, text);
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-image': {
        if (!client) throw new Error('Client not connected');
        const imageUrl = interpolateVariables((config.url as string) || (config.imageUrl as string) || '', ctx);
        const imageCaption = interpolateVariables((config.caption as string) || '', ctx);
        const result = await client.sendImage(ctx.chatId, imageUrl, 'image', imageCaption);
        entry.result = { messageId: (result as unknown as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-file': {
        if (!client) throw new Error('Client not connected');
        const fileUrl = interpolateVariables((config.url as string) || (config.fileUrl as string) || '', ctx);
        const fileName = interpolateVariables((config.fileName as string) || 'file', ctx);
        const fileCaption = interpolateVariables((config.caption as string) || '', ctx);
        const result = await client.sendFile(ctx.chatId, fileUrl, fileName, fileCaption);
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-audio': {
        if (!client) throw new Error('Client not connected');
        const audioUrl = interpolateVariables((config.url as string) || (config.audioUrl as string) || '', ctx);
        const isPtt = config.ptt !== false;
        if (isPtt) {
          const result = await client.sendPtt(ctx.chatId, audioUrl);
          entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        } else {
          const result = await client.sendFile(ctx.chatId, audioUrl, 'audio', '');
          entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        }
        break;
      }

      case 'send-video': {
        if (!client) throw new Error('Client not connected');
        const videoUrl = interpolateVariables((config.url as string) || (config.videoUrl as string) || '', ctx);
        const videoCaption = interpolateVariables((config.caption as string) || '', ctx);
        const result = await client.sendFile(ctx.chatId, videoUrl, 'video', videoCaption);
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-location': {
        if (!client) throw new Error('Client not connected');
        const lat = (config.latitude as string) || (config.lat as string) || '0';
        const lng = (config.longitude as string) || (config.lng as string) || '0';
        const locTitle = interpolateVariables((config.title as string) || '', ctx);
        const result = await client.sendLocation(ctx.chatId, lat, lng, locTitle);
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-contact': {
        if (!client) throw new Error('Client not connected');
        const contactId = interpolateVariables((config.contactId as string) || '', ctx);
        const result = await client.sendContactVcard(ctx.chatId, contactId, '');
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-sticker': {
        if (!client) throw new Error('Client not connected');
        const stickerUrl = interpolateVariables((config.url as string) || (config.stickerUrl as string) || '', ctx);
        const result = await client.sendImageAsSticker(ctx.chatId, stickerUrl);
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-list': {
        if (!client) throw new Error('Client not connected');
        const listTitle = interpolateVariables((config.title as string) || '', ctx);
        const listSubtitle = interpolateVariables((config.subtitle as string) || '', ctx);
        const listDescription = interpolateVariables((config.description as string) || '', ctx);
        const listButtonText = interpolateVariables((config.buttonText as string) || 'Options', ctx);
        const sections = (config.sections as Array<Record<string, unknown>>) || [];
        const result = await client.sendListMessage(ctx.chatId, {
          buttonText: listButtonText,
          description: listDescription,
          title: listTitle,
          footer: listSubtitle,
          sections: sections.map((s) => ({
            title: (s.title as string) || '',
            rows: ((s.rows as Array<Record<string, unknown>>) || []).map((r) => ({
              title: (r.title as string) || '',
              description: (r.description as string) || '',
              rowId: (r.rowId as string) || (r.id as string) || '',
            })),
          })),
        });
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-poll': {
        if (!client) throw new Error('Client not connected');
        const pollName = interpolateVariables((config.name as string) || (config.question as string) || '', ctx);
        const pollChoices = ((config.choices as string[]) || (config.options as string[]) || []);
        const pollAllowMultiple = (config.allowMultiple as boolean) || false;
        const result = await client.sendPollMessage(ctx.chatId, pollName, pollChoices, {
          selectableCount: pollAllowMultiple ? pollChoices.length : 1,
        });
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-buttons': {
        if (!client) throw new Error('Client not connected');
        const btnTitle = interpolateVariables((config.title as string) || '', ctx);
        const btnText = interpolateVariables((config.text as string) || (config.message as string) || '', ctx);
        const btnFooter = interpolateVariables((config.footer as string) || '', ctx);
        const buttons = ((config.buttons as Array<Record<string, unknown>>) || []).map((b) => ({
          id: (b.id as string) || '',
          text: (b.text as string) || (b.label as string) || '',
        }));

        // WhatsApp restricts interactive buttons to WhatsApp Business API accounts.
        // On personal accounts, the wppconnect call returns successfully but WA Web
        // silently drops the message (nothing arrives). To guarantee delivery, we
        // always send a numbered text message that works on every account type.
        const lines: string[] = [];
        if (btnTitle) lines.push(`*${btnTitle}*`);
        if (btnText) lines.push(btnText);
        if (buttons.length > 0) {
          if (lines.length > 0) lines.push('');
          buttons.forEach((b, idx) => {
            lines.push(`${idx + 1}. ${b.text}`);
          });
          lines.push('');
          lines.push('_Répondez avec le numéro de votre choix._');
        }
        if (btnFooter) lines.push(`_${btnFooter}_`);

        const result = await client.sendText(ctx.chatId, lines.join('\n'));
        entry.result = {
          messageId: (result as unknown as Record<string, unknown>)?.id,
          renderedAs: 'numbered-text',
          note: 'Interactive buttons require a WhatsApp Business account; sent as numbered text for compatibility.',
        };
        break;
      }

      case 'send-reaction': {
        if (!client) throw new Error('Client not connected');

        // Extract message ID from multiple possible locations
        const msgIdObj = ctx.message.id as unknown;
        let reactionMsgId = '';
        if (config.messageId) {
          reactionMsgId = interpolateVariables(config.messageId as string, ctx);
        } else if (typeof msgIdObj === 'string') {
          reactionMsgId = msgIdObj;
        } else if (msgIdObj && typeof msgIdObj === 'object') {
          const idRecord = msgIdObj as Record<string, unknown>;
          reactionMsgId =
            (idRecord._serialized as string) ||
            (idRecord.id as string) ||
            '';
        }

        if (!reactionMsgId || typeof reactionMsgId !== 'string') {
          throw new Error('No message to react to in this context');
        }

        // Emoji: accept either a direct unicode emoji or a common name
        const rawEmoji = ((config.emoji as string) || (config.reaction as string) || '').trim();
        const emojiMap: Record<string, string> = {
          thumbs_up: '👍', thumbsup: '👍', 'thumbs-up': '👍', like: '👍',
          heart: '❤️', love: '❤️',
          laugh: '😂', joy: '😂', haha: '😂',
          wow: '😮', surprised: '😮',
          sad: '😢', cry: '😢',
          pray: '🙏', thanks: '🙏',
          fire: '🔥',
          clap: '👏',
          party: '🎉',
          star: '⭐',
          check: '✅', ok: '✅',
          cross: '❌', no: '❌',
        };
        const emoji = emojiMap[rawEmoji.toLowerCase()] || rawEmoji;
        if (!emoji) {
          throw new Error('Reaction emoji is required');
        }

        await client.sendReactionToMessage(reactionMsgId, emoji);
        entry.result = { reaction: emoji, messageId: reactionMsgId };
        break;
      }

      case 'wait-for-reply': {
        entry.result = { waiting: true };
        log.push(entry);
        flowExecutionBus.emit({
          type: 'node:completed',
          flowId,
          executionId,
          nodeId: node.id,
          nodeType: node.data.type,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          data: { status: 'success', result: entry.result, durationMs: Date.now() - startTime },
        });
        // Pause the conversation: tell the manager to wait for next message
        manager.pauseConversation(
          ctx.session.id,
          ctx.chatId,
          flowId,
          node.id,
          { ...ctx.variables }
        );
        // Stop execution here - will resume on next message
        return;
      }

      case 'condition': {
        const field = (config.field as string) || 'messageBody';
        const operator = (config.operator as string) || 'contains';
        const condValue = interpolateVariables((config.value as string) || '', ctx);

        let actual = '';
        if (field === 'messageBody') {
          actual = (ctx.message.body as string) || '';
        } else if (field === 'sender') {
          actual = ctx.sender;
        } else if (field === 'chatId') {
          actual = ctx.chatId;
        } else {
          actual = ctx.variables[field] || '';
        }

        const matched = evaluateCondition(operator, condValue, actual);

        log.push(entry);
        flowExecutionBus.emit({
          type: 'node:completed',
          flowId,
          executionId,
          nodeId: node.id,
          nodeType: node.data.type,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          data: { status: 'success', result: { matched }, durationMs: Date.now() - startTime },
        });

        // Follow "true" or "false" handle edges
        const trueTargets = getNextNodes(node.id, edges, matched ? 'true' : 'yes');
        const falseTargets = getNextNodes(node.id, edges, matched ? 'false' : 'no');

        // Also check generic true/false handles
        const matchTargets = matched
          ? [...trueTargets, ...getNextNodes(node.id, edges, 'true')]
          : [...falseTargets, ...getNextNodes(node.id, edges, 'false')];

        // Deduplicate
        const uniqueTargets = [...new Set(matchTargets)];

        // If no handle-specific edges found, try default edges
        if (uniqueTargets.length === 0) {
          const defaultTargets = getNextNodes(node.id, edges);
          if (matched && defaultTargets.length > 0) {
            for (const t of defaultTargets) {
              await executeNode(t, nodes, edges, ctx, log, visited, flowId, executionId);
            }
          }
        } else {
          for (const t of uniqueTargets) {
            await executeNode(t, nodes, edges, ctx, log, visited, flowId, executionId);
          }
        }
        return;
      }

      case 'delay': {
        const delaySeconds = (config.seconds as number) || (config.delay as number) || 1;
        await delay(delaySeconds * 1000);
        entry.result = { delayedMs: delaySeconds * 1000 };
        break;
      }

      case 'set-variable': {
        const varName = (config.variableName as string) || (config.name as string) || (config.variable as string) || '';
        let varValue = interpolateVariables((config.value as string) || '', ctx);

        // Support extracting from message
        if (config.source === 'messageBody') {
          varValue = (ctx.message.body as string) || '';
        } else if (config.source === 'sender') {
          varValue = ctx.sender;
        }

        if (varName) {
          ctx.variables[varName] = varValue;
        }
        entry.result = { variable: varName, value: varValue };
        break;
      }

      case 'http-request': {
        const url = interpolateVariables((config.url as string) || '', ctx);
        const method = ((config.method as string) || 'GET').toUpperCase();
        const headersConfig = (config.headers as Record<string, string>) || {};
        const bodyConfig = config.body ? interpolateVariables(
          typeof config.body === 'string' ? config.body : JSON.stringify(config.body),
          ctx
        ) : undefined;

        const interpolatedHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(headersConfig)) {
          interpolatedHeaders[k] = interpolateVariables(v, ctx);
        }

        const fetchOptions: RequestInit = {
          method,
          headers: interpolatedHeaders,
        };
        if (bodyConfig && method !== 'GET' && method !== 'HEAD') {
          fetchOptions.body = bodyConfig;
          if (!interpolatedHeaders['Content-Type']) {
            interpolatedHeaders['Content-Type'] = 'application/json';
          }
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();
        let responseData: unknown;
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }

        // Store response in variable if configured
        const responseVar = (config.responseVariable as string) || (config.saveAs as string) || '';
        if (responseVar) {
          ctx.variables[responseVar] = typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData);
        }
        ctx.variables['__http_status'] = String(response.status);
        ctx.variables['__http_response'] = typeof responseData === 'string'
          ? responseData
          : JSON.stringify(responseData);

        entry.result = { status: response.status, data: responseData };
        break;
      }

      case 'ai-response': {
        // AI response would require an AI provider integration
        // Store the prompt and let the implementer handle it
        const prompt = interpolateVariables((config.prompt as string) || '', ctx);
        const aiVar = (config.responseVariable as string) || 'aiResponse';
        ctx.variables[aiVar] = `[AI Response for: ${prompt}]`;
        entry.result = { prompt, note: 'AI provider integration required' };
        break;
      }

      case 'assign-label': {
        const labelName = interpolateVariables(
          (config.labelName as string) ||
            (config.label as string) ||
            (config.name as string) ||
            '',
          ctx
        );
        if (!labelName.trim()) {
          throw new Error('Label name is required');
        }

        const db = getDb();

        // Find or create label
        let label = db.prepare(
          `SELECT id FROM labels WHERE session_id = ? AND name = ?`
        ).get(ctx.session.id, labelName) as { id: string } | undefined;

        if (!label) {
          const labelId = crypto.randomUUID();
          db.prepare(
            `INSERT INTO labels (id, session_id, name, color, count) VALUES (?, ?, ?, '#25D366', 0)`
          ).run(labelId, ctx.session.id, labelName);
          label = { id: labelId };
        }

        // Resolve the contact, trying multiple strategies to handle @lid vs @c.us
        const contact = resolveContactForLabel(db, ctx.session.id, ctx.sender);

        const labels: string[] = JSON.parse(contact.labels || '[]');
        let added = false;
        if (!labels.includes(labelName)) {
          labels.push(labelName);
          db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
            JSON.stringify(labels),
            contact.id
          );
          db.prepare(`UPDATE labels SET count = count + 1 WHERE id = ?`).run(label.id);
          added = true;
        }

        entry.result = { label: labelName, contactId: contact.id, added };
        break;
      }

      case 'remove-label': {
        const rmLabelName = interpolateVariables(
          (config.labelName as string) ||
            (config.label as string) ||
            (config.name as string) ||
            '',
          ctx
        );
        if (!rmLabelName.trim()) {
          throw new Error('Label name is required');
        }

        const db = getDb();
        const contact = resolveContactForLabel(db, ctx.session.id, ctx.sender);

        const labels: string[] = JSON.parse(contact.labels || '[]');
        const idx = labels.indexOf(rmLabelName);
        let removed = false;
        if (idx !== -1) {
          labels.splice(idx, 1);
          db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
            JSON.stringify(labels),
            contact.id
          );
          db.prepare(`UPDATE labels SET count = MAX(count - 1, 0) WHERE session_id = ? AND name = ?`).run(
            ctx.session.id,
            rmLabelName
          );
          removed = true;
        }

        entry.result = { label: rmLabelName, contactId: contact.id, removed };
        break;
      }

      case 'add-to-group': {
        if (!client) throw new Error('Client not connected');
        const groupId = interpolateVariables((config.groupId as string) || '', ctx);
        const participantId = interpolateVariables((config.participantId as string) || ctx.sender, ctx);
        await client.addParticipant(groupId, participantId);
        entry.result = { groupId, participant: participantId };
        break;
      }

      case 'remove-from-group': {
        if (!client) throw new Error('Client not connected');
        const rmGroupId = interpolateVariables((config.groupId as string) || '', ctx);
        const rmParticipantId = interpolateVariables((config.participantId as string) || ctx.sender, ctx);
        await client.removeParticipant(rmGroupId, rmParticipantId);
        entry.result = { groupId: rmGroupId, participant: rmParticipantId };
        break;
      }

      case 'block-contact': {
        if (!client) throw new Error('Client not connected');

        // Build the list of candidate IDs to try, in priority order.
        // chatId is best — it guarantees the chat exists in WA's store (required for block).
        // Fall back to the normalized sender, then the raw sender, then config.contactId.
        const rawConfigId = interpolateVariables((config.contactId as string) || '', ctx);
        const candidates = Array.from(
          new Set(
            [
              // Only use chatId if it's a 1-to-1 conversation (not a group)
              ctx.chatId && !ctx.chatId.endsWith('@g.us') ? ctx.chatId : '',
              normalizeContactId(ctx.sender),
              ctx.sender,
              rawConfigId,
              normalizeContactId(rawConfigId),
            ].filter((c) => c && c.length > 3)
          )
        );

        if (candidates.length === 0) {
          throw new Error('Invalid contact ID — cannot block');
        }

        let blockedId = '';
        let lastError: Error | null = null;
        for (const candidate of candidates) {
          try {
            await client.blockContact(candidate);
            blockedId = candidate;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
          }
        }

        if (!blockedId) {
          throw lastError || new Error('Failed to block contact');
        }

        // Reflect in local DB so the Contacts page shows the Blocked badge
        const db = getDb();
        const phone = blockedId.replace(/@c\.us|@g\.us|@lid/g, '').replace(/\D/g, '');
        db.prepare(
          `UPDATE contacts SET is_blocked = 1 WHERE session_id = ? AND (wpp_id = ? OR phone = ?)`
        ).run(ctx.session.id, blockedId, phone);

        entry.result = { blocked: blockedId, triedCandidates: candidates };
        break;
      }

      case 'unblock-contact': {
        if (!client) throw new Error('Client not connected');

        const rawConfigId = interpolateVariables((config.contactId as string) || '', ctx);
        const candidates = Array.from(
          new Set(
            [
              ctx.chatId && !ctx.chatId.endsWith('@g.us') ? ctx.chatId : '',
              normalizeContactId(ctx.sender),
              ctx.sender,
              rawConfigId,
              normalizeContactId(rawConfigId),
            ].filter((c) => c && c.length > 3)
          )
        );

        if (candidates.length === 0) {
          throw new Error('Invalid contact ID — cannot unblock');
        }

        let unblockedId = '';
        let lastError: Error | null = null;
        for (const candidate of candidates) {
          try {
            await client.unblockContact(candidate);
            unblockedId = candidate;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
          }
        }

        if (!unblockedId) {
          throw lastError || new Error('Failed to unblock contact');
        }

        const db = getDb();
        const phone = unblockedId.replace(/@c\.us|@g\.us|@lid/g, '').replace(/\D/g, '');
        db.prepare(
          `UPDATE contacts SET is_blocked = 0 WHERE session_id = ? AND (wpp_id = ? OR phone = ?)`
        ).run(ctx.session.id, unblockedId, phone);

        entry.result = { unblocked: unblockedId, triedCandidates: candidates };
        break;
      }

      case 'forward-message': {
        if (!client) throw new Error('Client not connected');

        // Collect all targets: new multi-target "targets" array + legacy single fields
        const targetsArr = (config.targets as string[]) || [];
        const legacySingle =
          (config.to as string) ||
          (config.chatId as string) ||
          (config.targetChat as string) ||
          '';
        const allTargets = Array.from(
          new Set(
            [
              ...targetsArr.map((t) => interpolateVariables(t, ctx)),
              legacySingle ? interpolateVariables(legacySingle, ctx) : '',
            ].filter((t) => t && t.trim().length > 0)
          )
        );

        if (allTargets.length === 0) {
          throw new Error('No recipients selected for forwarding');
        }

        const fwdMsgId =
          (ctx.message.id as Record<string, unknown>)?._serialized as string ||
          (ctx.message.id as string) ||
          '';

        // Extract message content to re-send (more reliable than the forward API,
        // which fails when WA's internal chat cache lookup returns undefined).
        const msgBody = (ctx.message.body as string) || '';
        const msgType = (ctx.message.type as string) || 'chat';
        const msgCaption = (ctx.message.caption as string) || '';
        const msgMediaUrl =
          (ctx.message.deprecatedMms3Url as string) ||
          (ctx.message.mediaUrl as string) ||
          '';
        const senderName =
          (ctx.message.notifyName as string) ||
          (ctx.message.pushname as string) ||
          ctx.sender.replace('@c.us', '');

        if (!msgBody && !msgMediaUrl && !msgCaption) {
          throw new Error('No message content to forward in this context');
        }

        const clientAny = client as unknown as Record<string, Function>;
        const useV2 = typeof clientAny.forwardMessagesV2 === 'function';

        const forwarded: string[] = [];
        const failed: Array<{ target: string; error: string }> = [];

        for (const target of allTargets) {
          try {
            // Try the native forward API first (preserves "forwarded" badge)
            let forwardWorked = false;
            if (fwdMsgId) {
              try {
                if (useV2) {
                  await clientAny.forwardMessagesV2(target, fwdMsgId);
                } else {
                  await clientAny.forwardMessage(target, fwdMsgId);
                }
                forwardWorked = true;
              } catch {
                // Fall through to manual re-send
                forwardWorked = false;
              }
            }

            // Fallback: re-send the content manually
            if (!forwardWorked) {
              const prefix = `*Transféré de ${senderName} :*\n\n`;
              if (msgType === 'chat' || msgType === 'text') {
                await client.sendText(target, prefix + msgBody);
              } else if (msgMediaUrl && (msgType === 'image' || msgType === 'video' || msgType === 'document' || msgType === 'audio')) {
                // Send media with caption that includes the forwarded-from header
                const captionToUse = msgCaption
                  ? `${prefix}${msgCaption}`
                  : prefix.trim();
                await client.sendFile(target, msgMediaUrl, {
                  caption: captionToUse,
                } as unknown as Record<string, unknown>);
              } else {
                // Last resort: just send as text
                await client.sendText(target, prefix + (msgBody || msgCaption || '[Media transféré]'));
              }
            }

            forwarded.push(target);
          } catch (err) {
            failed.push({
              target,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (forwarded.length === 0 && failed.length > 0) {
          throw new Error(`Forwarding failed for all recipients: ${failed[0].error}`);
        }

        entry.result = {
          forwardedTo: forwarded,
          failedCount: failed.length,
          ...(failed.length > 0 ? { failures: failed } : {}),
        };
        break;
      }

      case 'mark-as-read': {
        if (!client) throw new Error('Client not connected');
        await client.sendSeen(ctx.chatId);
        entry.result = { markedAsRead: ctx.chatId };
        break;
      }

      case 'typing-indicator': {
        if (!client) throw new Error('Client not connected');
        const typingDuration = ((config.duration as number) || 3) * 1000;
        await client.startTyping(ctx.chatId);
        await delay(typingDuration);
        await client.stopTyping(ctx.chatId);
        entry.result = { typingMs: typingDuration };
        break;
      }

      case 'go-to-flow': {
        const targetFlowId = (config.flowId as string) || '';
        if (targetFlowId) {
          const db = getDb();
          const flowRow = db.prepare(`SELECT * FROM flows WHERE id = ?`).get(targetFlowId) as Record<string, unknown> | undefined;

          if (flowRow) {
            const targetFlow: Flow = {
              id: flowRow.id as string,
              sessionId: flowRow.session_id as string,
              name: flowRow.name as string,
              description: (flowRow.description as string) || undefined,
              isActive: !!(flowRow.is_active),
              trigger: JSON.parse((flowRow.trigger_config as string) || '{}'),
              nodes: JSON.parse((flowRow.nodes as string) || '[]'),
              edges: JSON.parse((flowRow.edges as string) || '[]'),
              variables: JSON.parse((flowRow.variables as string) || '{}'),
              createdAt: flowRow.created_at as string,
              updatedAt: flowRow.updated_at as string,
            };
            const subLog = await executeFlow(targetFlow, ctx.message, ctx.session);
            entry.result = { flowId: targetFlowId, subLog };
            log.push(entry);
            flowExecutionBus.emit({
              type: 'node:completed',
              flowId,
              executionId,
              nodeId: node.id,
              nodeType: node.data.type,
              nodeLabel: node.data.label,
              timestamp: new Date().toISOString(),
              data: { status: 'success', result: entry.result, durationMs: Date.now() - startTime },
            });
            return;
          } else {
            throw new Error(`Target flow ${targetFlowId} not found`);
          }
        }
        break;
      }

      case 'end': {
        entry.result = { ended: true };
        log.push(entry);
        flowExecutionBus.emit({
          type: 'node:completed',
          flowId,
          executionId,
          nodeId: node.id,
          nodeType: node.data.type,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          data: { status: 'success', result: entry.result, durationMs: Date.now() - startTime },
        });
        return;
      }

      case 'trigger': {
        // Trigger nodes are handled at the start
        entry.status = 'skipped';
        break;
      }

      default: {
        entry.status = 'error';
        entry.error = `Unknown node type: ${node.data.type}`;
      }
    }
  } catch (error) {
    entry.status = 'error';
    const rawMsg = error instanceof Error ? error.message : String(error);
    entry.error = humanizeError(rawMsg, node.data.type);
  }

  log.push(entry);

  const durationMs = Date.now() - startTime;
  if (entry.status === 'error') {
    flowExecutionBus.emit({
      type: 'node:error',
      flowId,
      executionId,
      nodeId: node.id,
      nodeType: node.data.type,
      nodeLabel: node.data.label,
      timestamp: new Date().toISOString(),
      data: { status: 'error', error: entry.error, durationMs },
    });
  } else {
    flowExecutionBus.emit({
      type: 'node:completed',
      flowId,
      executionId,
      nodeId: node.id,
      nodeType: node.data.type,
      nodeLabel: node.data.label,
      timestamp: new Date().toISOString(),
      data: { status: entry.status, result: entry.result, durationMs },
    });
  }

  // Continue to next nodes
  const nextTargets = getNextNodes(node.id, edges);
  for (const t of nextTargets) {
    await executeNode(t, nodes, edges, ctx, log, visited, flowId, executionId);
  }
}
