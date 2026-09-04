import axios from 'axios';

// API Base URL.
//
// Default is the relative path '/api', which the Vite dev server proxies to the
// backend (see vite.config.ts). Keeping it same-origin means no CORS preflight,
// and it works unchanged in a container or Codespace where 'localhost' from the
// browser's point of view is a different machine entirely.
//
// Set VITE_API_BASE_URL only to point at a backend on another origin, e.g. a
// deployed API in production.
// Trailing slashes are stripped: a value like "https://host/" would otherwise
// produce "https://host//api", and a double slash is a different path to most
// gateways and proxies.
const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

const API_BASE_URL = configuredBase ? `${configuredBase}/api` : '/api';

if (import.meta.env.DEV) {
  // Makes the "why is my request going there?" question answerable in one glance.
  console.info(
    `[api] baseURL = ${API_BASE_URL}` +
      (configuredBase
        ? '  (from VITE_API_BASE_URL — unset it to use the same-origin Vite proxy)'
        : '  (same-origin, proxied by Vite)')
  );
}

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request interceptor: attach auth token ──────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('REChain_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: auto-logout on 401 ────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('REChain_token');
      // Optionally redirect to login
      // window.location.href = '/signin';
    }
    return Promise.reject(error);
  }
);

// ═══════════════════════════════════════════════════════════
// API Endpoints — aligned with backend routes
// ═══════════════════════════════════════════════════════════

// User Authentication
// Backend register expects { name, email, password }
// We transform fullName → name here so the UI can keep using fullName
export const userAPI = {
  register: (data: { fullName: string; email: string; phone: string; password: string }) =>
    apiClient.post('/users/register', {
      name: data.fullName,
      email: data.email,
      password: data.password,
    }),

  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    apiClient.post('/users/login', data),

  forgotPassword: (email: string) =>
    apiClient.post('/users/forgot', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post(`/users/reset/${token}`, { password }),

  verifyEmail: (token: string) =>
    apiClient.get(`/users/verify/${token}`),

  getProfile: () =>
    apiClient.get('/users/me'),
};

// Properties (CRUD — admin-managed listings)
export const propertiesAPI = {
  getAll: () =>
    apiClient.get('/products/list'),

  getById: (id: string) =>
    apiClient.get(`/products/single/${id}`),
};

// User-submitted property listings (require auth)
export const userListingsAPI = {
  create: (formData: FormData) =>
    apiClient.post('/user/properties', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getMyListings: () =>
    apiClient.get('/user/properties'),

  update: (id: string, formData: FormData) =>
    apiClient.put(`/user/properties/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id: string) =>
    apiClient.delete(`/user/properties/${id}`),
};

// Appointments (supports guest + auth bookings)
export const appointmentsAPI = {
  schedule: (data: {
    propertyId: string;
    date: string;
    time: string;
    name: string;
    email: string;
    phone: string;
    message?: string;
  }) =>
    apiClient.post('/appointments/schedule', data),

  getByUser: () =>
    apiClient.get('/appointments/user'),

  cancel: (id: string, reason?: string) =>
    apiClient.put(`/appointments/cancel/${id}`, { cancelReason: reason }),
};

// AI-Powered Property Search
// Backend transforms the request via middleware at POST /api/ai/search
export const aiAPI = {
  search: (data: {
    city?: string;
    locality?: string;
    T?: string;
    possession?: string;
    includeNoBroker?: boolean;
    price?: { min: number; max: number };
    type?: string;
    category?: string;
  }) => {
    const githubKey    = localStorage.getItem('REChain_github_key');
    const firecrawlKey = localStorage.getItem('REChain_firecrawl_key');
    return apiClient.post('/ai/search', data, {
      headers: {
        ...(githubKey    && { 'X-Github-Key':    githubKey }),
        ...(firecrawlKey && { 'X-Firecrawl-Key': firecrawlKey }),
      },
    });
  },

  locationTrends: (city: string) => {
    const githubKey    = localStorage.getItem('REChain_github_key');
    const firecrawlKey = localStorage.getItem('REChain_firecrawl_key');
    return apiClient.get(`/locations/${encodeURIComponent(city)}/trends`, {
      headers: {
        ...(githubKey    && { 'X-Github-Key':    githubKey }),
        ...(firecrawlKey && { 'X-Firecrawl-Key': firecrawlKey }),
      },
    });
  },

  validateKeys: (keys?: { githubKey?: string; firecrawlKey?: string }) => {
    const githubKey = (keys?.githubKey ?? localStorage.getItem('REChain_github_key') ?? '').trim();
    const firecrawlKey = (keys?.firecrawlKey ?? localStorage.getItem('REChain_firecrawl_key') ?? '').trim();

    return apiClient.post('/ai/validate-keys', {}, {
      headers: {
        ...(githubKey && { 'X-Github-Key': githubKey }),
        ...(firecrawlKey && { 'X-Firecrawl-Key': firecrawlKey }),
      },
    });
  },
};

// Helpers to read/write user API keys in localStorage
export const apiKeyStorage = {
  getGithubKey:    ()    => localStorage.getItem('REChain_github_key') || '',
  getFirecrawlKey: ()    => localStorage.getItem('REChain_firecrawl_key') || '',
  setGithubKey:    (key: string) => localStorage.setItem('REChain_github_key', key),
  setFirecrawlKey: (key: string) => localStorage.setItem('REChain_firecrawl_key', key),
  hasKeys: () => !!(localStorage.getItem('REChain_github_key') && localStorage.getItem('REChain_firecrawl_key')),
  clear: () => {
    localStorage.removeItem('REChain_github_key');
    localStorage.removeItem('REChain_firecrawl_key');
  },
};

// Contact Form
export const contactAPI = {
  submit: (data: { name: string; email: string; phone: string; message: string }) =>
    apiClient.post('/forms/submit', data),
};

export default apiClient;

