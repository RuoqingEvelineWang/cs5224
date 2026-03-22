import { Amplify } from 'aws-amplify';
import { Routes, Route, BrowserRouter, Link } from 'react-router-dom';
import EventList from './pages/EventList.tsx';
import CreateEvent from './pages/CreateEvent.tsx';
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";

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
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Welcome {user?.username}</h1>

        <nav className="flex items-center gap-4 mb-6">
          <Link to="/" className="text-blue-600 hover:underline">Events</Link>
          <Link to="/create" className="text-blue-600 hover:underline">Create Event</Link>
          <button onClick={signOut} className="ml-auto text-sm text-gray-500 hover:text-gray-800">Sign Out</button>
        </nav>

        <Routes>
          <Route path="/" element={<EventList />} />
          <Route path="/create" element={<CreateEvent />} />
        </Routes>
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