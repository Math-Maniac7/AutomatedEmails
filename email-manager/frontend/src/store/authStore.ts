import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUserEmail: (email: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userEmail: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUserEmail: (email) => set({ userEmail: email }),
      clear: () => set({ accessToken: null, refreshToken: null, userEmail: null }),
    }),
    { name: "auth-storage" }
  )
);
