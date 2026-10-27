import { useEffect, useMemo, useState } from 'react';
import { LearnPage } from './pages/LearnPage';
import { LibraryPage } from './pages/LibraryPage';
import { SessionsPage } from './pages/SessionsPage';
import type { SessionState } from './types';

function parseHash() {
  const raw = window.location.hash.slice(1) || '/learn';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const params = new URLSearchParams(queryPart || '');
  const sessionParam = params.get('session');
  return {
    path,
    sessionId: sessionParam ? Number(sessionParam) : null,
  };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    if (!window.location.hash) window.location.hash = '/learn';
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const nav = useMemo(() => ([
    { path: '/learn', label: 'Learn' },
    { path: '/library', label: 'Opening Library' },
    { path: '/sessions', label: 'Sessions' },
  ]), []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Lotus Opening Library</h1>
          <span>Local repertoire from Lotus Chess lessons</span>
        </div>
        <nav className="nav">
          {nav.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={route.path === item.path ? 'active' : ''}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="session-chip">
          {session ? (
            <>
              Session <strong>#{session.session.id}</strong>
              {session.session.lessonName ? ` · ${session.session.lessonName}` : ''}
            </>
          ) : (
            'No session yet'
          )}
        </div>
      </header>
      {route.path === '/library' && (
        <LibraryPage onPlayed={setSession} />
      )}
      {route.path === '/sessions' && (
        <SessionsPage onOpen={setSession} />
      )}
      {route.path !== '/library' && route.path !== '/sessions' && (
        <LearnPage
          sessionId={Number.isFinite(route.sessionId) ? route.sessionId : null}
          onSessionChange={setSession}
        />
      )}
    </div>
  );
}
