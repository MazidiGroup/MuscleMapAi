import { storage } from '@/src/utils/storage';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const API_BASE = `${BASE_URL}/api`;

const TOKEN_KEY = 'apex.session_token';

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, '')) || null;
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const headers = await authHeaders();
  const r = await fetch(`${API_BASE}${path}`, { headers });
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return r.json();
}

export async function apiPost<T = any>(path: string, body: any = {}): Promise<T> {
  const headers = await authHeaders();
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`POST ${path} failed: ${r.status} ${txt}`);
  }
  return r.json();
}

// SSE-style streaming via fetch ReadableStream
export async function streamCoach(
  message: string,
  onDelta: (delta: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  const headers = await authHeaders();
  try {
    const res = await fetch(`${API_BASE}/coach/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ message }),
    });
    if (!res.ok || !res.body) {
      onError(`stream failed: ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const obj = JSON.parse(json);
          if (obj.delta) onDelta(obj.delta);
          if (obj.done) onDone();
          if (obj.error) onError(obj.error);
        } catch {
          // ignore parse errors
        }
      }
    }
    onDone();
  } catch (e: any) {
    onError(e?.message || 'stream error');
  }
}
