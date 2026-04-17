import { apiClient } from "./client";

export interface Template {
  id: string;
  name: string;
  description: string | null;
  subject_line: string | null;
  body_html: string;
  body_text: string | null;
  variables: { key: string; default: string }[];
  tags: string[];
  use_count: number;
  created_at: string;
  updated_at: string;
}

export async function listTemplates(): Promise<Template[]> {
  const res = await apiClient.get<Template[]>("/templates");
  return res.data;
}

export async function createTemplate(data: Partial<Template> & { name: string; body_html: string }): Promise<Template> {
  const res = await apiClient.post<Template>("/templates", data);
  return res.data;
}

export async function updateTemplate(id: string, data: Partial<Template>): Promise<Template> {
  const res = await apiClient.put<Template>(`/templates/${id}`, data);
  return res.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/templates/${id}`);
}

export async function previewTemplate(template_id: string, variables: Record<string, string>) {
  const res = await apiClient.post("/templates/preview", { template_id, variables });
  return res.data as { body_html: string; body_text: string };
}
