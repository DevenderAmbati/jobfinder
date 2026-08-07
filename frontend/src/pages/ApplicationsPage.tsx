import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { Select } from '../components/Select';
import { TableScroll } from '../components/TableScroll';
import { usePagination } from '../hooks/usePagination';
import {
  api,
  type ApplicationItem,
  type ApplicationStatus,
} from '../lib/api';
import { extractExternalJobId } from '../lib/jobFormat';

const STATUSES: ApplicationStatus[] = [
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'OFFER',
  'JOINED',
];

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Bookmarked',
  APPLIED: 'Applied',
  INTERVIEW: 'Interview',
  REJECTED: 'Rejected',
  OFFER: 'Offer',
  JOINED: 'Joined',
};

const CLEAR_VALUE = 'CLEAR';

const STATUS_OPTIONS = [
  ...STATUSES.map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
  { value: CLEAR_VALUE, label: 'Clear' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  ...STATUSES.map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
];

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ['applications', statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await api<{ data: ApplicationItem[] }>(`/applications${qs}`);
      return res.data;
    },
  });

  const invalidateApplications = () => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
  };

  const statusMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      status: string;
      notes?: string | null;
    }) => {
      if (input.status === CLEAR_VALUE || input.status === '__clear__') {
        await api(`/applications/${input.id}`, { method: 'DELETE' });
        return { cleared: true as const };
      }
      const res = await api<{ data: ApplicationItem }>(
        `/applications/${input.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: input.status,
            notes: input.notes,
          }),
        },
      );
      return { cleared: false as const, data: res.data };
    },
    onSuccess: (result) => {
      setMessage(
        result.cleared ? 'Application cleared.' : 'Application updated.',
      );
      invalidateApplications();
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
        description="Bookmarked and applied roles from the Jobs table."
      />

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
                  <th>Job ID</th>
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
                    <td className="mono cell-meta">
                      {extractExternalJobId(app.jobApplyUrl) ?? '—'}
                    </td>
                    <td className="cell-strong">{app.jobTitle ?? app.jobId}</td>
                    <td>{app.jobCompany ?? '—'}</td>
                    <td>
                      <Select
                        size="sm"
                        aria-label={`Status for ${app.jobTitle ?? app.jobId}`}
                        value={app.status}
                        disabled={statusMutation.isPending}
                        onChange={(status) => {
                          statusMutation.mutate({
                            id: app.id,
                            status,
                            notes: app.notes,
                          });
                        }}
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
                            statusMutation.mutate({
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
                    <td colSpan={6} className="empty">
                      No applications yet. Bookmark or mark applied from Jobs.
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
