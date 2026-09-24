export type QueueWorkType = 'FetchCompanyJobs';

export interface QueueWorkItem {
  id: string;
  type: QueueWorkType;
  payload: {
    companyId: string;
  };
  enqueuedAt: Date;
}

export type QueueWorkHandler = (item: QueueWorkItem) => Promise<void>;

/**
 * Port for async processing. V1: in-memory implementation in infrastructure.
 * Scheduler enqueues; workers invoke application use cases.
 */
export interface JobQueue {
  enqueue(item: Omit<QueueWorkItem, 'id' | 'enqueuedAt'>): Promise<string>;
  start(handler: QueueWorkHandler): void;
  stop(): void;
  size(): number;
  /** Resolves when the queue is empty and not processing an item. */
  idle(): Promise<void>;
}
