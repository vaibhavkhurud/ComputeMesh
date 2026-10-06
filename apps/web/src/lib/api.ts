// Auth contract:
// - Backend returns { accessToken, refreshToken, user: { id, email, role } } on login/register/refresh
// - accessToken is a short-lived JWT (15m by default) stored in sessionStorage (not localStorage)
//   so it does not persist across browser sessions
// - refreshToken is stored in a secure httpOnly cookie in an ideal M11 arch, but since the existing
//   login page only uses localStorage, we match that contract.
//   IMPORTANT: we only store the accessToken. refreshToken is NOT stored by the UI (backend manages it
//   via session DB; the plain refresh token is not used by the web UI in this implementation).
// - 401 → user is unauthenticated → redirect to /login
// - 403 → user is authenticated but lacks the required role → show an access-denied error, do NOT redirect to /login

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function clearToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError('Unable to reach the server. Please try again.', 0);
  }

  if (res.status === 401) {
    // Unauthenticated — clear stale token and redirect to login
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  if (!res.ok) {
    let message = 'An unexpected error occurred';
    try {
      const data = await res.json();
      // Backend sends sanitized { message } via HttpExceptionFilter — never expose stack traces
      message = Array.isArray(data.message)
        ? data.message[0]
        : data.message ?? message;
    } catch {
      // JSON parse failed — use generic message, never expose raw text
    }
    // 403 — forbidden, not an auth failure; we throw so the caller can display access denied
    throw new ApiError(message, res.status);
  }

  return res.json();
}
