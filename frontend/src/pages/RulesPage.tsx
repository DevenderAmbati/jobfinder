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
  roles: '',
  skills: '',
  experience: '',
  minMatchScore: '50',
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
      setForm(emptyForm);
      return;
    }
    setForm({
      roles: joinList(rule.roles),
      skills: joinList(rule.skills),
      experience: rule.experience ?? '',
      minMatchScore: String(rule.minMatchScore),
    });
  }, [rulesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      api<{ data: RuleConfig }>('/rules', {
        method: 'PUT',
        body: JSON.stringify({
          roles: splitList(form.roles),
          skills: splitList(form.skills),
          experience: form.experience.trim() || null,
          minMatchScore: Number(form.minMatchScore),
        }),
      }),
    onSuccess: () => {
      setMessage(
        'Preferences saved. Match scores are refreshing in the background.',
      );
      void queryClient.invalidateQueries({ queryKey: ['rules'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  return (
    <section className="page">
      <PageHeader
        title="Rules"
        description="Your preferences for scoring and notifications. Leave roles/skills/experience empty to score from resume only (100%). When filled, scores use 60% resume + 40% these preferences."
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
          <label className="field span-2">
            <span className="field__label">Preferred roles</span>
            <input
              className="input"
              value={form.roles}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, roles: e.target.value }))
              }
              placeholder="Software Engineer, Backend Engineer, Full Stack"
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Preferred skills</span>
            <input
              className="input"
              value={form.skills}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, skills: e.target.value }))
              }
              placeholder="TypeScript, React, Node.js"
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Experience</span>
            <input
              className="input"
              value={form.experience}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, experience: e.target.value }))
              }
              placeholder="e.g. 2-4 years"
            />
          </label>
          <label className="field">
            <span className="field__label">Min score for notification</span>
            <input
              className="input"
              value={form.minMatchScore}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, minMatchScore: e.target.value }))
              }
              inputMode="numeric"
            />
          </label>
          <div className="span-2">
            <Button
              type="submit"
              loading={saveMutation.isPending}
              loadingText="Saving…"
            >
              Save preferences
            </Button>
          </div>
        </form>
      )}

      {message ? <p className="status">{message}</p> : null}
    </section>
  );
}
