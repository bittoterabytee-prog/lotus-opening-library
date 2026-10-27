import type { Opening, SessionInfo, SessionState } from './types';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the local server. Is the API running on port 3001?');
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const payload = data as { error?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      payload?.error || `Request failed (${response.status})`,
      payload?.details,
    );
  }

  return data as T;
}

export const api = {
  health() {
    return request<{ ok: boolean; dbPath: string }>('/api/health');
  },

  getActiveSession() {
    return request<{ session: SessionInfo | null; state: SessionState | null }>('/api/sessions/active');
  },

  listSessions() {
    return request<{ sessions: SessionInfo[] }>('/api/sessions');
  },

  getSession(id: number) {
    return request<SessionState>(`/api/sessions/${id}`);
  },

  createSession(body: {
    name?: string;
    lessonName?: string;
    reuseActive?: boolean;
    force?: boolean;
  }) {
    return request<SessionState>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateSession(id: number, body: { name?: string | null; lessonName?: string | null; status?: string }) {
    return request<SessionState>(`/api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  playMove(id: number, body: { uci?: string; san?: string; clientEventId: string }) {
    return request<SessionState>(`/api/sessions/${id}/moves`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  undo(id: number) {
    return request<SessionState>(`/api/sessions/${id}/undo`, { method: 'POST' });
  },

  redo(id: number) {
    return request<SessionState>(`/api/sessions/${id}/redo`, { method: 'POST' });
  },

  gotoPly(id: number, ply: number) {
    return request<SessionState>(`/api/sessions/${id}/goto`, {
      method: 'POST',
      body: JSON.stringify({ ply }),
    });
  },

  restart(id: number) {
    return request<SessionState>(`/api/sessions/${id}/restart`, { method: 'POST' });
  },

  listOpenings(q?: string) {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<{ openings: Opening[] }>(`/api/openings${query}`);
  },

  getOpening(id: number) {
    return request<Opening>(`/api/openings/${id}`);
  },

  saveOpening(body: { sessionId: number; name: string; source?: string; notes?: string }) {
    return request<Opening>('/api/openings', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateOpening(id: number, body: { name?: string; source?: string; notes?: string }) {
    return request<Opening>(`/api/openings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  deleteOpening(id: number) {
    return request<{ deleted: boolean; id: number }>(`/api/openings/${id}`, { method: 'DELETE' });
  },

  playOpening(id: number) {
    return request<SessionState>(`/api/openings/${id}/play`, { method: 'POST' });
  },

  exportLibrary() {
    return request<Record<string, unknown>>('/api/export');
  },

  importLibrary(payload: unknown) {
    return request<{ imported: boolean; summary: Record<string, number> }>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
