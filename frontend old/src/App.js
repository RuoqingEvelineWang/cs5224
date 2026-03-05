import { Amplify } from 'aws-amplify';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import EventList from './EventList.js';
import CreateEvent from './CreateEvent.js';
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_CLIENT_ID,
      region: process.env.REACT_APP_REGION
    }
  }
});

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <BrowserRouter>
          <div>
            <h1>Welcome {user.username}</h1>
            <button onClick={signOut}>Sign Out</button>
            <Routes>
              <Route path="/" element={<EventList user={user} />} />
              <Route path="/create" element={<CreateEvent user={user} />} />
            </Routes>
          </div>
        </BrowserRouter>
      )}
    </Authenticator>
  );
}

export default App;