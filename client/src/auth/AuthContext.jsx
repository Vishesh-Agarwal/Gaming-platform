// Auth state: persists token + user in localStorage, refreshes account profile
// from the server, and exposes login/signup/profile/logout actions.
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);
const STORAGE_KEY = 'gp-auth';

function readStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStoredAuth);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  useEffect(() => {
    let cancelled = false;
    if (!auth?.token) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }
    setReady(false);
    api.me(auth.token)
      .then(({ user }) => {
        if (!cancelled) setAuth((prev) => (prev?.token ? { ...prev, user } : prev));
      })
      .catch(() => {
        if (!cancelled) setAuth(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.token]);

  const login = async (username, password) => {
    const { token, user } = await api.login(username, password);
    setAuth({ token, user });
  };
  const signup = async (username, password) => {
    const { token, user } = await api.signup(username, password);
    setAuth({ token, user });
  };
  const updateProfile = async (profile) => {
    if (!auth?.token) throw new Error('Unauthorized');
    const { user } = await api.updateProfile(auth.token, profile);
    setAuth((prev) => (prev?.token ? { ...prev, user } : prev));
    return user;
  };
  const logout = () => setAuth(null);

  return (
    <AuthContext.Provider
      value={{
        ready,
        user: auth?.user || null,
        token: auth?.token || null,
        login,
        signup,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
