import { Amplify } from 'aws-amplify';
import { Routes, Route, BrowserRouter, Link } from 'react-router-dom';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import Dashboard from './pages/Dashboard';
import EventCreationWizard from './pages/EventCreationWizard';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_CLIENT_ID
    }
  }
});

function AppContent() {
  const { signOut, user } = useAuthenticator();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-stone-100 px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <header className="rounded-2xl bg-white p-5 shadow-sm">
            <h1 className="text-2xl font-bold text-stone-800">Welcome, {user?.username}</h1>
            <p className="mt-1 text-sm text-stone-600">Coordinate schedules and plan meetups with your friends.</p>
          </header>

          <nav className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <Link to="/" className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
              Dashboard
            </Link>
            <Link
              to="/events/new"
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Event Creation Wizard
            </Link>
            <button
              onClick={signOut}
              className="ml-auto rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400"
            >
              Sign Out
            </button>
          </nav>

          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/events/new" element={<EventCreationWizard />} />
            </Routes>
          </main>

          <footer className="pb-4 text-center text-xs text-stone-500">TeamUp planning workspace</footer>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <Authenticator>
      <AppContent />
    </Authenticator>
  );
}
