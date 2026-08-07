import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { Select } from '../components/Select';
import { TableScroll } from '../components/TableScroll';
import { usePagination } from '../hooks/usePagination';
import { api, type Company } from '../lib/api';

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

const PROVIDER_OPTIONS = PROVIDERS.map((name) => ({
  value: name,
  label: name,
}));

const emptyForm = {
  name: '',
  provider: 'stub',
  careerUrl: '',
};

const FIXED_FREQUENCY_LABEL = 'Every 6 hours';

export function CompaniesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api<{ data: Company[] }>('/companies');
      return res.data;
    },
  });

  const filteredCompanies = useMemo(() => {
    const companies = companiesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) => {
      const haystack = [
        company.name,
        company.provider,
        company.careerUrl,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [companiesQuery.data, search]);

  const pagination = usePagination(filteredCompanies, 10);

  function patchSearch(value: string) {
    setSearch(value);
    pagination.resetPage();
  }

  const createMutation = useMutation({
    mutationFn: async () =>
      api<{ data: Company }>('/companies', {
        method: 'POST',
        body: JSON.stringify({ ...form, enabled: true }),
      }),
    onSuccess: () => {
      setForm(emptyForm);
      setMessage('Company created.');
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  // Each row tracks its own in-flight state so one long provider run (a large
  // Workday/SmartRecruiters board can take minutes) never blocks other rows.
  const [fetchingIds, setFetchingIds] = useState<string[]>([]);

  const fetchMutation = useMutation({
    mutationFn: async (company: Company) => {
      const result = await api<{ data: unknown }>(
        `/companies/${company.id}/fetch`,
        { method: 'POST', body: '{}' },
      );
      return { company, data: result.data };
    },
    onMutate: (company: Company) => {
      setFetchingIds((prev) =>
        prev.includes(company.id) ? prev : [...prev, company.id],
      );
    },
    onSuccess: ({ company, data }) => {
      setMessage(
        `${company.name} — fetch complete:\n${JSON.stringify(data, null, 2)}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error: Error, company) =>
      setMessage(`${company.name} — ${error.message}`),
    onSettled: (_result, _error, company) => {
      setFetchingIds((prev) => prev.filter((id) => id !== company.id));
    },
  });

  return (
    <section className="page">
      <PageHeader
        title="Companies"
        description="Manage monitored companies and providers. Fetch schedule is fixed at every 6 hours."
      />

      <form
        className="section-block form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
      >
        <h2 className="section-title span-2">Add company</h2>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            required
            className="input"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">Provider</span>
          <Select
            aria-label="Provider"
            value={form.provider}
            onChange={(provider) =>
              setForm((prev) => ({ ...prev, provider }))
            }
            options={PROVIDER_OPTIONS}
          />
        </label>
        <label className="field span-2">
          <span className="field__label">Career URL</span>
          <input
            required
            className="input"
            value={form.careerUrl}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, careerUrl: e.target.value }))
            }
            placeholder="https://boards.greenhouse.io/… or jobs.lever.co/…"
          />
        </label>
        <label className="field">
          <span className="field__label">Fetch schedule</span>
          <input
            className="input"
            value={FIXED_FREQUENCY_LABEL}
            disabled
            readOnly
            aria-readonly="true"
          />
        </label>
        <div className="span-2">
          <Button
            type="submit"
            loading={createMutation.isPending}
            loadingText="Saving…"
          >
            Add company
          </Button>
        </div>
      </form>

      {message ? <pre className="banner">{message}</pre> : null}

      {companiesQuery.isLoading ? (
        <LoadingState label="Loading companies…" />
      ) : companiesQuery.isError ? (
        <p className="error-text">
          {(companiesQuery.error as Error).message}
        </p>
      ) : (
        <>
          <div className="jobs-toolbar">
            <label className="field jobs-toolbar__search">
              <span className="field__label">Search companies</span>
              <input
                className="input"
                value={search}
                onChange={(e) => patchSearch(e.target.value)}
                placeholder="Name, provider, career URL…"
              />
            </label>
          </div>
          <div className="table-panel">
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Frequency</th>
                  <th>Last run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((company) => {
                  const fetching = fetchingIds.includes(company.id);
                  return (
                  <tr key={company.id}>
                    <td>
                      <div className="cell-strong">{company.name}</div>
                      <a
                        href={company.careerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="link link--quiet"
                      >
                        {company.careerUrl}
                      </a>
                    </td>
                    <td>{company.provider}</td>
                    <td>
                      <span className="cell-meta" style={{ marginTop: 0 }}>
                        {FIXED_FREQUENCY_LABEL}
                      </span>
                    </td>
                    <td className="cell-meta" style={{ marginTop: 0 }}>
                      {company.lastRun
                        ? new Date(company.lastRun).toLocaleString()
                        : 'Never'}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        loading={fetching}
                        loadingText="Fetching…"
                        onClick={() => fetchMutation.mutate(company)}
                      >
                        Fetch now
                      </Button>
                    </td>
                  </tr>
                  );
                })}
                {pagination.total === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      {search.trim()
                        ? 'No companies match your search.'
                        : 'No companies yet. Add one above.'}
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
            label="companies"
          />
        </div>
        </>
      )}
    </section>
  );
}
