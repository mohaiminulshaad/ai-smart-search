import { api } from './client';

export interface DashboardStats {
  total_conversations: number;
  searches_today: number;
  guest_users: number;
  registered_users: number;
  knowledge_base_items: number;
  products_indexed: number;
}

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
};
