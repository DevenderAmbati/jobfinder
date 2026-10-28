import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { formatFetchWindow, JobResultsTable } from '../components/JobResultsTable';
import { LoadingState } from '../components/LoadingState';
import { Select } from '../components/Select';
import { MultiSelect } from '../components/MultiSelect';
import { usePagination } from '../hooks/usePagination';
import {
  api,
  type ApplicationItem,
  type ApplicationStatus,
  type Company,
  type JobFacets,
  type JobListItem,
  type LatestFetch,
  type ResumeData,
  type RuleConfig,
} from '../lib/api';
import { isVisibleInJobList } from '../lib/jobFormat';

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
  { value: 'match-desc', label: 'Highest match' },
  { value: 'latest', label: 'Latest first' },
] as const;

type JobSort = (typeof SORT_OPTIONS)[number]['value'];

const LOCATION_OPTIONS = [
  { value: 'bengaluru', label: 'Bengaluru', aliases: ['bengaluru', 'bangalore'] },
  { value: 'hyderabad', label: 'Hyderabad', aliases: ['hyderabad'] },
  { value: 'pune', label: 'Pune', aliases: ['pune'] },
  { value: 'mumbai', label: 'Mumbai', aliases: ['mumbai'] },
  { value: 'chennai', label: 'Chennai', aliases: ['chennai'] },
  { value: 'delhi', label: 'Delhi', aliases: ['delhi'] },
  { value: 'noida', label: 'Noida', aliases: ['noida'] },
  { value: 'gurugram', label: 'Gurugram', aliases: ['gurugram', 'gurgaon'] },
  { value: 'kolkata', label: 'Kolkata', aliases: ['kolkata'] },
  { value: 'remote', label: 'Remote', aliases: ['remote'] },
] as const;

const emptyFilters = {
  search: '',
  companyIds: [] as string[],
  roles: [] as string[],
  locations: [] as string[],
  postedWithin: '',
  provider: '',
};

function isJobApplied(
  jobId: string | undefined,
  applicationByJobId: Map<string, ApplicationItem>,
): boolean {
  if (!jobId) {
    return false;
  }
  const tracked = applicationByJobId.get(jobId);
  return (
    tracked != null && tracked.status !== 'SAVED' && tracked.status !== 'REJECTED'
  );
}

export function JobsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [onlyAboveThreshold, setOnlyAboveThreshold] = useState(false);
  const [hideApplied, setHideApplied] = useState(false);
  const [latestAbove50, setLatestAbove50] = useState(false);
  const [sortBy, setSortBy] = useState<JobSort>('match-desc');
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
    for (const location of filters.locations) {
      const option = LOCATION_OPTIONS.find((item) => item.value === location);
      for (const alias of option?.aliases ?? [location]) {
        params.append('location', alias);
      }
    }
    if (filters.postedWithin) params.set('postedWithin', filters.postedWithin);
    // Always show the shared catalog. Scores fill in as JobMatch rows are written.
    // "Above threshold" still needs scored rows only.
    if (hasResume && onlyAboveThreshold) {
      params.set('scored', 'true');
      params.set('scoreMin', String(matchThreshold));
    }
    // Sort by match score at the DB layer so the row cap keeps the top matches
    // instead of only the most recent postings (only meaningful with a resume).
    if (hasResume && sortBy === 'match-desc') {
      params.set('sort', sortBy);
    }
    // Cap payload size — full JD text + 10k+ rows OOMs/times out on Railway (HTTP 502).
    params.set('limit', '2500');
    return params.toString();
  }, [filters, matchThreshold, onlyAboveThreshold, hasResume, sortBy]);

  const jobsQuery = useQuery({
    queryKey: ['jobs', queryString],
    queryFn: async () => {
      const res = await api<{ data: JobListItem[] }>(`/jobs?${queryString}`);
      return res.data;
    },
    enabled: !rulesQuery.isLoading && resumeReady,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      if (!hasResume) {
        return false;
      }
      const rows = query.state.data;
      if (!rows?.length) {
        return 8_000;
      }
      const pending = rows.some((job) => typeof job.matchScore !== 'number');
      return pending ? 8_000 : false;
    },
  });

  const latestFetchQuery = useQuery({
    queryKey: ['jobs-latest-fetch'],
    queryFn: async () => {
      const res = await api<{ data: LatestFetch }>('/jobs/latest-fetch');
      return res.data;
    },
    refetchOnMount: 'always',
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
      void queryClient.invalidateQueries({ queryKey: ['analytics-applications'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onSettled: () => {
      setActionJobId(null);
    },
  });

  const latestAllJobs = useMemo(
    () =>
      (latestFetchQuery.data?.jobs ?? []).filter((job) =>
        isVisibleInJobList(job.location),
      ),
    [latestFetchQuery.data?.jobs],
  );
  const latestJobs = useMemo(() => {
    if (!latestAbove50) {
      return latestAllJobs;
    }
    return latestAllJobs.filter(
      (job) => typeof job.matchScore === 'number' && job.matchScore > 50,
    );
  }, [latestAllJobs, latestAbove50]);
  const latestPagination = usePagination(latestJobs, 10);
  const { setPage: setLatestPage } = latestPagination;

  useEffect(() => {
    setLatestPage(1);
  }, [latestAbove50, setLatestPage]);

  const jobs = useMemo(() => {
    let india = (jobsQuery.data ?? []).filter((job) =>
      isVisibleInJobList(job.location),
    );
    if (hideApplied) {
      india = india.filter((job) => !isJobApplied(job.id, applicationByJobId));
    }
    if (sortBy === 'latest') {
      return india;
    }
    const scored = [...india];
    scored.sort((a, b) => {
      const scoreA = a.matchScore ?? -1;
      const scoreB = b.matchScore ?? -1;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      const dateA = new Date(a.postedDate ?? a.createdAt ?? 0).getTime();
      const dateB = new Date(b.postedDate ?? b.createdAt ?? 0).getTime();
      return dateB - dateA;
    });
    return scored;
  }, [jobsQuery.data, sortBy, hideApplied, applicationByJobId]);
  const pagination = usePagination(jobs, 10);
  const { setPage } = pagination;

  useEffect(() => {
    setPage(1);
  }, [queryString, sortBy, hideApplied, setPage]);

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
    ...filters.locations,
  ].filter((value) => value.trim()).length;

  const aboveThresholdCount = jobs.filter(
    (job) =>
      typeof job.matchScore === 'number' && job.matchScore >= matchThreshold,
  ).length;

  function patchFilters(patch: Partial<typeof emptyFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const fetchWindowLabel = formatFetchWindow(
    latestFetchQuery.data?.startedAt ?? null,
    latestFetchQuery.data?.fetchedAt ?? null,
  );
  const latestJobLabel = `${latestJobs.length} ${
    latestJobs.length === 1 ? 'job' : 'jobs'
  }`;
  const latestFetchMeta = !latestFetchQuery.data?.fetchedAt
    ? 'No company fetch has finished yet.'
    : latestAllJobs.length === 0
      ? `Fetched ${fetchWindowLabel}. No new jobs in this fetch.`
      : latestAbove50
        ? `Fetched ${fetchWindowLabel} · ${latestJobLabel} above 50%`
        : `Fetched ${fetchWindowLabel} · ${latestJobLabel}`;

  return (
    <section className="page">
      <PageHeader
        eyebrow={hasResume ? 'Matched to your resume' : 'Shared job catalog'}
        title="Jobs for you"
      />

      <div className="latest-fetch">
        <div className="latest-fetch__head">
          <div className="latest-fetch__title-row">
            <h2 className="section-title">Latest fetch</h2>
            <Button
              variant={latestAbove50 ? 'primary' : 'ghost'}
              size="sm"
              aria-pressed={latestAbove50}
              onClick={() => setLatestAbove50((on) => !on)}
            >
              &gt;50%
            </Button>
          </div>
          <p className="latest-fetch__meta">
              {latestFetchQuery.isLoading
                ? 'Loading the latest fetch…'
                : latestFetchQuery.isError
                  ? (latestFetchQuery.error as Error).message
                  : latestFetchMeta}
          </p>
        </div>
        {latestFetchQuery.isLoading ? (
          <LoadingState label="Loading latest fetch…" />
        ) : latestFetchQuery.isError || latestAllJobs.length === 0 ? null : (
          <JobResultsTable
            pagination={latestPagination}
            matchThreshold={matchThreshold}
            hasResume={hasResume}
            applicationByJobId={applicationByJobId}
            actionJobId={actionJobId}
            onTrack={(input) => trackMutation.mutate(input)}
            showFetchedAt
            emptyMessage="No jobs from this fetch scored above 50%."
          />
        )}
      </div>

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
            {hasResume ? 'India jobs' : 'India listings'}
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

      <h2 className="section-title">All jobs</h2>

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
            variant={hideApplied ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={hideApplied}
            onClick={() => setHideApplied((on) => !on)}
          >
            Not applied
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
          <div className="filter-grid cols-5">
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
              <span className="field__label">Location</span>
              <MultiSelect
                aria-label="Location"
                value={filters.locations}
                onChange={(locations) => patchFilters({ locations })}
                options={LOCATION_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                placeholder="All locations"
                searchPlaceholder="Search locations…"
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
        <JobResultsTable
          pagination={pagination}
          matchThreshold={matchThreshold}
          hasResume={hasResume}
          applicationByJobId={applicationByJobId}
          actionJobId={actionJobId}
          onTrack={(input) => trackMutation.mutate(input)}
          emptyMessage={
            hasResume
              ? 'No India jobs in the catalog yet. Fetch companies from the Companies page, then wait for matching to fill scores.'
              : 'No India jobs in the catalog yet. Fetch companies from the Companies page.'
          }
        />
      )}
    </section>
  );
}
