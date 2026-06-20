// Auth state: persists token + user in localStorage, exposes login/signup/logout.
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);
const STORAGE_KEY = 'gp-auth';

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  const login = async (username, password) => {
    const { token, user } = await api.login(username, password);
    setAuth({ token, user });
  };
  const signup = async (username, password) => {
    const { token, user } = await api.signup(username, password);
    setAuth({ token, user });
  };
  const logout = () => setAuth(null);

  return (
    <AuthContext.Provider
      value={{ user: auth?.user || null, token: auth?.token || null, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
