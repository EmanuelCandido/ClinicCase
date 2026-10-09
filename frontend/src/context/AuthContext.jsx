import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearStoredAuth, getStoredAuth, storeAuth } from '../services/api.js';
import { getProfessor, login as loginRequest, registerDemoProfessor } from '../services/pibicApi.js';
import { migrateLegacyProfessorStorage, professorStorageKey } from '../services/localStorage.js';

const AuthContext = createContext(null);
const PROFILE_AVATAR_KEY = 'pibic.profileAvatar';

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const storedAuth = getStoredAuth();
    migrateLegacyProfessorStorage(storedAuth?.idProfessor);
    return storedAuth;
  });
  const [profile, setProfile] = useState(() => buildFallbackProfile(auth));

  const refreshProfile = useCallback(async (currentAuth = auth) => {
    if (!currentAuth?.token || !currentAuth.idProfessor) {
      const fallback = buildFallbackProfile(currentAuth);
      setProfile(fallback);
      return fallback;
    }

    const professor = await getProfessor(currentAuth.idProfessor);
    const nextProfile = {
      name: professor.nome || currentAuth.username || 'Professor',
      email: professor.email || '',
      course: professor.materia || currentAuth.role || 'PROFESSOR',
      avatar: readStoredAvatar(currentAuth.idProfessor),
    };
    setProfile(nextProfile);
    return nextProfile;
  }, [auth]);

  const updateProfileState = useCallback((values) => {
    setProfile((current) => ({ ...current, ...values }));
    if (Object.prototype.hasOwnProperty.call(values, 'avatar')) {
      const key = professorStorageKey(PROFILE_AVATAR_KEY, auth?.idProfessor);
      if (!key) return;
      if (values.avatar) window.localStorage.setItem(key, values.avatar);
      else window.localStorage.removeItem(key);
    }
  }, [auth?.idProfessor]);

  const login = useCallback(async ({ username, password, remember }) => {
    const response = await loginRequest(username, password, remember);
    storeAuth(response, remember);
    migrateLegacyProfessorStorage(response.idProfessor);
    setAuth(response);
    return response;
  }, []);

  const registerDemo = useCallback(async (payload) => {
    const response = await registerDemoProfessor(payload);
    storeAuth(response, false);
    migrateLegacyProfessorStorage(response.idProfessor);
    setAuth(response);
    return response;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setAuth(null);
    setProfile(buildFallbackProfile(null));
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener('pibic:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('pibic:unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      if (!auth?.token) {
        setProfile(buildFallbackProfile(null));
        return;
      }

      if (!auth.idProfessor) {
        setProfile(buildFallbackProfile(auth));
        return;
      }

      try {
        const professor = await getProfessor(auth.idProfessor, { signal: controller.signal });

        if (!controller.signal.aborted) {
          setProfile({
            name: professor.nome || auth.username || 'Professor',
            email: professor.email || '',
            course: professor.materia || auth.role || 'PROFESSOR',
            avatar: readStoredAvatar(auth.idProfessor),
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setProfile(buildFallbackProfile(auth));
        }
      }
    }

    loadProfile();

    return () => {
      controller.abort();
    };
  }, [auth]);

  const value = useMemo(
    () => ({
      auth,
      isAuthenticated: Boolean(auth?.token),
      login,
      logout,
      profile,
      refreshProfile,
      registerDemo,
      updateProfileState,
    }),
    [auth, login, logout, profile, refreshProfile, registerDemo, updateProfileState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function buildFallbackProfile(auth) {
  return {
    name: auth?.username || 'Professor',
    email: '',
    course: auth?.role || 'PROFESSOR',
    avatar: readStoredAvatar(auth?.idProfessor),
  };
}

function readStoredAvatar(idProfessor) {
  const key = professorStorageKey(PROFILE_AVATAR_KEY, idProfessor);
  return key ? window.localStorage.getItem(key) || '' : '';
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }

  return context;
}
