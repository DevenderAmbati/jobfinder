import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { Select } from '../components/Select';
import { TableScroll } from '../components/TableScroll';
import { usePagination } from '../hooks/usePagination';
import {
  api,
  type ApplicationItem,
  type ApplicationStatus,
  type JobListItem,
} from '../lib/api';

const STATUSES: ApplicationStatus[] = [
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'OFFER',
  'JOINED',
];

const STATUS_OPTIONS = STATUSES.map((status) => ({
  value: status,
  label: status,
}));

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  ...STATUS_OPTIONS,
];

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [jobId, setJobId] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ['applications', statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await api<{ data: ApplicationItem[] }>(`/applications${qs}`);
      return res.data;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'for-applications'],
    queryFn: async () => {
      const res = await api<{ data: JobListItem[] }>('/jobs?limit=200');
      return res.data;
    },
  });

  const trackedJobIds = useMemo(
    () => new Set((applicationsQuery.data ?? []).map((app) => app.jobId)),
    [applicationsQuery.data],
  );

  const availableJobs = useMemo(
    () => (jobsQuery.data ?? []).filter((job) => job.id && !trackedJobIds.has(job.id)),
    [jobsQuery.data, trackedJobIds],
  );

  const createMutation = useMutation({
    mutationFn: async () =>
      api<{ data: ApplicationItem }>('/applications', {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          status: 'SAVED',
          notes: notes.trim() || null,
        }),
      }),
    onSuccess: () => {
      setJobId('');
      setNotes('');
      setMessage('Application saved.');
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      status: ApplicationStatus;
      notes?: string | null;
    }) =>
      api<{ data: ApplicationItem }>(`/applications/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: input.status,
          notes: input.notes,
        }),
      }),
    onSuccess: () => {
      setMessage('Application updated.');
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const applications = applicationsQuery.data ?? [];
  const pagination = usePagination(applications, 10);
  const { setPage } = pagination;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, setPage]);

  return (
    <section className="page">
      <PageHeader
        title="Applications"
        description="Track Saved → Applied → Interview → Offer → Joined."
      />

      <form
        className="section-block form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!jobId) {
            setMessage('Select a job first.');
            return;
          }
          createMutation.mutate();
        }}
      >
        <h2 className="section-title span-2">Save a job</h2>
        <label className="field span-2">
          <span className="field__label">Job</span>
          <Select
            aria-label="Job"
            value={jobId}
            onChange={setJobId}
            placeholder="Select job…"
            options={[
              { value: '', label: 'Select job…' },
              ...availableJobs.map((job) => ({
                value: job.id!,
                label: `${job.title} — ${job.company}`,
              })),
            ]}
          />
        </label>
        <label className="field span-2">
          <span className="field__label">Notes</span>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="span-2">
          <Button
            type="submit"
            loading={createMutation.isPending}
            loadingText="Saving…"
          >
            Add application
          </Button>
        </div>
      </form>

      <label className="field" style={{ maxWidth: '16rem' }}>
        <span className="field__label">Filter by status</span>
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS}
        />
      </label>

      {message ? <p className="status">{message}</p> : null}

      {applicationsQuery.isLoading ? (
        <LoadingState label="Loading applications…" />
      ) : applicationsQuery.isError ? (
        <p className="error-text">
          {(applicationsQuery.error as Error).message}
        </p>
      ) : (
        <div className="table-panel">
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Apply</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((app) => (
                  <tr key={app.id}>
                    <td className="cell-strong">{app.jobTitle ?? app.jobId}</td>
                    <td>{app.jobCompany ?? '—'}</td>
                    <td>
                      <Select
                        size="sm"
                        aria-label={`Status for ${app.jobTitle ?? app.jobId}`}
                        value={app.status}
                        onChange={(status) =>
                          updateMutation.mutate({
                            id: app.id,
                            status: status as ApplicationStatus,
                            notes: app.notes,
                          })
                        }
                        options={STATUS_OPTIONS}
                      />
                    </td>
                    <td>
                      <input
                        className="input input--sm"
                        style={{ width: '100%', minWidth: '10rem' }}
                        defaultValue={app.notes ?? ''}
                        onBlur={(e) => {
                          const next = e.target.value.trim() || null;
                          if (next !== (app.notes ?? null)) {
                            updateMutation.mutate({
                              id: app.id,
                              status: app.status,
                              notes: next,
                            });
                          }
                        }}
                      />
                    </td>
                    <td>
                      {app.jobApplyUrl ? (
                        <a
                          href={app.jobApplyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="link"
                        >
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {pagination.total === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No applications yet. Save a job above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableScroll>
          <Pagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            total={pagination.total}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            label="applications"
          />
        </div>
      )}
    </section>
  );
}
