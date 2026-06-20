// Auth gate: show login when signed out, the platform when signed in.
import { useAuth } from './auth/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';

export default function App() {
  const { user } = useAuth();
  return user ? <Home /> : <Login />;
}
