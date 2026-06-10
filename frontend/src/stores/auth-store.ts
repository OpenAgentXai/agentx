import { create } from "zustand";
import Cookies from "js-cookie";
import { authAPI } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string;
  totp_enabled: boolean;
  created_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requires2FA: boolean;
  tempToken: string | null;

  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  register: (email: string, password: string, name: string, orgName: string) => Promise<void>;
  logout: () => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  setUser: (user: User) => void;
  checkAuth: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  requires2FA: false,
  tempToken: null,

  login: async (email, password, totpCode) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.login({ email, password, totp_code: totpCode });
      const result = data.data;

      if (result.requires_2fa) {
        set({
          requires2FA: true,
          tempToken: result.access_token,
          isLoading: false,
        });
        return;
      }

      Cookies.set("access_token", result.access_token, { secure: true, sameSite: "strict" });
      Cookies.set("refresh_token", result.refresh_token, { secure: true, sameSite: "strict" });

      set({
        user: result.user,
        isAuthenticated: true,
        isLoading: false,
        requires2FA: false,
        tempToken: null,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email, password, name, orgName) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.register({
        email,
        password,
        name,
        organization_name: orgName,
      });
      const result = data.data;

      Cookies.set("access_token", result.access_token, { secure: true, sameSite: "strict" });
      Cookies.set("refresh_token", result.refresh_token, { secure: true, sameSite: "strict" });

      set({
        user: result.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore errors on logout
    }
    Cookies.remove("access_token");
    Cookies.remove("refresh_token");
    set({
      user: null,
      isAuthenticated: false,
      requires2FA: false,
      tempToken: null,
    });
  },

  verify2FA: async (code) => {
    const { tempToken } = get();
    if (!tempToken) throw new Error("No pending 2FA verification");

    set({ isLoading: true });
    try {
      const { data } = await authAPI.verify2FA({ code, temp_token: tempToken });
      const result = data.data;

      Cookies.set("access_token", result.access_token, { secure: true, sameSite: "strict" });
      Cookies.set("refresh_token", result.refresh_token, { secure: true, sameSite: "strict" });

      set({
        user: result.user,
        isAuthenticated: true,
        isLoading: false,
        requires2FA: false,
        tempToken: null,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  setUser: (user) => set({ user, isAuthenticated: true }),

  checkAuth: () => {
    const token = Cookies.get("access_token");
    return !!token;
  },
}));
