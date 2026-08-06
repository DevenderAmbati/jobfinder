import type {
  JobQueue,
  QueueWorkHandler,
  QueueWorkItem,
} from '../../domain/ports/JobQueue.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * In-memory FIFO queue. Sequential worker (SQLite-friendly).
 * Scheduler must only call enqueue — never business logic.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly items: QueueWorkItem[] = [];
  private running = false;
  private processing = false;
  private handler: QueueWorkHandler | null = null;

  async enqueue(
    item: Omit<QueueWorkItem, 'id' | 'enqueuedAt'>,
  ): Promise<string> {
    const id = crypto.randomUUID();
    this.items.push({
      ...item,
      id,
      enqueuedAt: new Date(),
    });
    void this.pump();
    return id;
  }

  start(handler: QueueWorkHandler): void {
    this.handler = handler;
    this.running = true;
    void this.pump();
  }

  stop(): void {
    this.running = false;
  }

  size(): number {
    return this.items.length;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async pump(): Promise<void> {
    if (!this.running || !this.handler || this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (this.running && this.items.length > 0) {
        const item = this.items.shift();
        if (!item || !this.handler) {
          break;
        }
        try {
          await this.handler(item);
        } catch (error) {
          logger.error('Queue item failed — continuing', {
            id: item.id,
            type: item.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
