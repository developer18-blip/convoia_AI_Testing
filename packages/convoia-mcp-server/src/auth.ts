/**
 * API Key validation against ConvoiaAI backend.
 * Validates on startup, re-validates every 30 minutes.
 */

import axios from 'axios';

interface AuthResult {
  valid: boolean;
  balance: number;
  userId: string;
  error?: string;
}

let cachedAuth: AuthResult | null = null;
let lastValidation = 0;
const REVALIDATION_INTERVAL = 30 * 60 * 1000; // 30 minutes

export async function validateApiKey(apiKey: string, baseUrl: string): Promise<AuthResult> {
  const now = Date.now();

  // Return cache if fresh
  if (cachedAuth && cachedAuth.valid && now - lastValidation < REVALIDATION_INTERVAL) {
    return cachedAuth;
  }

  try {
    const response = await axios.get(`${baseUrl}/token-wallet/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });

    const data = response.data?.data || response.data;
    cachedAuth = {
      valid: true,
      balance: data.tokenBalance || data.balance || 0,
      userId: data.userId || '',
    };
    lastValidation = now;
    return cachedAuth;
  } catch (err: any) {
    const status = err?.response?.status;
    cachedAuth = {
      valid: false,
      balance: 0,
      userId: '',
      error: status === 401 ? 'Invalid API key' : `Connection failed: ${err.message}`,
    };
    return cachedAuth;
  }
}

export function getCachedAuth(): AuthResult | null {
  return cachedAuth;
}

export function clearAuthCache(): void {
  cachedAuth = null;
  lastValidation = 0;
}
