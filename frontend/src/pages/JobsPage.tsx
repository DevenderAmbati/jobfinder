import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { Select } from '../components/Select';
import { MultiSelect } from '../components/MultiSelect';
import { TableScroll } from '../components/TableScroll';
import { usePagination } from '../hooks/usePagination';
import {
  api,
  type ApplicationItem,
  type ApplicationStatus,
  type Company,
  type JobFacets,
  type JobListItem,
  type ResumeData,
  type RuleConfig,
} from '../lib/api';
import {
  formatCtc,
  formatExperience,
  formatPostedRelative,
  extractMatchedSkills,
  extractExternalJobId,
  isIndiaLocation,
} from '../lib/jobFormat';

const PROVIDERS = [
  'stub',
  'greenhouse',
  'lever',
  'workday',
  'microsoft',
  'ashby',
  'smartrecruiters',
  'successfactors',
  'oracle',
  'eightfold',
  'avature',
  'sap',
  'goldman',
  'custom',
] as const;

const PROVIDER_OPTIONS = [
  { value: '', label: 'All providers' },
  ...PROVIDERS.map((name) => ({ value: name, label: name })),
];

const POSTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
] as const;

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest first' },
  { value: 'match-desc', label: 'Highest match' },
  { value: 'match-asc', label: 'Lowest match' },
] as const;

type JobSort = (typeof SORT_OPTIONS)[number]['value'];

const emptyFilters = {
  search: '',
  companyIds: [] as string[],
  roles: [] as string[],
  postedWithin: '',
  provider: '',
};

export function JobsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [onlyAboveThreshold, setOnlyAboveThreshold] = useState(false);
  const [sortBy, setSortBy] = useState<JobSort>('latest');
  const [actionJobId, setActionJobId] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const res = await api<{ data: RuleConfig | null }>('/rules');
      return res.data;
    },
  });

  const resumeQuery = useQuery({
    queryKey: ['resume'],
    queryFn: async () => {
      const res = await api<{ data: ResumeData | null }>('/resume');
      return res.data;
    },
  });

  const matchThreshold = rulesQuery.data?.minMatchScore ?? 50;
  const hasResume = Boolean(resumeQuery.data);
  const resumeReady = !resumeQuery.isLoading;

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api<{ data: Company[] }>('/companies');
      return res.data;
    },
  });

  const facetsQuery = useQuery({
    queryKey: ['jobs-facets'],
    queryFn: async () => {
      const res = await api<{ data: JobFacets }>('/jobs/facets');
      return res.data;
    },
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.provider) params.set('provider', filters.provider);
    for (const companyId of filters.companyIds) {
      params.append('companyId', companyId);
    }
    for (const role of filters.roles) {
      params.append('role', role);
    }
    if (filters.postedWithin) params.set('postedWithin', filters.postedWithin);
    // With a resume: only rows that already have a JobMatch for this user.
    // Without one: show the shared catalog (scores render as —).
    if (hasResume) {
      params.set('scored', 'true');
      if (onlyAboveThreshold) {
        params.set('scoreMin', String(matchThreshold));
      }
    }
    // Shared catalog can be 10k+ rows; keep enough headroom for older postings.
    params.set('limit', '20000');
    return params.toString();
  }, [filters, matchThreshold, onlyAboveThreshold, hasResume]);

  const jobsQuery = useQuery({
    queryKey: ['jobs', queryString],
    queryFn: async () => {
      const res = await api<{ data: JobListItem[] }>(`/jobs?${queryString}`);
      return res.data;
    },
    enabled: !rulesQuery.isLoading && resumeReady,
  });

  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await api<{ data: ApplicationItem[] }>('/applications');
      return res.data;
    },
  });

  const applicationByJobId = useMemo(() => {
    const map = new Map<string, ApplicationItem>();
    for (const app of applicationsQuery.data ?? []) {
      map.set(app.jobId, app);
    }
    return map;
  }, [applicationsQuery.data]);

  const trackMutation = useMutation({
    mutationFn: async (input: {
      jobId: string;
      status: ApplicationStatus;
      applicationId?: string;
      remove?: boolean;
    }) => {
      if (input.remove && input.applicationId) {
        await api(`/applications/${input.applicationId}`, {
          method: 'DELETE',
        });
        return null;
      }
      return api<{ data: ApplicationItem }>('/applications', {
        method: 'POST',
        body: JSON.stringify({
          jobId: input.jobId,
          status: input.status,
        }),
      });
    },
    onMutate: (input) => {
      setActionJobId(input.jobId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
    onSettled: () => {
      setActionJobId(null);
    },
  });

  const jobs = useMemo(() => {
    const india = (jobsQuery.data ?? []).filter((job) =>
      isIndiaLocation(job.location),
    );
    if (sortBy === 'latest') {
      return india;
    }
    const scored = [...india];
    scored.sort((a, b) => {
      const scoreA = a.matchScore ?? -1;
      const scoreB = b.matchScore ?? -1;
      if (scoreA !== scoreB) {
        return sortBy === 'match-desc' ? scoreB - scoreA : scoreA - scoreB;
      }
      const dateA = new Date(a.postedDate ?? a.createdAt ?? 0).getTime();
      const dateB = new Date(b.postedDate ?? b.createdAt ?? 0).getTime();
      return dateB - dateA;
    });
    return scored;
  }, [jobsQuery.data, sortBy]);
  const pagination = usePagination(jobs, 10);
  const { setPage } = pagination;

  useEffect(() => {
    setPage(1);
  }, [queryString, sortBy, setPage]);

  const roleOptions = useMemo(() => {
    const fromFacets = facetsQuery.data?.roles ?? [];
    const merged = new Set(fromFacets);
    for (const role of filters.roles) {
      merged.add(role);
    }
    return [...merged]
      .sort((a, b) => a.localeCompare(b))
      .map((role) => ({ value: role, label: role }));
  }, [facetsQuery.data?.roles, filters.roles]);

  const companyOptions = useMemo(() => {
    const companies = companiesQuery.data ?? [];
    return companies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((company) => ({ value: company.id, label: company.name }));
  }, [companiesQuery.data]);

  const activeFilterCount = [
    filters.search,
    filters.provider,
    filters.postedWithin,
    ...filters.companyIds,
    ...filters.roles,
  ].filter((value) => value.trim()).length;

  const aboveThresholdCount = jobs.filter(
    (job) => (job.matchScore ?? 0) >= matchThreshold,
  ).length;

  function patchFilters(patch: Partial<typeof emptyFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  return (
    <section className="page">
      <PageHeader
        eyebrow={hasResume ? 'Matched to your resume' : 'Shared job catalog'}
        title="Jobs for you"
        description={
          hasResume
            ? 'India-based resume matches. Sort by latest posting or match score.'
            : 'Browsing India listings without match scores. Add a resume to score them.'
        }
      />

      <div className="match-summary">
        <div>
          <span className="match-summary__value">
            {hasResume ? aboveThresholdCount : '—'}
          </span>
          <span className="match-summary__label">
            Above your {matchThreshold}% threshold
          </span>
        </div>
        <div>
          <span className="match-summary__value">{jobs.length || '—'}</span>
          <span className="match-summary__label">
            {hasResume ? 'India matches' : 'India listings'}
          </span>
        </div>
        <div>
          <span className="match-summary__value">
            {hasResume ? 'Ready' : 'Missing'}
          </span>
          <span className="match-summary__label">Resume profile</span>
        </div>
      </div>

      {!resumeQuery.isLoading && !hasResume ? (
        <div className="match-notice">
          Showing all India jobs without scores. Add a resume in Settings to
          calculate match percentages.
          <a className="link" href="/settings">
            Open Settings
          </a>
        </div>
      ) : null}

      <div className="jobs-toolbar">
        <label className="field jobs-toolbar__search">
          <span className="field__label">
            {hasResume ? 'Search your matches' : 'Search jobs'}
          </span>
          <input
            className="input"
            value={filters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
            placeholder="Role, company…"
          />
        </label>
        <label className="field jobs-toolbar__sort">
          <span className="field__label">Sort</span>
          <Select
            aria-label="Sort jobs"
            value={sortBy}
            onChange={(value) => setSortBy(value as JobSort)}
            options={[...SORT_OPTIONS]}
          />
        </label>
        <div className="jobs-toolbar__actions">
          {hasResume ? (
            <Button
              variant={onlyAboveThreshold ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setOnlyAboveThreshold((only) => !only)}
            >
              {matchThreshold}%+ only
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters((visible) => !visible)}
          >
            {showFilters ? 'Hide filters' : 'Refine results'}
          </Button>
          {activeFilterCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(emptyFilters)}
            >
              Clear {activeFilterCount}
            </Button>
          ) : null}
        </div>
      </div>

      {showFilters ? (
        <div className="jobs-filters">
          <div className="filter-grid cols-4">
            <label className="field">
              <span className="field__label">Role</span>
              <MultiSelect
                aria-label="Role"
                value={filters.roles}
                onChange={(roles) => patchFilters({ roles })}
                options={roleOptions}
                placeholder="All roles"
                searchPlaceholder="Search roles…"
              />
            </label>
            <label className="field">
              <span className="field__label">Posted</span>
              <Select
                aria-label="Posted"
                value={filters.postedWithin}
                onChange={(postedWithin) => patchFilters({ postedWithin })}
                options={[...POSTED_OPTIONS]}
              />
            </label>
            <label className="field">
              <span className="field__label">Company</span>
              <MultiSelect
                aria-label="Company"
                value={filters.companyIds}
                onChange={(companyIds) => patchFilters({ companyIds })}
                options={companyOptions}
                placeholder="All companies"
                searchPlaceholder="Search companies…"
              />
            </label>
            <label className="field">
              <span className="field__label">Source</span>
              <Select
                aria-label="Source"
                value={filters.provider}
                onChange={(provider) => patchFilters({ provider })}
                options={PROVIDER_OPTIONS}
              />
            </label>
          </div>
        </div>
      ) : null}

      {jobsQuery.isLoading || rulesQuery.isLoading || resumeQuery.isLoading ? (
        <LoadingState label="Loading jobs…" />
      ) : jobsQuery.isError ? (
        <p className="error-text">{(jobsQuery.error as Error).message}</p>
      ) : (
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
                  <th>Match</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((job) => {
                  const matchedSkills = extractMatchedSkills(job.matchReasons);
                  const missingSkills = (job.missingSkills ?? []).slice(0, 6);
                  const jobId = job.id;
                  const tracked = jobId
                    ? applicationByJobId.get(jobId)
                    : undefined;
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
                      {!matchedSkills.length &&
                      !missingSkills.length &&
                      job.skills ? (
                        <div className="cell-meta cell-skills" title={job.skills}>
                          {job.skills}
                        </div>
                      ) : null}
                    </td>
                    <td>{job.company}</td>
                    <td>{job.location ?? '—'}</td>
                    <td>
                      {formatExperience(
                        job.experience,
                        job.description,
                        job.title,
                      )}
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
                    <td>
                      <span
                        className={
                          (job.matchScore ?? 0) >= matchThreshold
                            ? 'match-score match-score--strong'
                            : 'match-score'
                        }
                        title={
                          (job.matchScore ?? 0) >= matchThreshold
                            ? `Meets your ${matchThreshold}% threshold`
                            : `Below your ${matchThreshold}% threshold`
                        }
                      >
                        {typeof job.matchScore === 'number'
                          ? `${Math.round(job.matchScore)}%`
                          : '—'}
                      </span>
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
                              trackMutation.mutate({
                                jobId,
                                status: 'APPLIED',
                              });
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
                          title={
                            isBookmarked ? 'Remove bookmark' : 'Bookmark job'
                          }
                          aria-label={
                            isBookmarked ? 'Remove bookmark' : 'Bookmark job'
                          }
                          onClick={() => {
                            if (!jobId) {
                              return;
                            }
                            if (tracked) {
                              trackMutation.mutate({
                                jobId,
                                status: 'SAVED',
                                applicationId: tracked.id,
                                remove: true,
                              });
                              return;
                            }
                            trackMutation.mutate({
                              jobId,
                              status: 'SAVED',
                            });
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
                    <td colSpan={9} className="empty">
                      {hasResume
                        ? 'No scored jobs yet. Fetch jobs for a company, then wait for resume matching to finish.'
                        : 'No India jobs in the catalog yet. Fetch companies from the Companies page.'}
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
      )}
    </section>
  );
}
