// auth.service.js — login/logout/current user
import { storage } from '../utils/storage.js';

const KEY = 'auth.session';

const uid = () => crypto.randomUUID?.() || ('id_' + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();

function saveSession(s){ storage.set(KEY, s); return s; }

export const authService = {
  current(){
    return storage.get(KEY, null);
  },

  isAuthenticated(){
    return !!storage.get(KEY, null);
  },

  // Mock: aceita qualquer email/senha. Trocar por API depois.
  async login({ email, password }){
    if (!email) throw new Error('Email obrigatório');
    const user = {
      id: uid(),
      email: String(email).toLowerCase(),
      name: email.split('@')[0],
      createdAt: now(),
      roles: ['owner'],
    };
    return saveSession({ user, token: 'mock-' + uid(), loggedAt: now() });
  },

  async logout(){
    storage.del(KEY);
    return true;
  }
};
