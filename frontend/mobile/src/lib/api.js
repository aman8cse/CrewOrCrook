import { API_BASE } from '../config';

export async function request({ token, method = 'GET', path, body, headers = {} }) {
  const finalHeaders = { ...headers };

  if (!finalHeaders['Content-Type'] && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }

  return data;
}
