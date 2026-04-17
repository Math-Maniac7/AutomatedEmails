import { apiClient } from "./client";

export interface AutoReplyRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  trigger_type: string;
  keywords: string[];
  keywords_match_mode: string;
  sender_filter: string | null;
  subject_filter: string | null;
  action_type: string;
  template_id: string | null;
  ai_instructions: string | null;
  max_replies_per_sender_per_day: number;
  cooldown_hours: number;
  created_at: string;
  updated_at: string;
}

export interface AutoReplyLog {
  id: string;
  rule_id: string | null;
  recipient_email: string | null;
  template_used_id: string | null;
  ai_model_used: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export async function listRules(): Promise<AutoReplyRule[]> {
  const res = await apiClient.get<AutoReplyRule[]>("/auto-replies");
  return res.data;
}

export async function createRule(data: Partial<AutoReplyRule> & { name: string; trigger_type: string; action_type: string }): Promise<AutoReplyRule> {
  const res = await apiClient.post<AutoReplyRule>("/auto-replies", data);
  return res.data;
}

export async function updateRule(id: string, data: Partial<AutoReplyRule>): Promise<AutoReplyRule> {
  const res = await apiClient.put<AutoReplyRule>(`/auto-replies/${id}`, data);
  return res.data;
}

export async function deleteRule(id: string): Promise<void> {
  await apiClient.delete(`/auto-replies/${id}`);
}

export async function toggleRule(id: string): Promise<AutoReplyRule> {
  const res = await apiClient.patch<AutoReplyRule>(`/auto-replies/${id}/toggle`);
  return res.data;
}

export async function getReplyLog(page = 1): Promise<AutoReplyLog[]> {
  const res = await apiClient.get<AutoReplyLog[]>("/auto-replies/log", { params: { page } });
  return res.data;
}

export async function testRule(data: {
  rule_id: string;
  sample_subject?: string;
  sample_body?: string;
  sample_from?: string;
}) {
  const res = await apiClient.post("/auto-replies/test", data);
  return res.data as { matched: boolean; rule_name: string; trigger_type: string; action_type: string };
}
