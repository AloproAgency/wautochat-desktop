import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import flowExecutionBus from '@/lib/flow-execution-bus';
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
        return new RegExp(value, 'i').test(actual);
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

// Walk the flow graph collecting responses (no real client needed)
async function walkFlow(
  nodeId: string,
  nodes: FlowNodeSerialized[],
  edges: FlowEdgeSerialized[],
  ctx: TestContext,
  responses: string[],
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
        const url = (config.url as string) || (config.imageUrl as string) || 'image';
        responses.push(caption ? `[Image: ${caption}]` : `[Image: ${url}]`);
        break;
      }

      case 'send-video': {
        const caption = interpolateTestVariables((config.caption as string) || '', ctx);
        const url = (config.url as string) || (config.videoUrl as string) || 'video';
        responses.push(caption ? `[Video: ${caption}]` : `[Video: ${url}]`);
        break;
      }

      case 'send-audio': {
        responses.push('[Audio message]');
        break;
      }

      case 'send-file': {
        const fileName = (config.fileName as string) || (config.name as string) || 'file';
        responses.push(`[File: ${fileName}]`);
        break;
      }

      case 'send-location': {
        const title = interpolateTestVariables((config.title as string) || 'Location', ctx);
        responses.push(`[Location: ${title}]`);
        break;
      }

      case 'send-contact': {
        const contactId = (config.contactId as string) || 'contact';
        responses.push(`[Contact: ${contactId}]`);
        break;
      }

      case 'send-sticker': {
        responses.push('[Sticker]');
        break;
      }

      case 'send-list': {
        const listTitle = interpolateTestVariables((config.title as string) || 'List', ctx);
        const listDescription = interpolateTestVariables((config.description as string) || '', ctx);
        const sections = (config.sections as Array<Record<string, unknown>>) || [];

        let listText = `*${listTitle}*`;
        if (listDescription) listText += `\n${listDescription}`;
        for (const section of sections) {
          listText += `\n\n_${(section.title as string) || 'Options'}_`;
          const rows = (section.rows as Array<Record<string, unknown>>) || [];
          for (const row of rows) {
            listText += `\n  - ${(row.title as string) || ''}`;
            if (row.description) listText += ` (${row.description})`;
          }
        }
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
        const btnText = interpolateTestVariables(
          (config.text as string) || (config.message as string) || '',
          ctx
        );
        const buttons = (config.buttons as Array<Record<string, unknown>>) || [];
        let buttonMsg = btnText || '';
        if (buttons.length > 0) {
          buttonMsg += '\n';
          for (const btn of buttons) {
            buttonMsg += `\n[ ${(btn.text as string) || (btn.label as string) || 'Button'} ]`;
          }
        }
        responses.push(buttonMsg);
        break;
      }

      case 'send-reaction': {
        const emoji = (config.emoji as string) || (config.reaction as string) || '';
        if (emoji) responses.push(`[Reaction: ${emoji}]`);
        break;
      }

      case 'condition': {
        const field = (config.field as string) || 'messageBody';
        const operator = (config.operator as string) || 'contains';
        const condValue = interpolateTestVariables((config.value as string) || '', ctx);

        let actual = '';
        if (field === 'messageBody') {
          actual = ctx.message;
        } else if (field === 'sender') {
          actual = 'test-user@c.us';
        } else if (field === 'chatId') {
          actual = 'test-user@c.us';
        } else {
          actual = ctx.variables[field] || '';
        }

        const matched = evaluateCondition(operator, condValue, actual);

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

        // Follow matching branch
        const trueTargets = getNextNodes(node.id, edges, matched ? 'true' : 'yes');
        const falseTargets = getNextNodes(node.id, edges, matched ? 'false' : 'no');
        const matchTargets = matched
          ? [...trueTargets, ...getNextNodes(node.id, edges, 'true')]
          : [...falseTargets, ...getNextNodes(node.id, edges, 'false')];
        const uniqueTargets = [...new Set(matchTargets)];

        if (uniqueTargets.length === 0) {
          const defaultTargets = getNextNodes(node.id, edges);
          if (matched && defaultTargets.length > 0) {
            for (const t of defaultTargets) {
              const r = await walkFlow(t, nodes, edges, ctx, responses, visited, flowId, executionId);
              if (r === 'paused') return 'paused';
            }
          }
        } else {
          for (const t of uniqueTargets) {
            const r = await walkFlow(t, nodes, edges, ctx, responses, visited, flowId, executionId);
            if (r === 'paused') return 'paused';
          }
        }
        return 'done';
      }

      case 'delay': {
        // Skip delay in test mode but still emit events
        break;
      }

      case 'set-variable': {
        const varName = (config.variableName as string) || (config.name as string) || (config.variable as string) || '';
        let varValue = interpolateTestVariables((config.value as string) || '', ctx);

        if (config.source === 'messageBody') {
          varValue = ctx.message;
        } else if (config.source === 'sender') {
          varValue = 'test-user@c.us';
        }

        if (varName) {
          ctx.variables[varName] = varValue;
        }
        break;
      }

      case 'http-request': {
        // Skip HTTP requests in test mode
        const responseVar = (config.responseVariable as string) || (config.saveAs as string) || '';
        if (responseVar) {
          ctx.variables[responseVar] = '[Test mode: HTTP request skipped]';
        }
        ctx.variables['__http_status'] = '200';
        ctx.variables['__http_response'] = '[Test mode: HTTP request skipped]';
        responses.push('[HTTP request would be sent in live mode]');
        break;
      }

      case 'ai-response': {
        const prompt = interpolateTestVariables((config.prompt as string) || '', ctx);
        const aiVar = (config.responseVariable as string) || 'aiResponse';
        ctx.variables[aiVar] = `[AI would respond to: "${ctx.message}"]`;
        responses.push(`[AI Response - prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"]`);
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

      case 'assign-label':
      case 'remove-label':
      case 'add-to-group':
      case 'remove-from-group':
      case 'block-contact':
      case 'unblock-contact':
      case 'forward-message':
      case 'mark-as-read':
      case 'typing-indicator': {
        // Action nodes skipped in test mode
        break;
      }

      case 'go-to-flow': {
        responses.push('[Go to another flow - skipped in test mode]');
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
      data: { status: 'error', error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startTime },
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

// Check if trigger matches the message
function checkTriggerMatch(
  trigger: Flow['trigger'],
  triggerConfig: Record<string, unknown>,
  message: string
): boolean {
  const triggerType = trigger?.type || (triggerConfig.triggerType as string) || 'message_received';

  switch (triggerType) {
    case 'message_received':
      return true; // Any message triggers

    case 'keyword': {
      const rawKeywords = triggerConfig.keywords || triggerConfig.keyword || '';
      const keywords = (typeof rawKeywords === 'string'
        ? rawKeywords.split(/[,\n]/).map((k: string) => k.trim()).filter(Boolean)
        : Array.isArray(rawKeywords) ? rawKeywords : []) as string[];
      if (keywords.length === 0) return true;
      const matchMode = (triggerConfig.matchMode as string) || 'contains';
      const lowerMsg = message.toLowerCase();

      return keywords.some((kw: string) => {
        const lowerKw = kw.toLowerCase();
        switch (matchMode) {
          case 'exact': return lowerMsg === lowerKw;
          case 'startsWith': return lowerMsg.startsWith(lowerKw);
          case 'contains': return lowerMsg.includes(lowerKw);
          default: return lowerMsg.includes(lowerKw);
        }
      });
    }

    case 'regex': {
      const pattern = (triggerConfig.pattern as string) || (triggerConfig.regex as string) || '';
      if (!pattern) return true;
      try {
        return new RegExp(pattern, 'i').test(message);
      } catch {
        return false;
      }
    }

    // For test mode, these triggers always match
    case 'contact_message':
    case 'group_message':
    case 'media_received':
    case 'new_contact':
    case 'added_to_group':
    case 'webhook':
    case 'schedule':
      return true;

    default:
      return true;
  }
}

// --- Route handler ---

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { message, sessionId } = await request.json();

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
    const responses: string[] = [];

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

    // Normal flow: start from trigger
    const triggerNode = flow.nodes.find((n) => n.data.type === 'trigger');
    if (!triggerNode) {
      return Response.json({
        success: true,
        data: { responses: ['No trigger node configured in this flow.'] },
      });
    }

    const triggerConfig = triggerNode.data.config || {};
    const matched = checkTriggerMatch(flow.trigger, triggerConfig, message);

    if (!matched) {
      return Response.json({
        success: true,
        data: { responses: [] },
      });
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

    let flowPaused = false;
    const startTargets = getNextNodes(triggerNode.id, flow.edges);
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
