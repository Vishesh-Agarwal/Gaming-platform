// Auth gate: show login when signed out, the platform when signed in.
import { useEffect } from 'react';
import { useAuth } from './auth/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import { initUserSettings } from './preferences.js';

export default function App() {
  const { user, ready } = useAuth();
  useEffect(() => {
    initUserSettings();
  }, []);
  if (!ready) return <div className="auth-loading">Loading...</div>;
  return user ? <Home /> : <Login />;
}
