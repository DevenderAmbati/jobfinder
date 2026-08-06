import { useQuery } from '@tanstack/react-query';
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
  companyId: '',
  role: '',
  skills: '',
  postedWithin: '',
  provider: '',
};

export function JobsPage() {
  const [filters, setFilters] = useState(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [onlyAboveThreshold, setOnlyAboveThreshold] = useState(false);
  const [sortBy, setSortBy] = useState<JobSort>('latest');

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
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.role.trim()) params.set('role', filters.role.trim());
    if (filters.skills.trim()) params.set('skills', filters.skills.trim());
    if (filters.postedWithin) params.set('postedWithin', filters.postedWithin);
    // Fetch scored jobs globally, then keep India offices client-side —
    // many Indian postings say "Bengaluru" without the word "India".
    params.set('scored', 'true');
    if (onlyAboveThreshold) {
      params.set('scoreMin', String(matchThreshold));
    }
    params.set('limit', '2000');
    return params.toString();
  }, [filters, matchThreshold, onlyAboveThreshold]);

  const jobsQuery = useQuery({
    queryKey: ['jobs', queryString],
    queryFn: async () => {
      const res = await api<{ data: JobListItem[] }>(`/jobs?${queryString}`);
      return res.data;
    },
    enabled: !rulesQuery.isLoading,
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
    if (filters.role.trim()) {
      merged.add(filters.role.trim());
    }
    return [
      { value: '', label: 'All roles' },
      ...[...merged].map((role) => ({ value: role, label: role })),
    ];
  }, [facetsQuery.data?.roles, filters.role]);

  const skillOptions = useMemo(() => {
    const fromFacets = facetsQuery.data?.skills ?? [];
    const merged = new Set(fromFacets);
    if (filters.skills.trim()) {
      merged.add(filters.skills.trim());
    }
    return [
      { value: '', label: 'Any skill' },
      ...[...merged].map((skill) => ({ value: skill, label: skill })),
    ];
  }, [facetsQuery.data?.skills, filters.skills]);

  const activeFilterCount = [
    filters.search,
    filters.provider,
    filters.companyId,
    filters.role,
    filters.skills,
    filters.postedWithin,
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
        eyebrow="Matched to your resume"
        title="Jobs for you"
        description="India-based resume matches. Sort by latest posting or match score."
      />

      <div className="match-summary">
        <div>
          <span className="match-summary__value">{aboveThresholdCount}</span>
          <span className="match-summary__label">
            Above your {matchThreshold}% threshold
          </span>
        </div>
        <div>
          <span className="match-summary__value">{jobs.length || '—'}</span>
          <span className="match-summary__label">India matches</span>
        </div>
        <div>
          <span className="match-summary__value">
            {resumeQuery.data ? 'Ready' : 'Missing'}
          </span>
          <span className="match-summary__label">Resume profile</span>
        </div>
      </div>

      {!resumeQuery.isLoading && !resumeQuery.data ? (
        <div className="match-notice">
          Add your resume in Settings before relying on match scores.
          <a className="link" href="/settings">
            Open Settings
          </a>
        </div>
      ) : null}

      <div className="jobs-toolbar">
        <label className="field jobs-toolbar__search">
          <span className="field__label">Search your matches</span>
          <input
            className="input"
            value={filters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
            placeholder="Role, company, skill…"
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
          <Button
            variant={onlyAboveThreshold ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setOnlyAboveThreshold((only) => !only)}
          >
            {matchThreshold}%+ only
          </Button>
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
              <Select
                aria-label="Role"
                value={filters.role}
                onChange={(role) => patchFilters({ role })}
                options={roleOptions}
              />
            </label>
            <label className="field">
              <span className="field__label">Skill</span>
              <Select
                aria-label="Skill"
                value={filters.skills}
                onChange={(skills) => patchFilters({ skills })}
                options={skillOptions}
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
              <Select
                aria-label="Company"
                value={filters.companyId}
                onChange={(companyId) => patchFilters({ companyId })}
                options={[
                  { value: '', label: 'All companies' },
                  ...(companiesQuery.data ?? []).map((company) => ({
                    value: company.id,
                    label: company.name,
                  })),
                ]}
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

      {jobsQuery.isLoading || rulesQuery.isLoading ? (
        <LoadingState label="Loading jobs…" />
      ) : jobsQuery.isError ? (
        <p className="error-text">{(jobsQuery.error as Error).message}</p>
      ) : (
        <div className="table-panel">
          <TableScroll>
            <table className="data-table data-table--jobs">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Experience</th>
                  <th>CTC</th>
                  <th>Posted</th>
                  <th>Match</th>
                  <th>Apply</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((job) => {
                  const matchedSkills = extractMatchedSkills(job.matchReasons);
                  const missingSkills = (job.missingSkills ?? []).slice(0, 6);
                  return (
                  <tr key={job.id ?? `${job.title}-${job.applyUrl}`}>
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
                      <a
                        href={job.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn--sm job-apply"
                      >
                        Apply ↗
                      </a>
                    </td>
                  </tr>
                  );
                })}
                {pagination.total === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      No scored jobs yet. Fetch jobs for a company, then check
                      that your resume and rules are set up in Settings.
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
