export type ApplicationStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'INTERVIEW'
  | 'REJECTED'
  | 'OFFER'
  | 'JOINED';

export interface Application {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  notes: string | null;
  jobTitle?: string;
  jobCompany?: string;
  jobApplyUrl?: string;
  updatedAt?: Date;
}
