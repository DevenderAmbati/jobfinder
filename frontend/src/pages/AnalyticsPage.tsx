import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { LoadingState } from '../components/LoadingState';
import { api, type AnalyticsSummary } from '../lib/api';

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value}</p>
    </div>
  );
}

export function AnalyticsPage() {
  const summaryQuery = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => {
      const res = await api<{ data: AnalyticsSummary }>('/analytics/summary');
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const data = summaryQuery.data;

  return (
    <section className="page">
      <PageHeader
        title="Analytics"
        description="Monitoring and outcome counters from the local database."
      />

      {summaryQuery.isLoading ? (
        <LoadingState label="Loading summary…" />
      ) : summaryQuery.isError ? (
        <p className="error-text">
          {(summaryQuery.error as Error).message}
        </p>
      ) : data ? (
        <>
          <p className="muted" style={{ fontSize: '0.78rem' }}>
            Threshold used for matched/ignored: {data.matchScoreThresholdUsed}.
            As of {new Date(data.asOf).toLocaleString()}.
          </p>
          <div className="stat-grid">
            <Stat
              label="Companies monitored"
              value={`${data.companiesMonitored} / ${data.companiesTotal}`}
            />
            <Stat label="Jobs checked today" value={data.jobsCheckedToday} />
            <Stat label="Jobs total" value={data.jobsTotal} />
            <Stat label="Matched" value={data.matchedJobs} />
            <Stat label="Ignored / below threshold" value={data.ignoredJobs} />
            <Stat label="Notifications today" value={data.notificationsToday} />
            <Stat
              label="Notifications success (all time)"
              value={data.notificationsSuccess}
            />
            <Stat label="Applied pipeline" value={data.applied} />
            <Stat label="Notifications total" value={data.notificationsTotal} />
          </div>

          <div className="section-block">
            <h2 className="section-title">Applications by status</h2>
            <dl className="filter-grid cols-2" style={{ fontSize: '0.875rem' }}>
              {Object.entries(data.applicationsByStatus).length === 0 ? (
                <p className="muted">No applications yet.</p>
              ) : (
                Object.entries(data.applicationsByStatus).map(
                  ([status, count]) => (
                    <div key={status}>
                      <dt className="field__label">{status}</dt>
                      <dd className="cell-strong">{count}</dd>
                    </div>
                  ),
                )
              )}
            </dl>
          </div>
        </>
      ) : null}
    </section>
  );
}
