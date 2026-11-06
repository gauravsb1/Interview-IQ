import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/shell';
import Dashboard from '@/pages/dashboard';
import AuthPage from '@/pages/auth';
import ResumePage from '@/pages/resume';
import PracticePage from '@/pages/practice';
import InterviewPage from '@/pages/interview';
import HistoryPage from '@/pages/history';
import ResultsPage from '@/pages/results';
import CoachingPage from '@/pages/coaching';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/login">{() => <AuthPage mode="login" />}</Route>
          <Route path="/register">{() => <AuthPage mode="register" />}</Route>
          <Route path="/resume" component={ResumePage} />
          <Route path="/practice" component={PracticePage} />
          <Route path="/interview/:id" component={InterviewPage} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/results/:id" component={ResultsPage} />
          <Route path="/coaching" component={CoachingPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
