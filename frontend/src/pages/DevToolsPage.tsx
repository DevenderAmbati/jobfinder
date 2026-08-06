import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { api, type Company, type JobListItem } from '../lib/api';

const PROVIDER_OPTIONS = [
  'stub',
  'greenhouse',
  'lever',
  'workday',
  'microsoft',
].map((name) => ({ value: name, label: name }));

export function DevToolsPage() {
  const [companyId, setCompanyId] = useState('');
  const [providerName, setProviderName] = useState('stub');
  const [jobId, setJobId] = useState('');
  const [output, setOutput] = useState<string>('Ready.');

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api<{ data: Company[] }>('/companies');
      return res.data;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ['jobs-dev'],
    queryFn: async () => {
      const res = await api<{ data: JobListItem[] }>('/jobs?limit=50');
      return res.data;
    },
  });

  const selectedCompany = useMemo(
    () => companiesQuery.data?.find((c) => c.id === companyId),
    [companiesQuery.data, companyId],
  );

  const [activeAction, setActiveAction] = useState<string | null>(null);

  const runAction = useMutation({
    mutationFn: async (input: { label: string; action: () => Promise<unknown> }) => {
      setActiveAction(input.label);
      return input.action();
    },
    onSuccess: (data) => {
      setOutput(JSON.stringify(data, null, 2));
    },
    onError: (error: Error) => {
      setOutput(`Error: ${error.message}`);
    },
    onSettled: () => {
      setActiveAction(null);
    },
  });

  function run(label: string, action: () => Promise<unknown>) {
    runAction.mutate({ label, action });
  }

  return (
    <section className="page">
      <PageHeader
        eyebrow="Development"
        title="Developer Tools"
        description="Run providers, inspect pipeline stages, and clear local data. Gated by server config."
      />

      <div className="filter-grid cols-2">
        <label className="field">
          <span className="field__label">Company</span>
          <Select
            aria-label="Company"
            value={companyId}
            placeholder="Select company…"
            onChange={(next) => {
              setCompanyId(next);
              const company = companiesQuery.data?.find((c) => c.id === next);
              if (company) {
                setProviderName(company.provider);
              }
            }}
            options={[
              { value: '', label: 'Select company…' },
              ...(companiesQuery.data ?? []).map((company) => ({
                value: company.id,
                label: `${company.name} (${company.provider})`,
              })),
            ]}
          />
        </label>

        <label className="field">
          <span className="field__label">Provider</span>
          <Select
            aria-label="Provider"
            value={providerName}
            onChange={setProviderName}
            options={PROVIDER_OPTIONS}
          />
        </label>

        <label className="field span-2">
          <span className="field__label">Job (for inspect)</span>
          <Select
            aria-label="Job"
            value={jobId}
            placeholder="Select job…"
            onChange={setJobId}
            options={[
              { value: '', label: 'Select job…' },
              ...(jobsQuery.data ?? []).map((job) => ({
                value: job.id!,
                label: `${job.title} — ${job.company} [${job.provider}]`,
              })),
            ]}
          />
        </label>
      </div>

      {selectedCompany ? (
        <p className="muted">
          Selected: {selectedCompany.name} · provider=
          {selectedCompany.provider} · enabled=
          {String(selectedCompany.enabled)}
        </p>
      ) : null}

      <div className="btn-row">
        <ActionButton
          label="Run Provider"
          busy={activeAction === 'Run Provider'}
          disabled={runAction.isPending}
          onClick={() =>
            run('Run Provider', () =>
              api(`/dev/providers/${providerName}/run`, {
                method: 'POST',
                body: JSON.stringify({ companyId }),
              }),
            )
          }
        />
        <ActionButton
          label="Run Scheduler"
          busy={activeAction === 'Run Scheduler'}
          disabled={runAction.isPending}
          onClick={() =>
            run('Run Scheduler', () =>
              api('/dev/scheduler/run', { method: 'POST', body: '{}' }),
            )
          }
        />
        <ActionButton
          label="Test Telegram"
          busy={activeAction === 'Test Telegram'}
          disabled={runAction.isPending}
          onClick={() =>
            run('Test Telegram', () =>
              api('/dev/telegram/test', { method: 'POST', body: '{}' }),
            )
          }
        />
        <ActionButton
          label="Test Gemini"
          busy={activeAction === 'Test Gemini'}
          disabled={runAction.isPending}
          onClick={() =>
            run('Test Gemini', () =>
              api('/dev/gemini/test', { method: 'POST', body: '{}' }),
            )
          }
        />
        <ActionButton
          label="Raw Provider"
          busy={activeAction === 'Raw Provider'}
          disabled={runAction.isPending}
          ghost
          onClick={() =>
            run('Raw Provider', () =>
              api(
                `/dev/providers/${providerName}/raw?companyId=${encodeURIComponent(companyId)}`,
              ),
            )
          }
        />
        <ActionButton
          label="Normalized Job"
          busy={activeAction === 'Normalized Job'}
          disabled={runAction.isPending}
          ghost
          onClick={() =>
            run('Normalized Job', () => api(`/dev/jobs/${jobId}/normalized`))
          }
        />
        <ActionButton
          label="Rule Evaluation"
          busy={activeAction === 'Rule Evaluation'}
          disabled={runAction.isPending}
          ghost
          onClick={() =>
            run('Rule Evaluation', () => api(`/dev/jobs/${jobId}/rules`))
          }
        />
        <ActionButton
          label="AI Output"
          busy={activeAction === 'AI Output'}
          disabled={runAction.isPending}
          ghost
          onClick={() =>
            run('AI Output', () => api(`/dev/jobs/${jobId}/ai`))
          }
        />
        <ActionButton
          label="Export Logs"
          busy={false}
          disabled={runAction.isPending}
          ghost
          onClick={() => {
            window.open('/api/dev/logs/export', '_blank');
          }}
        />
        <ActionButton
          label="Clear Logs"
          busy={activeAction === 'Clear Logs'}
          disabled={runAction.isPending}
          danger
          onClick={() =>
            run('Clear Logs', () =>
              api('/dev/logs/clear', { method: 'POST', body: '{}' }),
            )
          }
        />
        <ActionButton
          label="Clear Database"
          busy={activeAction === 'Clear Database'}
          disabled={runAction.isPending}
          danger
          onClick={() => {
            if (
              !window.confirm(
                'Delete jobs, applications, and logs? Companies/rules/resume are kept.',
              )
            ) {
              return;
            }
            run('Clear Database', () =>
              api('/dev/db/clear', { method: 'POST', body: '{}' }),
            );
          }}
        />
      </div>

      <pre className="banner" style={{ maxHeight: 480 }}>
        {output}
      </pre>
    </section>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  disabled,
  danger,
  ghost,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
  ghost?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={danger ? 'danger' : ghost ? 'ghost' : 'primary'}
      loading={busy}
      loadingText="Working…"
      disabled={disabled && !busy}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
