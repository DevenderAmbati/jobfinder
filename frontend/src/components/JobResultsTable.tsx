import { Pagination } from './Pagination';
import { TableScroll } from './TableScroll';
import type { PaginationState } from '../hooks/usePagination';
import type { ApplicationItem, ApplicationStatus, JobListItem } from '../lib/api';
import {
  extractExternalJobId,
  extractMatchedSkills,
  formatCtc,
  formatExperience,
  formatPostedRelative,
} from '../lib/jobFormat';

export function formatFetchWindow(
  startedAt: string | null,
  fetchedAt: string | null,
): string | null {
  if (!fetchedAt) {
    return null;
  }
  const endLabel = formatFetchStamp(fetchedAt);
  if (!startedAt) {
    return endLabel;
  }
  const start = new Date(startedAt).getTime();
  const end = new Date(fetchedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 60_000) {
    return endLabel;
  }
  return `${formatFetchStamp(startedAt)} – ${endLabel}`;
}

export function formatFetchStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface JobResultsTableProps {
  pagination: PaginationState<JobListItem>;
  matchThreshold: number;
  hasResume: boolean;
  applicationByJobId: Map<string, ApplicationItem>;
  actionJobId: string | null;
  onTrack: (input: {
    jobId: string;
    status: ApplicationStatus;
    applicationId?: string;
    remove?: boolean;
  }) => void;
  emptyMessage: string;
  showFetchedAt?: boolean;
}

export function JobResultsTable({
  pagination,
  matchThreshold,
  hasResume,
  applicationByJobId,
  actionJobId,
  onTrack,
  emptyMessage,
  showFetchedAt = false,
}: JobResultsTableProps) {
  const columnCount = showFetchedAt ? 10 : 9;

  return (
    <div className="table-panel">
      <TableScroll>
        <table className="data-table data-table--jobs">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Role</th>
              <th>Company</th>
              <th>Location</th>
              <th>Experience</th>
              <th>CTC</th>
              <th>Posted</th>
              {showFetchedAt ? <th>Fetched</th> : null}
              <th>Match</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((job) => {
              const matchedSkills = extractMatchedSkills(job.matchReasons);
              const missingSkills = (job.missingSkills ?? []).slice(0, 6);
              const jobId = job.id;
              const tracked = jobId ? applicationByJobId.get(jobId) : undefined;
              const isBookmarked = Boolean(tracked);
              const isApplied =
                tracked != null &&
                tracked.status !== 'SAVED' &&
                tracked.status !== 'REJECTED';
              const busy = Boolean(jobId && actionJobId === jobId);
              return (
                <tr key={jobId ?? `${job.title}-${job.applyUrl}`}>
                  <td className="mono cell-meta">
                    {extractExternalJobId(job.applyUrl) ?? '—'}
                  </td>
                  <td>
                    <div className="cell-strong">{job.title}</div>
                    <div className="cell-meta">
                      {[job.provider, job.recommendation, job.matchSource]
                        .filter(Boolean)
                        .join(' · ') || null}
                    </div>
                    {matchedSkills.length > 0 ? (
                      <div
                        className="cell-meta cell-skills cell-skills--matched"
                        title={matchedSkills.join(', ')}
                      >
                        Matched: {matchedSkills.join(', ')}
                      </div>
                    ) : null}
                    {missingSkills.length > 0 ? (
                      <div
                        className="cell-meta cell-skills cell-skills--missing"
                        title={missingSkills.join(', ')}
                      >
                        Missing: {missingSkills.join(', ')}
                      </div>
                    ) : null}
                    {!matchedSkills.length && !missingSkills.length && job.skills ? (
                      <div className="cell-meta cell-skills" title={job.skills}>
                        {job.skills}
                      </div>
                    ) : null}
                  </td>
                  <td>{job.company}</td>
                  <td>{job.location ?? '—'}</td>
                  <td>
                    {formatExperience(job.experience, job.description, job.title)}
                  </td>
                  <td>{formatCtc(job.salary, job.salaryEstimate)}</td>
                  <td>
                    <span
                      title={
                        job.postedDate || job.createdAt
                          ? new Date(
                              job.postedDate ?? job.createdAt!,
                            ).toLocaleString()
                          : undefined
                      }
                    >
                      {formatPostedRelative(job.postedDate, job.createdAt)}
                    </span>
                  </td>
                  {showFetchedAt ? (
                    <td>
                      {job.createdAt ? formatFetchStamp(job.createdAt) : '—'}
                    </td>
                  ) : null}
                  <td>
                    {typeof job.matchScore === 'number' ? (
                      <span
                        className={
                          job.matchScore >= matchThreshold
                            ? 'match-score match-score--strong'
                            : 'match-score'
                        }
                        title={
                          job.matchScore >= matchThreshold
                            ? `Meets your ${matchThreshold}% threshold`
                            : `Below your ${matchThreshold}% threshold`
                        }
                      >
                        {`${Math.round(job.matchScore)}%`}
                      </span>
                    ) : (
                      <span
                        className="match-score match-score--pending"
                        title={
                          hasResume
                            ? 'Match score is calculating…'
                            : 'Add a resume to score this job'
                        }
                      >
                        {hasResume ? '…' : '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="job-actions">
                      <a
                        href={job.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={[
                          'btn',
                          'btn--sm',
                          'job-apply',
                          isApplied ? 'btn--primary' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-disabled={!jobId || busy}
                        onClick={(e) => {
                          if (!jobId || busy) {
                            e.preventDefault();
                            return;
                          }
                          if (!isApplied) {
                            onTrack({ jobId, status: 'APPLIED' });
                          }
                        }}
                      >
                        {isApplied ? 'Applied' : 'Apply ↗'}
                      </a>
                      <button
                        type="button"
                        className={[
                          'job-action-icon',
                          isBookmarked ? 'is-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        disabled={!jobId || busy}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark job'}
                        aria-label={
                          isBookmarked ? 'Remove bookmark' : 'Bookmark job'
                        }
                        onClick={() => {
                          if (!jobId) {
                            return;
                          }
                          if (tracked) {
                            onTrack({
                              jobId,
                              status: 'SAVED',
                              applicationId: tracked.id,
                              remove: true,
                            });
                            return;
                          }
                          onTrack({ jobId, status: 'SAVED' });
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          aria-hidden="true"
                        >
                          {isBookmarked ? (
                            <path
                              fill="currentColor"
                              d="M6 2h12a1 1 0 0 1 1 1v19l-7-4-7 4V3a1 1 0 0 1 1-1z"
                            />
                          ) : (
                            <path
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              d="M6 3h12a1 1 0 0 1 1 1v16.5L12 16l-7 4.5V4a1 1 0 0 1 1-1z"
                            />
                          )}
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pagination.total === 0 ? (
              <tr>
                <td colSpan={columnCount} className="empty">
                  {emptyMessage}
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
        label="jobs"
      />
    </div>
  );
}
