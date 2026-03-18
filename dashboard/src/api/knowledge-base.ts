import { api } from './client';

export interface KnowledgeDocument {
  id: string;
  type: string;
  title: string;
  url: string | null;
  filePath: string | null;
  status: 'processing' | 'ready' | 'error';
  uploadedAt: string;
  qaCount?: number;
}

export const knowledgeBaseApi = {
  getAll: () => api.get<KnowledgeDocument[]>('/knowledge-base'),

  /** Upload file, returns the created document */
  uploadFile: async (file: File): Promise<KnowledgeDocument> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = await (window as any).shopify.idToken();
    const res = await fetch('/api/knowledge-base/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'File upload failed');
    }
    return res.json();
  },

  addReference: (url: string, title: string) =>
    api.post<KnowledgeDocument>('/knowledge-base/reference', { type: 'url', title, url }),

  delete: (id: string) => api.delete<{ deleted: string }>(`/knowledge-base/${id}`),
};
