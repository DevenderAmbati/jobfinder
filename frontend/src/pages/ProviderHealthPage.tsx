import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { TableScroll } from '../components/TableScroll';
import { usePagination } from '../hooks/usePagination';
import { api, type ProviderHealthItem } from '../lib/api';

function formatWhen(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

function statusClass(status: ProviderHealthItem['status']): string {
  switch (status) {
    case 'SUCCESS':
      return 'ok-text';
    case 'FAILURE':
      return 'error-text';
    case 'RUNNING':
      return 'warn-text';
    default:
      return 'muted';
  }
}

export function ProviderHealthPage() {
  const healthQuery = useQuery({
    queryKey: ['provider-health'],
    queryFn: async () => {
      const res = await api<{ data: ProviderHealthItem[] }>('/providers/health');
      return res.data;
    },
    refetchInterval: 15_000,
  });

  const pagination = usePagination(healthQuery.data ?? [], 10);

  return (
    <section className="page">
      <PageHeader
        title="Providers"
        description="Status, latency, and failure metrics per ATS provider."
      />

      {healthQuery.isLoading ? (
        <LoadingState label="Loading health…" />
      ) : healthQuery.isError ? (
        <p className="error-text">{(healthQuery.error as Error).message}</p>
      ) : (
        <div className="table-panel">
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Last run</th>
                  <th>Last success</th>
                  <th>Avg ms</th>
                  <th>Failures</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-strong">{row.provider}</td>
                    <td className={statusClass(row.status)}>{row.status}</td>
                    <td>{formatWhen(row.lastRun)}</td>
                    <td>{formatWhen(row.lastSuccess)}</td>
                    <td>{Math.round(row.averageExecutionTime)}</td>
                    <td>{row.failureCount}</td>
                    <td
                      className="muted"
                      style={{
                        maxWidth: '16rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.lastError ?? ''}
                    >
                      {row.lastError ?? '—'}
                    </td>
                  </tr>
                ))}
                {pagination.total === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No provider health rows yet. Seed the database or run a
                      provider.
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
            label="providers"
          />
        </div>
      )}
    </section>
  );
}
