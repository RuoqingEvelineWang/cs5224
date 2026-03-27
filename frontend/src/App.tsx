import { useEffect, useState, type ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, fetchUserAttributes, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { Routes, Route, BrowserRouter, Link, useLocation } from 'react-router-dom';
import AuthPage from './pages/AuthPage.tsx';
import Dashboard from './pages/Dashboard';
import EventCreationWizard from './pages/EventCreationWizard';
import CreateEvent from './pages/CreateEvent.tsx';
import EventWorkspace from './pages/EventWorkspace.tsx';
import EventDetails from './pages/EventDetails.tsx';
import OnboardingPage from './pages/OnboardingPage.tsx';
import ProfilePage from './pages/ProfilePage.tsx';
import { fetchCurrentUser, createUser } from './api/User.tsx';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_CLIENT_ID,
    },
  },
});

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`text-sm font-medium transition-colors ${
        active ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      {children}
    </Link>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-400">Loading MidMeet...</p>
      </div>
    </div>
  );
}

function AppContent({
  userId,
  displayName,
  onSignOut,
  onDisplayNameChange,
}: {
  userId: string;
  displayName: string;
  onSignOut: () => void;
  onDisplayNameChange: (name: string) => void;
}) {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 group-hover:bg-indigo-700 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-base tracking-tight">MidMeet</span>
            </Link>

            <nav className="flex items-center gap-5">
              <NavLink to="/">Dashboard</NavLink>
              <NavLink to="/events/new">New Event</NavLink>
              <NavLink to="/create">Legacy Create</NavLink>
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <Link
                to="/profile"
                className="hidden sm:flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                  {(displayName || 'U')[0]?.toUpperCase()}
                </div>
                {displayName || 'User'}
              </Link>
              <button
                onClick={onSignOut}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/events/new" element={<EventCreationWizard />} />
            <Route path="/create" element={<CreateEvent />} />
            <Route path="/events/:eventId/workspace" element={<EventWorkspace />} />
            <Route path="/events/:eventId/details" element={<EventDetails />} />
            <Route path="/profile" element={<ProfilePage userId={userId} onNameChange={onDisplayNameChange} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'authed' | 'unauthed'>('loading');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  async function checkAuth() {
    try {
      const user = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      setUserId(user.userId);
      setEmail(attrs.email ?? '');

      let profile = await fetchCurrentUser(user.userId);
      if (!profile) {
        await createUser(user.userId, attrs.name ?? user.username, attrs.email ?? '');
        profile = await fetchCurrentUser(user.userId);
      }

      if (!profile?.address) {
        setStatus('onboarding');
      } else {
        setDisplayName(profile.name);
        setStatus('authed');
      }
    } catch {
      setStatus('unauthed');
    }
  }

  useEffect(() => {
    checkAuth();
    const unsub = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') checkAuth();
      if (payload.event === 'signedOut') {
        setStatus('unauthed');
        setUserId('');
        setEmail('');
        setDisplayName('');
      }
    });
    return unsub;
  }, []);

  async function handleSignOut() {
    await amplifySignOut();
    setStatus('unauthed');
    setUserId('');
    setEmail('');
    setDisplayName('');
  }

  function handleOnboardingComplete() {
    fetchCurrentUser(userId).then((profile) => {
      setDisplayName(profile?.name ?? '');
      setStatus('authed');
    });
  }

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'unauthed') return <AuthPage onAuthenticated={checkAuth} />;
  if (status === 'onboarding') {
    return <OnboardingPage userId={userId} email={email} onComplete={handleOnboardingComplete} />;
  }

  return (
    <AppContent
      userId={userId}
      displayName={displayName}
      onSignOut={handleSignOut}
      onDisplayNameChange={setDisplayName}
    />
  );
}
