import type { Application, ApplicationStatus } from '../entities/Application.js';

export interface ApplicationRepository {
  findAll(userId: string): Promise<Application[]>;
  findByJobId(userId: string, jobId: string): Promise<Application | null>;
  create(
    userId: string,
    jobId: string,
    status?: ApplicationStatus,
    notes?: string | null,
  ): Promise<Application>;
  updateStatus(
    userId: string,
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<Application>;
  delete(userId: string, id: string): Promise<void>;
}
