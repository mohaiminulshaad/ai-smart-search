import { api } from './client';

export interface GuestUser {
  id: string;
  userType: string;
  guestName: string | null;
  guestEmail: string | null;
  messageCount: number;
  startedAt: string;
  lastMessageAt: string;
}

export interface RegisteredUser {
  id: string;
  userType: string;
  customerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  messageCount: number;
  startedAt: string;
  lastMessageAt: string;
}

export interface SessionMessage {
  role: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export const usersApi = {
  getGuests:    () => api.get<GuestUser[]>('/users/guests'),
  getRegistered: () => api.get<RegisteredUser[]>('/users/registered'),
  getMessages:  (sessionId: string) =>
    api.get<SessionMessage[]>(`/users/sessions/${sessionId}/messages`),
};
