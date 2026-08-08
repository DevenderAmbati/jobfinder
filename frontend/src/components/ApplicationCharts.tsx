import type { ApplicationAnalytics, ApplicationStatus } from '../lib/api';

const STATUS_ORDER: ApplicationStatus[] = [
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

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  SAVED: '#7d8680',
  APPLIED: '#1f5c45',
  INTERVIEW: '#2f8f6a',
  REJECTED: '#8f2f2f',
  OFFER: '#8a5a18',
  JOINED: '#143d2e',
};

type Slice = {
  key: ApplicationStatus;
  label: string;
  value: number;
  color: string;
};

function buildSlices(byStatus: Record<string, number>): Slice[] {
  return STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_LABELS[key],
    value: byStatus[key] ?? 0,
    color: STATUS_COLORS[key],
  })).filter((slice) => slice.value > 0);
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

export function StatusBreakdownCharts({
  analytics,
}: {
  analytics: ApplicationAnalytics;
}) {
  const slices = buildSlices(analytics.byStatus);
  const total = analytics.total;
  const barMax = Math.max(1, ...STATUS_ORDER.map((key) => analytics.byStatus[key] ?? 0));

  return (
    <div className="section-block">
      <div className="trend-header">
        <h2 className="section-title">Status breakdown</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          {total} tracked · {analytics.appliedToday} applied today
        </p>
      </div>

      {total === 0 ? (
        <p className="muted">No applications to chart yet.</p>
      ) : (
        <div className="chart-pair">
          <div className="chart-panel">
            <p className="chart-panel__title">By status</p>
            <div className="pie-layout">
              <svg
                className="pie-chart"
                viewBox="0 0 200 200"
                role="img"
                aria-label="Applications by status pie chart"
              >
                {slices.length === 1 ? (
                  <circle
                    cx="100"
                    cy="100"
                    r="78"
                    fill={slices[0].color}
                  />
                ) : (
                  (() => {
                    let angle = 0;
                    return slices.map((slice) => {
                      const sweep = (slice.value / total) * 360;
                      const start = angle;
                      const end = angle + sweep;
                      angle = end;
                      return (
                        <path
                          key={slice.key}
                          d={describeArc(100, 100, 78, start, end)}
                          fill={slice.color}
                        >
                          <title>
                            {slice.label}: {slice.value}
                          </title>
                        </path>
                      );
                    });
                  })()
                )}
                <circle cx="100" cy="100" r="42" fill="var(--bg-soft)" />
                <text
                  x="100"
                  y="96"
                  textAnchor="middle"
                  className="pie-chart__total"
                >
                  {total}
                </text>
                <text
                  x="100"
                  y="114"
                  textAnchor="middle"
                  className="pie-chart__caption"
                >
                  total
                </text>
              </svg>
              <ul className="chart-legend">
                {STATUS_ORDER.map((key) => {
                  const value = analytics.byStatus[key] ?? 0;
                  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                  return (
                    <li key={key} className="chart-legend__item">
                      <span
                        className="chart-legend__swatch"
                        style={{ background: STATUS_COLORS[key] }}
                      />
                      <span className="chart-legend__label">
                        {STATUS_LABELS[key]}
                      </span>
                      <span className="chart-legend__value">
                        {value}
                        <span className="muted"> · {pct}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="chart-panel">
            <p className="chart-panel__title">Counts</p>
            <div
              className="hbar-chart"
              role="img"
              aria-label="Applications by status bar chart"
            >
              {STATUS_ORDER.map((key) => {
                const value = analytics.byStatus[key] ?? 0;
                const width = Math.round((value / barMax) * 100);
                return (
                  <div key={key} className="hbar-chart__row">
                    <span className="hbar-chart__label">
                      {STATUS_LABELS[key]}
                    </span>
                    <div className="hbar-chart__track">
                      <div
                        className="hbar-chart__bar"
                        style={{
                          width: `${width}%`,
                          background: STATUS_COLORS[key],
                        }}
                        title={`${STATUS_LABELS[key]}: ${value}`}
                      />
                    </div>
                    <span className="hbar-chart__value">{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type LinePoint = { label: string; count: number; key: string };

function LineTrendChart({
  title,
  subtitle,
  points,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  points: LinePoint[];
  emptyLabel: string;
}) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const max = Math.max(1, ...points.map((point) => point.count));
  const width = 640;
  const height = 220;
  const padX = 28;
  const padTop = 24;
  const padBottom = 36;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? padX + plotW / 2
        : padX + (index / (points.length - 1)) * plotW;
    const y = padTop + plotH - (point.count / max) * plotH;
    return { ...point, x, y };
  });

  const linePath = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const areaPath =
    coords.length > 0
      ? [
          `M ${coords[0].x} ${padTop + plotH}`,
          ...coords.map((point) => `L ${point.x} ${point.y}`),
          `L ${coords[coords.length - 1].x} ${padTop + plotH}`,
          'Z',
        ].join(' ')
      : '';

  const yTicks = [0, Math.ceil(max / 2), max].filter(
    (value, index, arr) => arr.indexOf(value) === index,
  );

  return (
    <div className="section-block">
      <div className="trend-header">
        <h2 className="section-title">{title}</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          {subtitle} · {total} applied
        </p>
      </div>
      {total === 0 ? (
        <p className="muted">{emptyLabel}</p>
      ) : (
        <div className="line-chart-wrap">
          <svg
            className="line-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={title}
            preserveAspectRatio="xMidYMid meet"
          >
            {yTicks.map((tick) => {
              const y = padTop + plotH - (tick / max) * plotH;
              return (
                <g key={tick}>
                  <line
                    x1={padX}
                    x2={width - padX}
                    y1={y}
                    y2={y}
                    className="line-chart__grid"
                  />
                  <text
                    x={padX - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="line-chart__tick"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}
            <path d={areaPath} className="line-chart__area" />
            <path d={linePath} className="line-chart__line" fill="none" />
            {coords.map((point) => (
              <g key={point.key}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.count > 0 ? 4.5 : 3}
                  className={
                    point.count > 0
                      ? 'line-chart__dot line-chart__dot--active'
                      : 'line-chart__dot'
                  }
                >
                  <title>
                    {point.label}: {point.count}
                  </title>
                </circle>
              </g>
            ))}
            {coords.map((point, index) => {
              const show =
                points.length <= 8 ||
                index === 0 ||
                index === coords.length - 1 ||
                index % Math.ceil(points.length / 7) === 0;
              if (!show) return null;
              return (
                <text
                  key={`${point.key}-label`}
                  x={point.x}
                  y={height - 10}
                  textAnchor="middle"
                  className="line-chart__xlabel"
                >
                  {point.label}
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatWeek(isoDate: string): string {
  return `W ${formatDay(isoDate)}`;
}

export function AppliedTrendCharts({
  analytics,
}: {
  analytics: ApplicationAnalytics;
}) {
  const dailyPoints: LinePoint[] = analytics.dailyApplied.map((point) => ({
    key: point.date,
    label: formatDay(point.date),
    count: point.count,
  }));

  const weeklyPoints: LinePoint[] = analytics.weeklyApplied.map((point) => ({
    key: point.weekStart,
    label: formatWeek(point.weekStart),
    count: point.count,
  }));

  return (
    <div className="trend-stack">
      <LineTrendChart
        title="Daily applied"
        subtitle={`Last ${analytics.days} days`}
        points={dailyPoints}
        emptyLabel="No applications marked applied in this period."
      />
      <LineTrendChart
        title="Weekly applied"
        subtitle={`Last ${analytics.weeks} weeks`}
        points={weeklyPoints}
        emptyLabel="No applications marked applied in these weeks."
      />
    </div>
  );
}
