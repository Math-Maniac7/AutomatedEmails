import { apiClient } from "./client";

export interface EmailAccount {
  id: string;
  account_type: string;
  display_name: string | null;
  email_address: string;
  color_label: string;
  imap_host: string | null;
  imap_port: number;
  smtp_host: string | null;
  smtp_port: number;
  is_active: boolean;
  last_polled_at: string | null;
  poll_interval_secs: number;
  created_at: string;
}

export async function listAccounts(): Promise<EmailAccount[]> {
  const res = await apiClient.get<EmailAccount[]>("/accounts");
  return res.data;
}

export async function connectImapAccount(data: {
  email_address: string;
  display_name?: string;
  password: string;
  imap_host: string;
  imap_port?: number;
  imap_use_ssl?: boolean;
  smtp_host: string;
  smtp_port?: number;
  smtp_use_tls?: boolean;
  color_label?: string;
}): Promise<EmailAccount> {
  const res = await apiClient.post<EmailAccount>("/accounts/imap", data);
  return res.data;
}

export async function testAccount(id: string): Promise<void> {
  await apiClient.post(`/accounts/${id}/test`);
}

export async function syncAccount(id: string): Promise<void> {
  await apiClient.post(`/accounts/${id}/sync`);
}

export async function deleteAccount(id: string): Promise<void> {
  await apiClient.delete(`/accounts/${id}`);
}
