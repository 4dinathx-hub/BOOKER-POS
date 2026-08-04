import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

function getTokens() {
  return {
    accessToken: localStorage.getItem('booker_access_token'),
    refreshToken: localStorage.getItem('booker_refresh_token'),
  };
}

export function setTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem('booker_access_token', accessToken);
  if (refreshToken) localStorage.setItem('booker_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('booker_access_token');
  localStorage.removeItem('booker_refresh_token');
}

api.interceptors.request.use((config) => {
  const { accessToken } = getTokens();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post('/api/auth/refresh', { refreshToken });
    setTokens(data.accessToken);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

// On a 401, try exactly one silent refresh-and-retry before giving up and
// bouncing to /login. Single in-flight refreshPromise avoids a thundering
// herd of refresh calls when several requests 401 at once.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
