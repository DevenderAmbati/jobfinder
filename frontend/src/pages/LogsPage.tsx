import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { TableScroll } from '../components/TableScroll';
import { usePagination } from '../hooks/usePagination';
import {
  api,
  type NotificationLogItem,
  type ProviderLogItem,
} from '../lib/api';

type LogTab = 'providers' | 'notifications';

function formatWhen(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

export function LogsPage() {
  const [tab, setTab] = useState<LogTab>('providers');

  const providerLogsQuery = useQuery({
    queryKey: ['logs-providers'],
    queryFn: async () => {
      const res = await api<{ data: ProviderLogItem[] }>(
        '/logs/providers?limit=500',
      );
      return res.data;
    },
    enabled: tab === 'providers',
    refetchInterval: 15_000,
  });

  const notificationLogsQuery = useQuery({
    queryKey: ['logs-notifications'],
    queryFn: async () => {
      const res = await api<{ data: NotificationLogItem[] }>(
        '/logs/notifications?limit=500',
      );
      return res.data;
    },
    enabled: tab === 'notifications',
    refetchInterval: 15_000,
  });

  return (
    <section className="page">
      <PageHeader
        title="Logs"
        description="Provider runs and notification delivery history."
      />

      <div className="toolbar">
        <div className="tabs">
          <button
            type="button"
            className={['tab', tab === 'providers' ? 'is-active' : ''].join(' ')}
            onClick={() => setTab('providers')}
          >
            Provider runs
          </button>
          <button
            type="button"
            className={[
              'tab',
              tab === 'notifications' ? 'is-active' : '',
            ].join(' ')}
            onClick={() => setTab('notifications')}
          >
            Notifications
          </button>
        </div>
        <span className="spacer" />
        <a href="/api/dev/logs/export" className="btn btn--ghost btn--sm">
          Export
        </a>
      </div>

      {tab === 'providers' ? (
        <ProviderLogsTable query={providerLogsQuery} />
      ) : (
        <NotificationLogsTable query={notificationLogsQuery} />
      )}
    </section>
  );
}

function ProviderLogsTable({
  query,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    data?: ProviderLogItem[];
  };
}) {
  const pagination = usePagination(query.data ?? [], 10);
  const { setPage } = pagination;

  useEffect(() => {
    setPage(1);
  }, [query.data, setPage]);

  if (query.isLoading) {
    return <LoadingState label="Loading provider logs…" />;
  }
  if (query.isError) {
    return <p className="error-text">{(query.error as Error).message}</p>;
  }

  return (
    <div className="table-panel">
      <TableScroll>
        <table className="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Started</th>
              <th>Found</th>
              <th>Added</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="cell-strong">{row.provider}</td>
                <td>{formatWhen(row.startTime)}</td>
                <td>{row.jobsFound}</td>
                <td>{row.jobsAdded}</td>
                <td>{row.durationMs != null ? `${row.durationMs} ms` : '—'}</td>
                <td
                  className="muted"
                  style={{
                    maxWidth: '18rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.error ?? ''}
                >
                  {row.error ?? '—'}
                </td>
              </tr>
            ))}
            {pagination.total === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No provider logs yet.
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
        label="runs"
      />
    </div>
  );
}

function NotificationLogsTable({
  query,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    data?: NotificationLogItem[];
  };
}) {
  const pagination = usePagination(query.data ?? [], 10);
  const { setPage } = pagination;

  useEffect(() => {
    setPage(1);
  }, [query.data, setPage]);

  if (query.isLoading) {
    return <LoadingState label="Loading notification logs…" />;
  }
  if (query.isError) {
    return <p className="error-text">{(query.error as Error).message}</p>;
  }

  return (
    <div className="table-panel">
      <TableScroll>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Job</th>
              <th>Channel</th>
              <th>Success</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((row) => (
              <tr key={row.id}>
                <td>{formatWhen(row.createdAt)}</td>
                <td className="mono">{row.jobId}</td>
                <td>{row.channel}</td>
                <td className={row.success ? 'ok-text' : 'error-text'}>
                  {row.success ? 'Yes' : 'No'}
                </td>
                <td
                  className="muted"
                  style={{
                    maxWidth: '18rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.error ?? row.payload ?? ''}
                >
                  {row.error ?? row.payload ?? '—'}
                </td>
              </tr>
            ))}
            {pagination.total === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No notification logs yet.
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
        label="notifications"
      />
    </div>
  );
}
