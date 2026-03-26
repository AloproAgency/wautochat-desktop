import flowExecutionBus from '@/lib/flow-execution-bus';
import type { FlowExecutionEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      // Send initial connected event
      send({ type: 'connected', flowId, timestamp: new Date().toISOString() });

      // Subscribe to flow execution events
      const unsubscribe = flowExecutionBus.subscribe(
        flowId,
        (event: FlowExecutionEvent) => {
          try {
            send(event);
          } catch {
            // Stream may have been closed
          }
        }
      );

      // Keepalive every 30 seconds
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // Stream may have been closed
        }
      }, 30_000);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(keepaliveInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
