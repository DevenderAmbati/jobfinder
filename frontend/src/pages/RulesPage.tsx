import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { LoadingState } from '../components/LoadingState';
import { api, type RuleConfig } from '../lib/api';

function joinList(values: string[]): string {
  return values.join(', ');
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

const emptyForm = {
  name: 'default',
  countries: '',
  cities: '',
  experience: '',
  skills: '',
  roles: '',
  excludedRoles: '',
  companies: '',
  minMatchScore: '50',
  enabled: true,
};

export function RulesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const res = await api<{ data: RuleConfig | null }>('/rules');
      return res.data;
    },
  });

  useEffect(() => {
    const rule = rulesQuery.data;
    if (!rule) {
      return;
    }
    setForm({
      name: rule.name,
      countries: joinList(rule.countries),
      cities: joinList(rule.cities),
      experience: rule.experience ?? '',
      skills: joinList(rule.skills),
      roles: joinList(rule.roles),
      excludedRoles: joinList(rule.excludedRoles),
      companies: joinList(rule.companies),
      minMatchScore: String(rule.minMatchScore),
      enabled: rule.enabled,
    });
  }, [rulesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      api<{ data: RuleConfig }>('/rules', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          countries: splitList(form.countries),
          cities: splitList(form.cities),
          experience: form.experience.trim() || null,
          skills: splitList(form.skills),
          roles: splitList(form.roles),
          excludedRoles: splitList(form.excludedRoles),
          companies: splitList(form.companies),
          minMatchScore: Number(form.minMatchScore),
          enabled: form.enabled,
        }),
      }),
    onSuccess: () => {
      setMessage('Rules saved.');
      void queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  return (
    <section className="page">
      <PageHeader
        title="Rules"
        description="Configure filters and the minimum match score used before notification."
      />

      {rulesQuery.isLoading ? (
        <LoadingState label="Loading rules…" />
      ) : rulesQuery.isError ? (
        <p className="error-text">{(rulesQuery.error as Error).message}</p>
      ) : (
        <form
          className="section-block form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="field__label">Min match score</span>
            <input
              className="input"
              value={form.minMatchScore}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, minMatchScore: e.target.value }))
              }
              inputMode="numeric"
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Countries (comma-separated)</span>
            <input
              className="input"
              value={form.countries}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, countries: e.target.value }))
              }
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Cities (comma-separated)</span>
            <input
              className="input"
              value={form.cities}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, cities: e.target.value }))
              }
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Roles</span>
            <input
              className="input"
              value={form.roles}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, roles: e.target.value }))
              }
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Excluded roles</span>
            <input
              className="input"
              value={form.excludedRoles}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, excludedRoles: e.target.value }))
              }
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Skills</span>
            <input
              className="input"
              value={form.skills}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, skills: e.target.value }))
              }
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Company allow-list (optional)</span>
            <input
              className="input"
              value={form.companies}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, companies: e.target.value }))
              }
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Experience hint</span>
            <input
              className="input"
              value={form.experience}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, experience: e.target.value }))
              }
            />
          </label>
          <label className="checkbox-row span-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, enabled: e.target.checked }))
              }
            />
            Enabled
          </label>
          <div className="span-2">
            <Button
              type="submit"
              loading={saveMutation.isPending}
              loadingText="Saving…"
            >
              Save rules
            </Button>
          </div>
        </form>
      )}

      {message ? <p className="status">{message}</p> : null}
    </section>
  );
}
