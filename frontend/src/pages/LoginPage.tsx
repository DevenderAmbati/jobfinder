import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ApiError } from '../lib/api';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Sign-in failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <p className="auth-brand">Jobfinder</p>
        <h1 className="auth-title">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="auth-lead">
          Companies and job listings are shared. Match scores follow your
          resume.
        </p>

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'register' ? (
            <label className="field">
              <span className="field__label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Optional"
              />
            </label>
          ) : null}

          <label className="field">
            <span className="field__label">Email</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
            />
          </label>

          {error ? <p className="status status--error">{error}</p> : null}

          <Button type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </Button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button
                type="button"
                className="auth-switch__btn"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-switch__btn"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
