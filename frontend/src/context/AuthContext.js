import React, { createContext, useContext, useEffect, useState } from 'react';
import API from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener('storekit:auth-expired', expire);
    return () => window.removeEventListener('storekit:auth-expired', expire);
  }, []);

  const login = async (email, password) => {
    // A token from an expired/other account is irrelevant to credential login.
    // Suppress it explicitly so login remains an unauthenticated request.
    const { data } = await API.post('/auth/login', { email, password }, {
      headers: { Authorization: undefined },
      skipAuth: true,
      suppressAuthRedirect: true,
    });
    if (data.mfaRequired) return { ...data.user, mfaRequired: true, challengeToken: data.challengeToken };
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  // ── NEW: called after Google OAuth succeeds ──────────────────────────────
  const loginWithGoogle = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);   // ← this is what updates the UI
    return userData;
  };

  const register = async (formData) => {
    const res = await API.post('/auth/register', formData);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (userData) => {
    const updated = { ...user, ...userData };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, register, logout, updateUser, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
