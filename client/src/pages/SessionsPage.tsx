import { useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import type { SessionInfo, SessionState } from '../types';

type Props = {
  onOpen: (state: SessionState) => void;
};

export function SessionsPage({ onOpen }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSessions()
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load sessions'));
  }, []);

  async function openSession(session: SessionInfo) {
    try {
      if (session.status !== 'active') {
        await api.updateSession(session.id, { status: 'active' });
      }
      const state = await api.getSession(session.id);
      onOpen(state);
      window.location.hash = `/learn?session=${session.id}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open session');
    }
  }

  return (
    <div className="page">
      {error && <div className="banner error">{error}</div>}
      <section className="card">
        <h2>Sessions</h2>
        <p className="hint">
          Session progress is separate from the permanent opening library. Restarting a board never
          wipes saved knowledge.
        </p>
        {sessions.length === 0 ? (
          <div className="empty">No sessions yet. Open Learn to start from the standard position.</div>
        ) : (
          <table className="table-like">
            <thead>
              <tr>
                <th>ID</th>
                <th>Lesson</th>
                <th>Status</th>
                <th>Ply</th>
                <th>Last activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>#{session.id}</td>
                  <td>{session.lessonName || session.name || '—'}</td>
                  <td><span className={`badge ${session.status}`}>{session.status}</span></td>
                  <td>{session.ply}</td>
                  <td>{session.lastActivityAt}</td>
                  <td>
                    <button className="btn" type="button" onClick={() => void openSession(session)}>
                      {session.status === 'active' ? 'Continue' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
