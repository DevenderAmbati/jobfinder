import type { Application, ApplicationStatus } from '../entities/Application.js';

export interface ApplicationRepository {
  findAll(): Promise<Application[]>;
  findByJobId(jobId: string): Promise<Application | null>;
  create(jobId: string, status?: ApplicationStatus, notes?: string | null): Promise<Application>;
  updateStatus(id: string, status: ApplicationStatus, notes?: string | null): Promise<Application>;
}
