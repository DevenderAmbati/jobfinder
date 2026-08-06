export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="loading-state" role="status" aria-live="polite">
      <span className="btn__spinner" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}
