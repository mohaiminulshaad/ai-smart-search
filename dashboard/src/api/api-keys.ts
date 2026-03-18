import { api } from './client';

export interface ApiKey {
  id: string;
  provider: 'gemini' | 'chatgpt';
  label: string;
  maskedKey: string;
  createdAt: string;
}

export const apiKeysApi = {
  getAll: () => api.get<ApiKey[]>('/api-keys'),
  create: (data: { provider: string; label: string; key: string }) =>
    api.post<ApiKey>('/api-keys', data),
  delete: (id: string) => api.delete<{ deleted: string }>(`/api-keys/${id}`),
};
