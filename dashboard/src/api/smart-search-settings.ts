import { api } from './client';

export interface SmartSearchSettings {
  brandName: string;
  shopDescription: string;
  name: string;
  welcomeMessage: string;
  fallbackMessage: string;
  primaryColor: string;
  bubblePosition: 'bottom-right' | 'bottom-left';
  logoUrl: string;
  toneOfVoice: 'professional' | 'friendly' | 'casual';
  imageUploadEnabled: boolean;
  activeApiKeyId: string | null;
}

export const smartSearchSettingsApi = {
  get: () => api.get<SmartSearchSettings>('/smart-search/settings'),
  save: (settings: Partial<SmartSearchSettings>) =>
    api.post<SmartSearchSettings>('/smart-search/settings', settings),

  /** Upload logo to Shopify CDN, returns the CDN URL */
  uploadLogo: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('logo', file);
    const token = await (window as any).shopify.idToken();
    const res = await fetch('/api/smart-search/logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Logo upload failed');
    }
    const data = await res.json();
    return data.url;
  },
};
