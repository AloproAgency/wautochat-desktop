import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import flowExecutionBus from '@/lib/flow-execution-bus';
import { humanizeError } from '@/lib/flow-engine';
import { applyTriggerFilters } from '@/lib/trigger-filters';
import type {
  Flow,
  FlowNodeSerialized,
  FlowEdgeSerialized,
  FlowNodeType,
} from '@/lib/types';

// --- Helpers ---

function parseFlowRow(row: Record<string, unknown>): Flow {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    isActive: !!(row.is_active),
    trigger: JSON.parse((row.trigger_config as string) || '{}'),
    nodes: JSON.parse((row.nodes as string) || '[]'),
    edges: JSON.parse((row.edges as string) || '[]'),
    variables: JSON.parse((row.variables as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

interface TestContext {
  message: string;
  variables: Record<string, string>;
  // Chain of flow IDs traversed via `go-to-flow` to detect loops
  flowStack?: Set<string>;
}

// --- Conversation state for wait-for-reply ---
// Stores the paused flow state per flowId so the next message resumes from where it stopped
interface PausedFlowState {
  resumeNodeId: string; // The node AFTER wait-for-reply (next edges)
  waitNodeId: string;   // The wait-for-reply node itself
  variables: Record<string, string>;
  timestamp: number;
}

const globalForState = globalThis as unknown as { __testChatState: Map<string, PausedFlowState> };
if (!globalForState.__testChatState) {
  globalForState.__testChatState = new Map();
}
const pausedStates = globalForState.__testChatState;

function interpolateTestVariables(text: string, ctx: TestContext): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === 'name' || key === 'senderName') return 'Test User';
    if (key === 'phone' || key === 'sender') return '1234567890';
    if (key === 'message' || key === 'messageBody') return ctx.message;
    if (key === 'chatId') return 'test-user@c.us';
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
  // Normalize operator: accept both snake_case and camelCase
  const op = operator.toLowerCase().replace(/_/g, '');

  switch (op) {
    case 'contains':
      return lowerValue.length > 0 && lowerActual.includes(lowerValue);
    case 'notcontains':
      return !(lowerValue.length > 0 && lowerActual.includes(lowerValue));
    case 'equals':
      return lowerActual === lowerValue;
    case 'notequals':
      return lowerActual !== lowerValue;
    case 'startswith':
      return lowerValue.length > 0 && lowerActual.startsWith(lowerValue);
    case 'endswith':
      return lowerValue.length > 0 && lowerActual.endsWith(lowerValue);
    case 'regex':
    case 'matches': {
      try {
        return value.length > 0 && new RegExp(value, 'i').test(actual);
      } catch {
        return false;
      }
    }
    case 'exists':
      return actual.length > 0;
    case 'notexists':
      return actual.length === 0;
    case 'isempty':
      return actual.trim().length === 0;
    case 'greaterthan':
      return parseFloat(actual) > parseFloat(value);
    case 'lessthan':
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

// Test responses can be plain strings or structured media
export type TestResponse =
  | string
  | {
      type: 'image' | 'video' | 'audio' | 'file' | 'sticker';
      url: string;
      caption?: string;
      fileName?: string;
    };

// Walk the flow graph collecting responses (no real client needed)
async function walkFlow(
  nodeId: string,
  nodes: FlowNodeSerialized[],
  edges: FlowEdgeSerialized[],
  ctx: TestContext,
  responses: TestResponse[],
  visited: Set<string>,
  flowId: string,
  executionId: string
): Promise<'done' | 'paused'> {
  if (visited.has(nodeId)) return 'done';
  visited.add(nodeId);

  const node = getNodeById(nodeId, nodes);
  if (!node) return 'done';

  const config = node.data.config;
  const startTime = Date.now();

  // Emit executing event
  flowExecutionBus.emit({
    type: 'node:executing',
    flowId,
    executionId,
    nodeId: node.id,
    nodeType: node.data.type,
    nodeLabel: node.data.label,
    timestamp: new Date().toISOString(),
  });

  await delay(250);

  try {
    switch (node.data.type) {
      case 'send-message': {
        const text = interpolateTestVariables(
          (config.text as string) || (config.message as string) || '',
          ctx
        );
        if (text) responses.push(text);
        break;
      }

      case 'send-image': {
        const caption = interpolateTestVariables((config.caption as string) || '', ctx);
        const url = (config.url as string) || (config.imageUrl as string) || '';
        if (url) {
          responses.push({ type: 'image', url, caption: caption || undefined });
        } else {
          responses.push(caption ? `[Image: ${caption}]` : '[Image: no url]');
        }
        break;
      }

      case 'send-video': {
        const caption = interpolateTestVariables((config.caption as string) || '', ctx);
        const url = (config.url as string) || (config.videoUrl as string) || '';
        if (url) {
          responses.push({ type: 'video', url, caption: caption || undefined });
        } else {
          responses.push(caption ? `[Video: ${caption}]` : '[Video: no url]');
        }
        break;
      }

      case 'send-audio': {
        const url = (config.url as string) || '';
        if (url) {
          responses.push({ type: 'audio', url });
        } else {
          responses.push('[Audio message]');
        }
        break;
      }

      case 'send-file': {
        const fileName = (config.fileName as string) || (config.name as string) || 'file';
        const url = (config.url as string) || '';
        if (url) {
          responses.push({ type: 'file', url, fileName });
        } else {
          responses.push(`[File: ${fileName}]`);
        }
        break;
      }

      case 'send-location': {
        const title = interpolateTestVariables((config.title as string) || '', ctx);
        const address = interpolateTestVariables((config.address as string) || '', ctx);
        const lat = (config.latitude as string) || '?';
        const lng = (config.longitude as string) || '?';
        const parts = [title || 'Location', address, `(${lat}, ${lng})`].filter(Boolean);
        responses.push(`📍 [${parts.join(' · ')}]`);
        break;
      }

      case 'send-contact': {
        const contactName = (config.contactName as string) || '';
        const contactPhone = (config.contactPhone as string) || (config.contactId as string) || '';
        responses.push(`👤 [Contact : ${contactName || '?'} — ${contactPhone || '?'}]`);
        break;
      }

      case 'send-sticker': {
        const url = (config.url as string) || '';
        if (url) {
          responses.push({ type: 'sticker', url });
        } else {
          responses.push('[Sticker]');
        }
        break;
      }

      case 'send-list': {
        const listTitle = interpolateTestVariables((config.title as string) || 'List', ctx);
        // Panel writes `body`; older configs used `description`. Read both for safety.
        const listBody = interpolateTestVariables(
          (config.body as string) || (config.description as string) || '',
          ctx
        );
        const buttonText = (config.buttonText as string) || '';
        const sections = (config.sections as Array<Record<string, unknown>>) || [];

        let listText = `*${listTitle}*`;
        if (listBody) listText += `\n${listBody}`;
        for (const section of sections) {
          listText += `\n\n_${(section.title as string) || 'Options'}_`;
          const rows = (section.rows as Array<Record<string, unknown>>) || [];
          for (const row of rows) {
            listText += `\n  - ${(row.title as string) || ''}`;
            if (row.description) listText += ` (${row.description})`;
          }
        }
        if (buttonText) listText += `\n\n[${buttonText}]`;
        responses.push(listText);
        break;
      }

      case 'send-poll': {
        const pollName = interpolateTestVariables(
          (config.name as string) || (config.question as string) || 'Poll',
          ctx
        );
        const choices = ((config.choices as string[]) || (config.options as string[]) || []);
        let pollText = `*Poll: ${pollName}*`;
        for (let i = 0; i < choices.length; i++) {
          pollText += `\n  ${i + 1}. ${choices[i]}`;
        }
        responses.push(pollText);
        break;
      }

      case 'send-buttons': {
        // Panel writes `body` and optional `footer`; older configs used `text`/`message`.
        const btnTitle = interpolateTestVariables((config.title as string) || '', ctx);
        const btnBody = interpolateTestVariables(
          (config.body as string) || (config.text as string) || (config.message as string) || '',
          ctx
        );
        const btnFooter = interpolateTestVariables((config.footer as string) || '', ctx);
        const buttons = (config.buttons as Array<Record<string, unknown>>) || [];

        const lines: string[] = [];
        if (btnTitle) lines.push(`*${btnTitle}*`);
        if (btnBody) lines.push(btnBody);
        if (buttons.length > 0) {
          if (lines.length > 0) lines.push('');
          buttons.forEach((btn, idx) => {
            const text = (btn.text as string) || (btn.label as string) || `Button ${idx + 1}`;
            lines.push(`[ ${text} ]`);
          });
        }
        if (btnFooter) lines.push(`_${btnFooter}_`);
        responses.push(lines.join('\n') || '[Empty button message]');
        break;
      }

      case 'send-reaction': {
        const rawEmoji = ((config.emoji as string) || (config.reaction as string) || '').trim();
        const emojiMap: Record<string, string> = {
          thumbs_up: '👍', thumbsup: '👍', 'thumbs-up': '👍', like: '👍',
          heart: '❤️', love: '❤️',
          laugh: '😂', joy: '😂', haha: '😂',
          wow: '😮', surprised: '😮',
          sad: '😢', cry: '😢',
          pray: '🙏', thanks: '🙏',
          fire: '🔥', clap: '👏', party: '🎉', star: '⭐',
          check: '✅', ok: '✅', cross: '❌', no: '❌',
        };
        const emoji = emojiMap[rawEmoji.toLowerCase()] || rawEmoji;
        responses.push(
          `${emoji} *Add Reaction* — nécessite un vrai message WhatsApp auquel réagir.\n\n` +
          `_Cette action pose un emoji sur le message qui a déclenché le flow. Le simulateur n'a pas de "vrai" message entrant à marquer. Teste avec un vrai message WhatsApp vers ta session pour voir l'emoji apparaître sur ton téléphone._`
        );
        break;
      }

      case 'condition': {
        // Read the new panel keys (leftOperand/rightOperand) with fallback to legacy (field/value)
        const leftRaw =
          (config.leftOperand as string) ||
          (config.field as string) ||
          '{{message}}';
        const rightRaw =
          (config.rightOperand as string) ||
          (config.value as string) ||
          '';
        const operator = (config.operator as string) || 'equals';

        // Resolve the left side
        let actual = '';
        const legacyFields = ['messageBody', 'sender', 'chatId'];
        if (legacyFields.includes(leftRaw)) {
          if (leftRaw === 'messageBody') actual = ctx.message;
          else if (leftRaw === 'sender') actual = '1234567890@c.us';
          else if (leftRaw === 'chatId') actual = 'test-user@c.us';
        } else if (!leftRaw.includes('{{') && ctx.variables[leftRaw] !== undefined) {
          actual = ctx.variables[leftRaw];
        } else {
          actual = interpolateTestVariables(leftRaw, ctx);
        }

        const condValue = interpolateTestVariables(rightRaw, ctx);
        const matched = evaluateCondition(operator, condValue, actual);

        flowExecutionBus.emit({
          type: 'node:completed',
          flowId,
          executionId,
          nodeId: node.id,
          nodeType: node.data.type,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          data: {
            status: 'success',
            result: { matched, actual, expected: condValue, operator, branch: matched ? 'yes' : 'no' },
            durationMs: Date.now() - startTime,
          },
        });

        // Route only to the branch that matches the condition result.
        const yesTargets = [
          ...getNextNodes(node.id, edges, 'yes'),
          ...getNextNodes(node.id, edges, 'true'),
        ];
        const noTargets = [
          ...getNextNodes(node.id, edges, 'no'),
          ...getNextNodes(node.id, edges, 'false'),
        ];
        const chosen = matched ? yesTargets : noTargets;
        const uniqueTargets = [...new Set(chosen)];

        for (const t of uniqueTargets) {
          const r = await walkFlow(t, nodes, edges, ctx, responses, visited, flowId, executionId);
          if (r === 'paused') return 'paused';
        }
        return 'done';
      }

      case 'delay': {
        // Honor the delay but cap it at 3s so the test chat stays responsive
        const duration = Number(
          (config.duration as number) ??
          (config.seconds as number) ??
          (config.delay as number) ??
          1
        );
        const unit = (config.unit as string) || 'seconds';
        let ms = duration * 1000;
        if (unit === 'minutes') ms = duration * 60_000;
        else if (unit === 'hours') ms = duration * 3_600_000;
        const capped = Math.min(ms, 3000);
        if (ms > 3000) {
          responses.push(`⏱ [Délai simulé : ${duration} ${unit} — réduit à 3s en mode test]`);
        }
        await delay(capped);
        break;
      }

      case 'set-variable': {
        const varName = (
          (config.variableName as string) ||
          (config.name as string) ||
          (config.variable as string) ||
          ''
        ).trim();
        if (!varName) {
          throw new Error('Variable name is required');
        }
        let varValue = interpolateTestVariables((config.value as string) || '', ctx);
        if (config.source === 'messageBody') {
          varValue = ctx.message;
        } else if (config.source === 'sender') {
          varValue = '1234567890@c.us';
        }
        ctx.variables[varName] = varValue;
        break;
      }

      case 'http-request': {
        // Actually perform the HTTP request in test mode so developers can
        // validate their API integration before going live.
        const url = interpolateTestVariables((config.url as string) || '', ctx);
        if (!url) throw new Error('HTTP request URL is required');
        const method = ((config.method as string) || 'GET').toUpperCase();

        const rawHeaders = config.headers;
        const headers: Record<string, string> = {};
        if (Array.isArray(rawHeaders)) {
          for (const h of rawHeaders as Array<{ key?: string; value?: string }>) {
            if (h && h.key) {
              headers[interpolateTestVariables(h.key, ctx)] =
                interpolateTestVariables(h.value || '', ctx);
            }
          }
        } else if (rawHeaders && typeof rawHeaders === 'object') {
          for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) {
            headers[interpolateTestVariables(k, ctx)] = interpolateTestVariables(v, ctx);
          }
        }

        const bodyConfig = config.body
          ? interpolateTestVariables(
              typeof config.body === 'string' ? config.body : JSON.stringify(config.body),
              ctx
            )
          : undefined;

        const fetchOptions: RequestInit = { method, headers };
        if (bodyConfig && method !== 'GET' && method !== 'HEAD') {
          fetchOptions.body = bodyConfig;
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        }

        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 15_000);
        fetchOptions.signal = controller.signal;

        try {
          const response = await fetch(url, fetchOptions);
          clearTimeout(tId);
          const responseText = await response.text();
          let responseData: unknown;
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = responseText;
          }
          const serialized = typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData);
          const responseVar =
            (config.responseVariable as string) ||
            (config.saveAs as string) ||
            'apiResponse';
          ctx.variables[responseVar] = serialized;
          ctx.variables['apiResponse'] = serialized;
          ctx.variables['__http_status'] = String(response.status);
          ctx.variables['__http_response'] = serialized;
          responses.push(`🌐 [${method} ${url} → ${response.status}]`);
        } catch (err) {
          clearTimeout(tId);
          const msg = err instanceof Error ? err.message : String(err);
          responses.push(`🌐 [${method} ${url} → erreur : ${msg}]`);
          ctx.variables['__http_status'] = '0';
          ctx.variables['__http_response'] = msg;
        }
        break;
      }

      case 'ai-response': {
        const prompt = interpolateTestVariables((config.prompt as string) || '', ctx);
        const aiVar = (config.responseVariable as string) || 'aiResponse';
        const model = (config.model as string) || undefined;
        const maxTokens = (config.maxTokens as number) || undefined;
        const temperature = (config.temperature as number) || undefined;

        if (!prompt.trim()) {
          throw new Error('AI prompt is empty — configure a prompt in the node settings');
        }

        try {
          const { callAi, getAiSettings } = await import('@/lib/ai-providers');
          if (!getAiSettings()) {
            responses.push(
              `🤖 *AI Response* — provider non configuré.\n\n` +
              `_Va dans la page Settings pour ajouter une API key (Groq, OpenAI, Anthropic ou Gemini). Sans ça, ce nœud ne peut pas répondre ni ici ni en production._`
            );
            ctx.variables[aiVar] = '';
            break;
          }
          const aiResult = await callAi({ prompt, model, maxTokens, temperature });
          ctx.variables[aiVar] = aiResult.text;
          responses.push(aiResult.text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          responses.push(`🤖 *AI Response* — erreur : ${msg}`);
          ctx.variables[aiVar] = '';
        }
        break;
      }

      case 'wait-for-reply': {
        flowExecutionBus.emit({
          type: 'node:completed',
          flowId,
          executionId,
          nodeId: node.id,
          nodeType: node.data.type,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          data: { status: 'success', result: { waiting: true }, durationMs: Date.now() - startTime },
        });
        // Save state so next message resumes from here
        const nextAfterWait = getNextNodes(node.id, edges);
        if (nextAfterWait.length > 0) {
          pausedStates.set(flowId, {
            resumeNodeId: nextAfterWait[0],
            waitNodeId: node.id,
            variables: { ...ctx.variables },
            timestamp: Date.now(),
          });
        }
        return 'paused';
      }

      case 'end': {
        flowExecutionBus.emit({
          type: 'node:completed',
          flowId,
          executionId,
          nodeId: node.id,
          nodeType: node.data.type,
          nodeLabel: node.data.label,
          timestamp: new Date().toISOString(),
          data: { status: 'success', result: { ended: true }, durationMs: Date.now() - startTime },
        });
        return 'done'; // Stop
      }

      case 'assign-label': {
        const labelName = interpolateTestVariables(
          (config.labelName as string) || (config.label as string) || (config.name as string) || '',
          ctx
        );
        responses.push(
          `🏷️ *Assign Label* — nécessite un vrai contact WhatsApp.\n` +
          `Label : "${labelName || '?'}"\n\n` +
          `_Pour tester, envoie un vrai message depuis WhatsApp vers ta session. Les labels sont stockés côté base et visibles sur la page Contacts, ce n'est pas affichable dans ce simulateur._`
        );
        break;
      }

      case 'remove-label': {
        const labelName = interpolateTestVariables(
          (config.labelName as string) || (config.label as string) || (config.name as string) || '',
          ctx
        );
        responses.push(
          `🏷️ *Remove Label* — nécessite un vrai contact WhatsApp.\n` +
          `Label : "${labelName || '?'}"\n\n` +
          `_Pour tester, envoie un vrai message depuis WhatsApp. L'effet s'applique uniquement à un contact réellement présent dans ta base._`
        );
        break;
      }

      case 'add-to-group': {
        const groupName = (config.groupName as string) || (config.groupId as string) || '?';
        responses.push(
          `👥 *Add to Group* — nécessite une connexion WhatsApp active.\n` +
          `Groupe cible : "${groupName}"\n\n` +
          `_Cette action fait un appel API WhatsApp pour ajouter un participant à un groupe existant. Tu dois être admin du groupe. Teste avec un vrai message WhatsApp pour déclencher réellement l'ajout._`
        );
        break;
      }

      case 'remove-from-group': {
        const groupName = (config.groupName as string) || (config.groupId as string) || '?';
        responses.push(
          `👥 *Remove from Group* — nécessite une connexion WhatsApp active.\n` +
          `Groupe cible : "${groupName}"\n\n` +
          `_Cette action appelle WhatsApp pour retirer un participant. Tu dois être admin du groupe. Teste en vrai depuis WhatsApp._`
        );
        break;
      }

      case 'block-contact': {
        responses.push(
          `🚫 *Block Contact* — nécessite une conversation WhatsApp existante.\n\n` +
          `_WhatsApp refuse de bloquer un numéro avec lequel tu n'as jamais échangé. Pour tester, envoie d'abord un vrai message depuis WhatsApp vers ta session, puis déclenche ce flow : le contact sera réellement bloqué côté WhatsApp ET dans ta base locale (badge rouge dans la page Contacts)._`
        );
        break;
      }

      case 'unblock-contact': {
        responses.push(
          `✅ *Unblock Contact* — nécessite une connexion WhatsApp active.\n\n` +
          `_Le déblocage passe par l'API WhatsApp et met à jour ta base locale. Teste depuis un vrai message WhatsApp pour voir le changement dans la page Contacts._`
        );
        break;
      }

      case 'forward-message': {
        const targets = (config.targets as string[]) || [];
        const single = (config.targetChat as string) || (config.to as string) || '';
        const count = targets.length || (single ? 1 : 0);
        responses.push(
          `↪️ *Forward Message* — nécessite un vrai message WhatsApp à transférer.\n` +
          `${count} destinataire${count > 1 ? 's' : ''} configuré${count > 1 ? 's' : ''}.\n\n` +
          `_Ce simulateur ne peut pas transférer un message qui n'existe pas réellement dans WhatsApp. Déclenche le flow depuis un vrai message entrant : il sera transféré (ou recopié en fallback) à tous les destinataires sélectionnés._`
        );
        break;
      }

      case 'mark-as-read': {
        responses.push(
          `✓✓ *Mark as Read* — nécessite une conversation WhatsApp active.\n\n` +
          `_Cette action envoie le signal "lu" (double check bleu) à WhatsApp. Sans vraie conversation, rien à marquer. Teste depuis un vrai message._`
        );
        break;
      }

      case 'typing-indicator': {
        const duration = (config.duration as number) || 3;
        responses.push(
          `⌨️ *Typing Indicator* — nécessite une conversation WhatsApp active.\n` +
          `Durée : ${duration}s\n\n` +
          `_Ce nœud fait apparaître "en train d'écrire…" dans la conversation du contact pendant X secondes. Invisible dans ce simulateur — teste avec un vrai message WhatsApp pour voir l'indicateur s'afficher côté téléphone._`
        );
        break;
      }

      case 'go-to-flow': {
        const targetFlowId = ((config.flowId as string) || '').trim();
        if (!targetFlowId) {
          responses.push('[Go to Flow: no target flow configured]');
          break;
        }
        if (targetFlowId === flowId) {
          responses.push('[Go to Flow: target is the current flow — skipped to avoid infinite loop]');
          break;
        }
        if (ctx.flowStack && ctx.flowStack.has(targetFlowId)) {
          responses.push(
            `[Go to Flow: cyclic chain detected — flow "${targetFlowId}" is already running in this call]`
          );
          break;
        }
        if (ctx.flowStack && ctx.flowStack.size >= 10) {
          responses.push('[Go to Flow: depth limit (10) reached — chain stopped]');
          break;
        }

        const db = getDb();
        const targetRow = db
          .prepare(`SELECT * FROM flows WHERE id = ?`)
          .get(targetFlowId) as Record<string, unknown> | undefined;
        if (!targetRow) {
          responses.push(`[Go to Flow: target flow "${targetFlowId}" not found]`);
          break;
        }

        const targetNodes = JSON.parse((targetRow.nodes as string) || '[]') as FlowNodeSerialized[];
        const targetEdges = JSON.parse((targetRow.edges as string) || '[]') as FlowEdgeSerialized[];

        // Find entry points in the target flow: trigger's children, or root nodes if no trigger.
        const trigger = targetNodes.find((n) => n.data.type === 'trigger');
        let entryIds: string[] = [];
        if (trigger) {
          entryIds = getNextNodes(trigger.id, targetEdges);
          if (entryIds.length === 0) {
            const withIncoming = new Set(targetEdges.map((e) => e.target));
            entryIds = targetNodes
              .filter((n) => n.id !== trigger.id && !withIncoming.has(n.id))
              .map((n) => n.id);
          }
        } else {
          const withIncoming = new Set(targetEdges.map((e) => e.target));
          entryIds = targetNodes
            .filter((n) => !withIncoming.has(n.id))
            .map((n) => n.id);
        }

        // Walk the target flow with a fresh visited set so nothing bleeds across.
        // Also record the current flow in the stack to detect cyclic go-to-flow chains.
        const subVisited = new Set<string>();
        const subStack = new Set(ctx.flowStack || []);
        subStack.add(flowId);
        const subCtx: TestContext = { ...ctx, flowStack: subStack };
        for (const id of entryIds) {
          const state = await walkFlow(
            id,
            targetNodes,
            targetEdges,
            subCtx,
            responses,
            subVisited,
            targetFlowId,
            executionId
          );
          if (state === 'paused') return 'paused';
        }
        break;
      }

      case 'trigger': {
        // Skip trigger nodes, just follow edges
        break;
      }

      default:
        break;
    }
  } catch (error) {
    flowExecutionBus.emit({
      type: 'node:error',
      flowId,
      executionId,
      nodeId: node.id,
      nodeType: node.data.type,
      nodeLabel: node.data.label,
      timestamp: new Date().toISOString(),
      data: {
        status: 'error',
        error: humanizeError(
          error instanceof Error ? error.message : String(error),
          node.data.type
        ),
        durationMs: Date.now() - startTime,
      },
    });

    // Continue to next nodes even on error
    const errTargets = getNextNodes(node.id, edges);
    for (const t of errTargets) {
      const r = await walkFlow(t, nodes, edges, ctx, responses, visited, flowId, executionId);
      if (r === 'paused') return 'paused';
    }
    return 'done';
  }

  // Emit completed
  flowExecutionBus.emit({
    type: 'node:completed',
    flowId,
    executionId,
    nodeId: node.id,
    nodeType: node.data.type,
    nodeLabel: node.data.label,
    timestamp: new Date().toISOString(),
    data: { status: 'success', durationMs: Date.now() - startTime },
  });

  // Continue to next nodes
  const nextTargets = getNextNodes(node.id, edges);
  for (const t of nextTargets) {
    const r = await walkFlow(t, nodes, edges, ctx, responses, visited, flowId, executionId);
    if (r === 'paused') return 'paused';
  }
  return 'done';
}

// Check if trigger matches the simulated message.
// Returns { matched, reason? }: reason is populated when matched=false so the
// test chat can show the user a helpful explanation of what went wrong.
export interface TriggerMatchResult {
  matched: boolean;
  reason?: string;
}

export interface SimOptions {
  msgType?: string;   // 'text'|'image'|'video'|'audio'|'document'|'sticker'|'location'|'contact'|'poll'
  isGroup?: boolean;
  sender?: string;    // phone number like "2299xxxxxxx" or full JID
}

function checkTriggerMatch(
  trigger: Flow['trigger'],
  triggerConfig: Record<string, unknown>,
  message: string,
  sim: SimOptions = {}
): TriggerMatchResult {
  const triggerType = trigger?.type || (triggerConfig.triggerType as string) || 'message_received';
  const msgType = sim.msgType || 'text';
  const isGroup = sim.isGroup ?? false;
  const rawSender = sim.sender || 'test-user';
  const sender = rawSender.includes('@') ? rawSender : `${rawSender}@c.us`;
  const chatId = isGroup ? 'test-group@g.us' : sender;

  // Helper: apply the advanced filters (messageType, chatType, sender, etc.)
  // from `config.filters` against the simulated message context.
  function applyFilters(): boolean {
    return applyTriggerFilters(triggerConfig, {
      body: message,
      caption: '',
      msgType,
      isGroup,
      isBroadcast: false,
      sender,
      chatId,
      fromMe: false,
      mentionedJidList: [],
      isForwarded: false,
      quotedMsgId: '',
      quotedFromMe: false,
    });
  }

  // Keyword and regex share the same pattern: first match on body, then filters.
  if (triggerType === 'keyword') {
    const rawKeywords = triggerConfig.keywords || triggerConfig.keyword || '';
    const keywords = (typeof rawKeywords === 'string'
      ? rawKeywords.split(/[,\n]/).map((k: string) => k.trim()).filter(Boolean)
      : Array.isArray(rawKeywords) ? rawKeywords : []) as string[];
    if (keywords.length > 0) {
      const matchMode = (triggerConfig.matchMode as string) || 'contains';
      const lowerMsg = message.toLowerCase();
      const kwMatched = keywords.some((kw: string) => {
        const lowerKw = kw.toLowerCase();
        if (matchMode === 'exact') return lowerMsg === lowerKw;
        if (matchMode === 'startsWith') return lowerMsg.startsWith(lowerKw);
        return lowerMsg.includes(lowerKw);
      });
      if (!kwMatched) {
        return {
          matched: false,
          reason: `Aucun des mots-clés [${keywords.join(', ')}] n'a été trouvé dans ton message (mode : ${matchMode}).`,
        };
      }
    }
    return applyFilters()
      ? { matched: true }
      : { matched: false, reason: 'Les filtres avancés du trigger excluent ce message (type, chat, expéditeur…).' };
  }

  if (triggerType === 'regex') {
    const pattern = (triggerConfig.pattern as string) || (triggerConfig.regex as string) || '';
    if (pattern) {
      try {
        if (!new RegExp(pattern, 'i').test(message)) {
          return {
            matched: false,
            reason: `Ton message ne correspond pas au pattern regex "${pattern}".`,
          };
        }
      } catch {
        return { matched: false, reason: `Pattern regex invalide : "${pattern}".` };
      }
    }
    return applyFilters()
      ? { matched: true }
      : { matched: false, reason: 'Les filtres avancés du trigger excluent ce message.' };
  }

  // Context-dependent triggers — give the user a pedagogical explanation
  // when sim options don't match.
  if (triggerType === 'media_received') {
    if (msgType === 'text') {
      return {
        matched: false,
        reason:
          '📷 *Trigger "Media Received"* — active l\'option Simuler en haut du chat et choisis un type de média (image/vidéo/audio), ou envoie un vrai média depuis WhatsApp.',
      };
    }
    return applyFilters()
      ? { matched: true }
      : { matched: false, reason: 'Les filtres du trigger excluent ce type de média.' };
  }

  if (triggerType === 'group_message') {
    if (!isGroup) {
      return {
        matched: false,
        reason:
          '👥 *Trigger "Group Message"* — active l\'option Groupe dans le simulateur, ou teste depuis un vrai groupe WhatsApp.',
      };
    }
    return applyFilters()
      ? { matched: true }
      : { matched: false, reason: 'Les filtres avancés du trigger excluent ce groupe.' };
  }

  if (triggerType === 'contact_message') {
    return applyFilters()
      ? { matched: true }
      : {
          matched: false,
          reason:
            '👤 *Trigger "Contact Message"* — configure l\'expéditeur dans le simulateur ou teste depuis le contact ciblé.',
        };
  }

  if (triggerType === 'new_contact') {
    return {
      matched: false,
      reason:
        '🆕 *Trigger "New Contact"* — se déclenche uniquement pour un contact jamais vu. Impossible à simuler car le contact de test est toujours le même.',
    };
  }

  if (triggerType === 'added_to_group') {
    return {
      matched: false,
      reason:
        '➕ *Trigger "Added to Group"* — se déclenche quand ta session est ajoutée à un groupe. Impossible à simuler depuis le chat de test.',
    };
  }

  if (triggerType === 'webhook') {
    return {
      matched: false,
      reason:
        '🔗 *Trigger "Webhook"* — se déclenche par un appel HTTP externe vers `/api/webhooks`, pas par un message. Teste avec curl ou Postman.',
    };
  }

  if (triggerType === 'schedule') {
    return {
      matched: false,
      reason:
        '⏰ *Trigger "Schedule"* — se déclenche à des heures précises (cron). Pas déclenchable depuis un message de test.',
    };
  }

  // message_received and anything else falls through to filter-based matching.
  if (triggerType === 'message_received') {
    return applyFilters()
      ? { matched: true }
      : { matched: false, reason: 'Les filtres avancés du trigger excluent ce message.' };
  }

  // Unknown trigger type — fail safe (don't silently match).
  return {
    matched: false,
    reason: `⚠️ Type de trigger inconnu : "${triggerType}". Le simulateur ne sait pas comment le tester.`,
  };
}

// --- Route handler ---

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { message, sessionId, simOptions } = await request.json();

    if (!message || typeof message !== 'string') {
      return Response.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Load flow from DB
    const db = getDb();
    const row = db.prepare('SELECT * FROM flows WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return Response.json(
        { success: false, error: 'Flow not found' },
        { status: 404 }
      );
    }

    const flow = parseFlowRow(row);
    const executionId = randomUUID();
    const responses: TestResponse[] = [];

    // Check if there's a paused conversation waiting for a reply
    const pausedState = pausedStates.get(id);
    if (pausedState && (Date.now() - pausedState.timestamp) < 5 * 60 * 1000) {
      // Resume from where we left off
      pausedStates.delete(id);

      const ctx: TestContext = {
        message,
        variables: { ...pausedState.variables, message: message },
      };

      flowExecutionBus.emit({
        type: 'execution:start',
        flowId: flow.id,
        executionId,
        timestamp: new Date().toISOString(),
      });

      // Walk from the resume node
      let resumePaused = false;
      const resumeResult = await walkFlow(
        pausedState.resumeNodeId,
        flow.nodes,
        flow.edges,
        ctx,
        responses,
        new Set(),
        flow.id,
        executionId
      );
      if (resumeResult === 'paused') resumePaused = true;

      flowExecutionBus.emit({
        type: 'execution:end',
        flowId: flow.id,
        executionId,
        timestamp: new Date().toISOString(),
        data: { status: 'success' },
      });

      if (responses.length === 0 && !resumePaused) {
        responses.push('Flow resumed but produced no messages.');
      }

      return Response.json({ success: true, data: { responses, paused: resumePaused } });
    }

    // Clean up expired paused state
    if (pausedState) pausedStates.delete(id);

    // Normal flow: try to start from the trigger node. If there is no trigger,
    // fall back to root nodes (same behaviour as the real engine) so that
    // sub-flows jumped into via `go-to-flow` or orphan flows still run in test mode.
    const triggerNode = flow.nodes.find((n) => n.data.type === 'trigger');

    // Only check trigger-match when a trigger node is present — otherwise any
    // message simply runs the flow's root nodes.
    if (triggerNode) {
      const triggerConfig = triggerNode.data.config || {};
      const result = checkTriggerMatch(flow.trigger, triggerConfig, message);
      if (!result.matched) {
        return Response.json({
          success: true,
          data: {
            responses: result.reason
              ? [`⚠️ *Trigger non déclenché*\n\n${result.reason}`]
              : ['⚠️ Le trigger de ce flow ne correspond pas à ton message.'],
          },
        });
      }
    }

    const ctx: TestContext = {
      message,
      variables: { ...flow.variables },
    };

    flowExecutionBus.emit({
      type: 'execution:start',
      flowId: flow.id,
      executionId,
      timestamp: new Date().toISOString(),
    });

    if (triggerNode) {
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
    }

    // Compute entry points:
    //   - Trigger exists with outgoing edges → start from its children
    //   - Trigger exists but isolated → fall back to root nodes
    //   - No trigger at all → run every root node (no incoming edge)
    let startTargets: string[] = [];
    if (triggerNode) {
      startTargets = getNextNodes(triggerNode.id, flow.edges);
      if (startTargets.length === 0) {
        const withIncoming = new Set(flow.edges.map((e) => e.target));
        startTargets = flow.nodes
          .filter((n) => n.id !== triggerNode.id && !withIncoming.has(n.id))
          .map((n) => n.id);
      }
    } else {
      const withIncoming = new Set(flow.edges.map((e) => e.target));
      startTargets = flow.nodes
        .filter((n) => !withIncoming.has(n.id))
        .map((n) => n.id);
    }

    let flowPaused = false;
    for (const targetId of startTargets) {
      const result = await walkFlow(
        targetId,
        flow.nodes,
        flow.edges,
        ctx,
        responses,
        new Set(),
        flow.id,
        executionId
      );
      if (result === 'paused') { flowPaused = true; break; }
    }

    flowExecutionBus.emit({
      type: 'execution:end',
      flowId: flow.id,
      executionId,
      timestamp: new Date().toISOString(),
      data: { status: 'success' },
    });

    if (responses.length === 0 && !flowPaused) {
      responses.push('Flow executed but produced no messages.');
    }

    return Response.json({ success: true, data: { responses, paused: flowPaused } });
  } catch (error) {
    console.error('Test flow error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test flow',
      },
      { status: 500 }
    );
  }
}
