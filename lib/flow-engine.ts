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
        const result = await (client as unknown as Record<string, Function>).sendButtons(
          ctx.chatId,
          btnTitle,
          buttons,
          btnText,
          btnFooter
        );
        entry.result = { messageId: (result as unknown as Record<string, unknown>).id };
        break;
      }

      case 'send-reaction': {
        if (!client) throw new Error('Client not connected');
        const reactionMsgId = interpolateVariables(
          (config.messageId as string) || (ctx.message.id as Record<string, unknown>)?._serialized as string || '',
          ctx
        );
        const emoji = (config.emoji as string) || (config.reaction as string) || '';
        await client.sendReactionToMessage(reactionMsgId, emoji);
        entry.result = { reaction: emoji };
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
        const labelName = interpolateVariables((config.label as string) || (config.name as string) || '', ctx);
        if (labelName && client) {
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

          // Update contact labels
          const contact = db.prepare(
            `SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`
          ).get(ctx.session.id, ctx.sender) as { id: string; labels: string } | undefined;

          if (contact) {
            const labels: string[] = JSON.parse(contact.labels || '[]');
            if (!labels.includes(labelName)) {
              labels.push(labelName);
              db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
                JSON.stringify(labels),
                contact.id
              );
              db.prepare(`UPDATE labels SET count = count + 1 WHERE id = ?`).run(label.id);
            }
          }
        }
        entry.result = { label: labelName };
        break;
      }

      case 'remove-label': {
        const rmLabelName = interpolateVariables((config.label as string) || (config.name as string) || '', ctx);
        if (rmLabelName) {
          const db = getDb();
          const contact = db.prepare(
            `SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`
          ).get(ctx.session.id, ctx.sender) as { id: string; labels: string } | undefined;

          if (contact) {
            const labels: string[] = JSON.parse(contact.labels || '[]');
            const idx = labels.indexOf(rmLabelName);
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
            }
          }
        }
        entry.result = { label: rmLabelName };
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
        const blockId = interpolateVariables((config.contactId as string) || ctx.sender, ctx);
        await client.blockContact(blockId);
        entry.result = { blocked: blockId };
        break;
      }

      case 'unblock-contact': {
        if (!client) throw new Error('Client not connected');
        const unblockId = interpolateVariables((config.contactId as string) || ctx.sender, ctx);
        await client.unblockContact(unblockId);
        entry.result = { unblocked: unblockId };
        break;
      }

      case 'forward-message': {
        if (!client) throw new Error('Client not connected');
        const forwardTo = interpolateVariables((config.to as string) || (config.chatId as string) || '', ctx);
        const fwdMsgId =
          (ctx.message.id as Record<string, unknown>)?._serialized as string ||
          (ctx.message.id as string) ||
          '';
        if (fwdMsgId && forwardTo) {
          await client.forwardMessage(forwardTo, fwdMsgId, false);
        }
        entry.result = { forwardedTo: forwardTo };
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
    entry.error = error instanceof Error ? error.message : String(error);
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
