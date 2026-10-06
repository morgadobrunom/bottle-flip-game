import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { SessionProvider } from './api/session';
import { SnackbarProvider } from './components/ui';
import { GameStage } from './game/GameStage';
import { Customize } from './routes/Customize';
import { Home } from './routes/Home';
import { Legal } from './routes/Legal';
import { Login } from './routes/Login';
import { Play } from './routes/Play';
import { RewardWon } from './routes/RewardWon';
import { Rewards } from './routes/Rewards';
import { Settings } from './routes/Settings';
import { TokenEntry, TokenLanding } from './routes/Token';
import { Verify } from './routes/Verify';
import './styles.css';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (dsn) {
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'local',
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function Layout() {
  return (
    <GameStage>
      <Outlet />
    </GameStage>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'play', element: <Play /> },
      { path: 'customize', element: <Customize /> },
      { path: 't', element: <TokenEntry /> },
      { path: 't/:code', element: <TokenLanding /> },
      { path: 'login', element: <Login /> },
      { path: 'login/verify', element: <Verify /> },
      { path: 'rewards', element: <Navigate to="/rewards/leaderboard" replace /> },
      { path: 'rewards/won/:id', element: <RewardWon /> },
      { path: 'rewards/:tab', element: <Rewards /> },
      { path: 'settings', element: <Settings /> },
      { path: 'terms', element: <Legal doc="terms" /> },
      { path: 'privacy', element: <Legal doc="privacy" /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong. Reload to keep flipping.</p>}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SnackbarProvider>
            <RouterProvider router={router} />
          </SnackbarProvider>
        </SessionProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
