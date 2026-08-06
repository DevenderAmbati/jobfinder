import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState } from './components/LoadingState';

const PlaceholderPage = lazy(() =>
  import('./pages/PlaceholderPage').then((m) => ({
    default: m.PlaceholderPage,
  })),
);
const DevToolsPage = lazy(() =>
  import('./pages/DevToolsPage').then((m) => ({ default: m.DevToolsPage })),
);
const JobsPage = lazy(() =>
  import('./pages/JobsPage').then((m) => ({ default: m.JobsPage })),
);
const CompaniesPage = lazy(() =>
  import('./pages/CompaniesPage').then((m) => ({ default: m.CompaniesPage })),
);
const ProviderHealthPage = lazy(() =>
  import('./pages/ProviderHealthPage').then((m) => ({
    default: m.ProviderHealthPage,
  })),
);
const LogsPage = lazy(() =>
  import('./pages/LogsPage').then((m) => ({ default: m.LogsPage })),
);
const RulesPage = lazy(() =>
  import('./pages/RulesPage').then((m) => ({ default: m.RulesPage })),
);
const ApplicationsPage = lazy(() =>
  import('./pages/ApplicationsPage').then((m) => ({
    default: m.ApplicationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);

export default function App() {
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<LoadingState label="Loading page…" />}>
          <Routes>
            <Route path="/" element={<Navigate to="/jobs" replace />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/providers/health" element={<ProviderHealthPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/dev" element={<DevToolsPage />} />
            <Route
              path="*"
              element={
                <PlaceholderPage
                  title="Not found"
                  phase="App"
                  description="No route matches this path."
                />
              }
            />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
