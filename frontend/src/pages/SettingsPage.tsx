import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { LoadingState } from '../components/LoadingState';
import { Select } from '../components/Select';
import {
  api,
  type PromptTemplateItem,
  type ResumeData,
  type SettingsStatus,
} from '../lib/api';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [extractedText, setExtractedText] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [promptContent, setPromptContent] = useState('');
  const [promptEnabled, setPromptEnabled] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const resumeQuery = useQuery({
    queryKey: ['resume'],
    queryFn: async () => {
      const res = await api<{ data: ResumeData | null }>('/resume');
      return res.data;
    },
  });

  const promptsQuery = useQuery({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await api<{ data: PromptTemplateItem[] }>('/prompts');
      return res.data;
    },
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api<{ data: SettingsStatus }>('/settings');
      return res.data;
    },
  });

  useEffect(() => {
    if (!resumeQuery.data) {
      return;
    }
    setExtractedText(resumeQuery.data.extractedText);
    setMarkdown(resumeQuery.data.markdown);
  }, [resumeQuery.data]);

  useEffect(() => {
    const prompts = promptsQuery.data;
    if (!prompts?.length) {
      return;
    }
    const current =
      prompts.find((p) => p.id === selectedPromptId) ?? prompts[0];
    setSelectedPromptId(current.id);
    setPromptContent(current.content);
    setPromptEnabled(current.enabled);
  }, [promptsQuery.data, selectedPromptId]);

  const saveResume = useMutation({
    mutationFn: async () => {
      if (pdfFile) {
        const form = new FormData();
        form.append('extractedText', extractedText);
        form.append('markdown', markdown);
        form.append('pdf', pdfFile);
        return api<{ data: ResumeData }>('/resume', {
          method: 'PUT',
          body: form,
        });
      }
      return api<{ data: ResumeData }>('/resume', {
        method: 'PUT',
        body: JSON.stringify({ extractedText, markdown }),
      });
    },
    onSuccess: () => {
      setMessage('Resume saved.');
      setPdfFile(null);
      void queryClient.invalidateQueries({ queryKey: ['resume'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const savePrompt = useMutation({
    mutationFn: async () =>
      api<{ data: PromptTemplateItem }>(`/prompts/${selectedPromptId}`, {
        method: 'PUT',
        body: JSON.stringify({
          content: promptContent,
          enabled: promptEnabled,
        }),
      }),
    onSuccess: () => {
      setMessage('Prompt template saved.');
      void queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  return (
    <section className="page">
      <PageHeader
        title="Settings"
        description="Resume text, prompt templates, and runtime matching flags."
      />

      {message ? <p className="status">{message}</p> : null}

      <div className="section-block">
        <h2 className="section-title">Runtime status</h2>
        {settingsQuery.isLoading ? (
          <LoadingState label="Loading…" />
        ) : settingsQuery.isError ? (
          <p className="error-text">
            {(settingsQuery.error as Error).message}
          </p>
        ) : settingsQuery.data ? (
          <dl className="filter-grid cols-2" style={{ fontSize: '0.875rem' }}>
            <div>
              <dt className="field__label">Gemini</dt>
              <dd className="cell-strong">
                {settingsQuery.data.geminiEnabled ? 'Enabled' : 'Disabled'}
                {settingsQuery.data.geminiApiKeyConfigured
                  ? ' · key configured'
                  : ' · no key'}
              </dd>
            </div>
            <div>
              <dt className="field__label">Telegram</dt>
              <dd className="cell-strong">
                {settingsQuery.data.telegramConfigured
                  ? 'Configured'
                  : 'Not configured'}
              </dd>
            </div>
            <div>
              <dt className="field__label">Env match threshold</dt>
              <dd className="cell-strong">
                {settingsQuery.data.matchScoreThresholdEnv}
              </dd>
            </div>
            <div>
              <dt className="field__label">Rule minMatchScore</dt>
              <dd className="cell-strong">
                {settingsQuery.data.ruleMinMatchScore ?? '—'}
              </dd>
            </div>
            <div className="span-2">
              <dt className="field__label">Note</dt>
              <dd className="muted">{settingsQuery.data.note}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="section-block">
        <h2 className="section-title">Resume</h2>
        <p className="muted">
          Matching compares whichever of the two boxes below holds the fuller
          resume against each job description, so a short note left in one of
          them cannot override the real thing. Optional PDF is stored on the
          server; OCR/PDF parsing is not automatic in V1.
        </p>
        {resumeQuery.data?.hasPdf ? (
          <p className="ok-text" style={{ fontSize: '0.875rem' }}>
            PDF on file.
          </p>
        ) : (
          <p className="muted">No PDF uploaded yet.</p>
        )}
        <label className="field">
          <span className="field__label">PDF upload</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="input"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="field">
          <span className="field__label">Extracted text</span>
          <textarea
            className="textarea"
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Markdown</span>
          <textarea
            className="textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        </label>
        <Button
          loading={saveResume.isPending}
          loadingText="Saving…"
          onClick={() => saveResume.mutate()}
        >
          Save resume
        </Button>
      </div>

      <div className="section-block">
        <h2 className="section-title">Prompt templates</h2>
        {promptsQuery.isLoading ? (
          <LoadingState label="Loading prompts…" />
        ) : (
          <>
            <label className="field">
              <span className="field__label">Template</span>
              <Select
                aria-label="Prompt template"
                value={selectedPromptId}
                onChange={setSelectedPromptId}
                options={(promptsQuery.data ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.name} v${p.version}${p.enabled ? '' : ' (disabled)'}`,
                }))}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={promptEnabled}
                onChange={(e) => setPromptEnabled(e.target.checked)}
              />
              Enabled
            </label>
            <textarea
              className="textarea"
              style={{ minHeight: '12rem' }}
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              disabled={!selectedPromptId}
            />
            <Button
              loading={savePrompt.isPending}
              loadingText="Saving…"
              disabled={!selectedPromptId}
              onClick={() => savePrompt.mutate()}
            >
              Save prompt
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
