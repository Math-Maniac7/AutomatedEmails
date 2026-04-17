import { apiClient } from "./client";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const res = await apiClient.post<TokenPair>("/auth/login", { email, password });
  return res.data;
}

export async function register(email: string, password: string, display_name?: string): Promise<void> {
  await apiClient.post("/auth/register", { email, password, display_name });
}

export async function getMe() {
  const res = await apiClient.get("/auth/me");
  return res.data;
}
