import { apiClient } from './apiClient';

const TOKEN_KEY = 'cafeos.accessToken';

export type AuthRegisterInput = {
  email: string;
  password: string;
  tenantId: string;
  roleId: string;
  outletId?: string | null;
};

export type AuthLoginInput = {
  email: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
};

export type JwtMeResponse = {
  sub: string;
  tenantId: string;
  roleId: string;
  outletId?: string | null;
  permissions: string[];
};

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(input: AuthLoginInput): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/login', input);
}

export async function register(input: AuthRegisterInput) {
  // Backend AuthController.register returns UsersService.create output.
  // For now just forward response.
  return apiClient.post('/auth/register', input);
}

export async function fetchMe(token: string) {
  return apiClient.get<JwtMeResponse>('/auth/me', { token });
}

