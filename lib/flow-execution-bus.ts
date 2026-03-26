import { EventEmitter } from 'events';
import type { FlowExecutionEvent } from '@/lib/types';

class FlowExecutionBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  emit(event: FlowExecutionEvent): void {
    this.emitter.emit(`flow:${event.flowId}`, event);
  }

  subscribe(
    flowId: string,
    callback: (event: FlowExecutionEvent) => void
  ): () => void {
    const channel = `flow:${flowId}`;
    this.emitter.on(channel, callback);
    return () => {
      this.emitter.off(channel, callback);
    };
  }
}

// Singleton that survives Next.js hot reloads
const globalForBus = globalThis as unknown as { __flowExecutionBus: FlowExecutionBus };

if (!globalForBus.__flowExecutionBus) {
  globalForBus.__flowExecutionBus = new FlowExecutionBus();
}

const flowExecutionBus = globalForBus.__flowExecutionBus;
export default flowExecutionBus;
