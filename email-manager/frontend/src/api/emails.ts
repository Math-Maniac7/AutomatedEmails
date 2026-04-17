import { apiClient } from "./client";

export interface EmailMessage {
  id: string;
  thread_id: string;
  email_account_id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: { email: string; name: string }[];
  cc_addresses: { email: string; name: string }[];
  subject: string | null;
  snippet: string | null;
  received_at: string;
  is_read: boolean;
  is_sent: boolean;
  has_attachments: boolean;
  auto_replied: boolean;
  body_text?: string;
  body_html?: string;
  reply_to?: string;
  message_id_header?: string;
}

export interface EmailFilters {
  account_ids?: string;
  is_read?: boolean;
  is_sent?: boolean;
  has_attachments?: boolean;
  search?: string;
  from?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export async function listEmails(filters: EmailFilters = {}): Promise<EmailMessage[]> {
  const res = await apiClient.get<EmailMessage[]>("/emails", { params: filters });
  return res.data;
}

export async function getEmail(id: string): Promise<EmailMessage> {
  const res = await apiClient.get<EmailMessage>(`/emails/${id}`);
  return res.data;
}

export async function getThread(id: string): Promise<EmailMessage[]> {
  const res = await apiClient.get<EmailMessage[]>(`/emails/${id}/thread`);
  return res.data;
}

export async function replyToEmail(id: string, body_text: string, body_html?: string) {
  await apiClient.post(`/emails/${id}/reply`, { body_text, body_html });
}

export async function composeEmail(data: {
  account_id: string;
  to_addresses: string[];
  subject: string;
  body_text: string;
  body_html?: string;
}) {
  await apiClient.post("/emails/compose", data);
}

export async function markRead(id: string, is_read: boolean) {
  await apiClient.patch(`/emails/${id}/read`, null, { params: { is_read } });
}

export async function starEmail(id: string, is_starred: boolean) {
  await apiClient.patch(`/emails/${id}/star`, null, { params: { is_starred } });
}

export async function archiveEmail(id: string) {
  await apiClient.patch(`/emails/${id}/archive`);
}
