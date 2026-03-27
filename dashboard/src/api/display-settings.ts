import { api } from './client';

export interface DisplaySettings {
  enabled: boolean;
  displayOn: 'all' | 'products' | 'cart' | 'home';
  mobileVisible: boolean;
  widgetType: 'bubble' | 'embed';
}

export const displaySettingsApi = {
  get: () => api.get<DisplaySettings>('/display-settings'),
  save: (settings: Partial<DisplaySettings>) =>
    api.post<DisplaySettings>('/display-settings', settings),
};
