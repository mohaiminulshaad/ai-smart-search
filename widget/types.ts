// widget/types.ts — Smart Search widget type definitions

export interface SmartSearchSettings {
  name: string;
  welcomeMessage: string;
  primaryColor: string;
  bubblePosition: 'bottom-right' | 'bottom-left';
  logoUrl: string;
  toneOfVoice: string;
  imageUploadEnabled: boolean;
  activeApiKeyId: string | null;
}

export interface DisplaySettings {
  enabled: boolean;
  displayOn: 'all' | 'home' | 'products' | 'cart';
  mobileVisible: boolean;
}

export interface ProductCard {
  id: string | number;
  title: string;
  price: number | string;
  image?: string | null;
  available: boolean;
  score?: number;
  handle?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  imageUrl?: string | null;
  products?: ProductCard[] | null;
  similarProducts?: ProductCard[] | null;
  similarCollection?: string | null;
  ts: number;
}

export interface ChatResponse {
  reply: string;
  session_id: string;
  user_type: 'guest' | 'registered';
  image_url?: string | null;
}

export interface GuestInfo {
  firstName: string;
  lastName: string;
  email: string;
}
