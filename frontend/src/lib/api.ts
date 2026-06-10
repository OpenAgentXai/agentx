import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const ANALYTICS_URL = process.env.NEXT_PUBLIC_ANALYTICS_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

export const analyticsApi = axios.create({
  baseURL: ANALYTICS_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Request interceptor: attach JWT
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get("access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

analyticsApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get("access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = Cookies.get("refresh_token");

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const newAccessToken = data.data.access_token;
          const newRefreshToken = data.data.refresh_token;

          Cookies.set("access_token", newAccessToken, { secure: true, sameSite: "strict" });
          Cookies.set("refresh_token", newRefreshToken, { secure: true, sameSite: "strict" });

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return api(originalRequest);
        } catch {
          Cookies.remove("access_token");
          Cookies.remove("refresh_token");
          window.location.href = "/login";
          return Promise.reject(error);
        }
      }

      Cookies.remove("access_token");
      Cookies.remove("refresh_token");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

// API methods
export const authAPI = {
  register: (data: { email: string; password: string; name: string; organization_name: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string; totp_code?: string }) =>
    api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  refresh: (refresh_token: string) => api.post("/auth/refresh", { refresh_token }),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (data: { token: string; new_password: string }) =>
    api.post("/auth/reset-password", data),
  setup2FA: () => api.post("/auth/setup-2fa"),
  verify2FA: (data: { code: string; temp_token: string }) => api.post("/auth/verify-2fa", data),
};

export const agentsAPI = {
  list: (params?: Record<string, unknown>) => api.get("/agents", { params }),
  create: (data: Record<string, unknown>) => api.post("/agents", data),
  get: (id: string) => api.get(`/agents/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/agents/${id}`, data),
  delete: (id: string) => api.delete(`/agents/${id}`),
  suspend: (id: string) => api.post(`/agents/${id}/suspend`),
  activate: (id: string) => api.post(`/agents/${id}/activate`),
  revoke: (id: string) => api.post(`/agents/${id}/revoke`),
  activity: (id: string) => api.get(`/agents/${id}/activity`),
  metrics: (id: string) => api.get(`/agents/${id}/metrics`),
};

export const credentialsAPI = {
  list: (agentId: string) => api.get(`/agents/${agentId}/credentials`),
  create: (agentId: string, data: Record<string, unknown>) =>
    api.post(`/agents/${agentId}/credentials`, data),
  revoke: (agentId: string, credId: string) =>
    api.delete(`/agents/${agentId}/credentials/${credId}`),
  rotate: (agentId: string, credId: string) =>
    api.post(`/agents/${agentId}/credentials/${credId}/rotate`),
};

export const groupsAPI = {
  list: () => api.get("/groups"),
  create: (data: Record<string, unknown>) => api.post("/groups", data),
  get: (id: string) => api.get(`/groups/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/groups/${id}`, data),
  delete: (id: string) => api.delete(`/groups/${id}`),
  assignAgent: (groupId: string, agentId: string) =>
    api.post(`/groups/${groupId}/agents`, { agent_id: agentId }),
  removeAgent: (groupId: string, agentId: string) =>
    api.delete(`/groups/${groupId}/agents/${agentId}`),
};

export const policiesAPI = {
  list: () => api.get("/policies"),
  create: (data: Record<string, unknown>) => api.post("/policies", data),
  get: (id: string) => api.get(`/policies/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/policies/${id}`, data),
  delete: (id: string) => api.delete(`/policies/${id}`),
  simulate: (data: Record<string, unknown>) => api.post("/policies/simulate", data),
  assign: (policyId: string, data: Record<string, unknown>) =>
    api.post(`/policies/${policyId}/assign`, data),
  unassign: (policyId: string, targetId: string) =>
    api.delete(`/policies/${policyId}/assign/${targetId}`),
};

export const sandboxesAPI = {
  list: () => api.get("/sandboxes"),
  create: (data: Record<string, unknown>) => api.post("/sandboxes", data),
  get: (id: string) => api.get(`/sandboxes/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/sandboxes/${id}`, data),
  delete: (id: string) => api.delete(`/sandboxes/${id}`),
  snapshot: (id: string, data: { name: string }) => api.post(`/sandboxes/${id}/snapshot`, data),
  restore: (id: string, snapshotId: string) =>
    api.post(`/sandboxes/${id}/restore/${snapshotId}`),
  metrics: (id: string) => api.get(`/sandboxes/${id}/metrics`),
};

export const auditAPI = {
  logs: (params?: Record<string, unknown>) => api.get("/audit/logs", { params }),
  getLog: (id: string) => api.get(`/audit/logs/${id}`),
  export: (params?: Record<string, unknown>) => api.get("/audit/export", { params }),
  alerts: () => api.get("/audit/alerts"),
  createAlertRule: (data: Record<string, unknown>) => api.post("/audit/alerts/rules", data),
};

export const dashboardAPI = {
  overview: () => api.get("/dashboard/overview"),
  metrics: () => api.get("/dashboard/metrics"),
};

export const analyticsAPIRoutes = {
  anomalies: (orgId: string, hours?: number) =>
    analyticsApi.get("/analytics/v1/anomalies", { params: { org_id: orgId, hours } }),
  behavior: (agentId: string, orgId: string, days?: number) =>
    analyticsApi.get(`/analytics/v1/behavior/${agentId}`, { params: { org_id: orgId, days } }),
  detect: (data: Record<string, unknown>) => analyticsApi.post("/analytics/v1/detect", data),
  reports: (orgId: string, reportType?: string) =>
    analyticsApi.get("/analytics/v1/reports", { params: { org_id: orgId, report_type: reportType } }),
};
