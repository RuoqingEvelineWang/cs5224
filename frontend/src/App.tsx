import { Amplify } from 'aws-amplify';
import { Routes, Route, BrowserRouter, Link } from 'react-router-dom';
import EventList from './pages/EventList.tsx';
import CreateEvent from './pages/CreateEvent.tsx';
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

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
      <div style={{ padding: 20 }}>
        <h1>Welcome {user?.username}</h1>

        <nav style={{ marginBottom: 20 }}>
          <Link to="/">Events</Link> |{" "}
          <Link to="/create">Create Event</Link> |{" "}
          <button onClick={signOut}>Sign Out</button>
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