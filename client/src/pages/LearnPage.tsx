import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChessBoard } from '../components/ChessBoard';
import { MoveHistory } from '../components/MoveHistory';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { Modal } from '../components/Modal';
import { ApiError, api } from '../api';
import type { SessionState } from '../types';

type Props = {
  sessionId?: number | null;
  onSessionChange: (state: SessionState | null) => void;
};

export function LearnPage({ sessionId, onSessionChange }: Props) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [openingName, setOpeningName] = useState('');
  const [openingSource, setOpeningSource] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [lessonName, setLessonName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [hoverUci, setHoverUci] = useState<string | null>(null);

  const apply = useCallback((next: SessionState) => {
    setState(next);
    onSessionChange(next);
    setLessonName(next.session.lessonName ?? '');
  }, [onSessionChange]);

  const fail = useCallback((err: unknown) => {
    const message = err instanceof ApiError ? err.message : 'Something went wrong';
    setError(message);
    console.error('[lotus]', err);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (sessionId) {
        apply(await api.getSession(sessionId));
        return;
      }
      const active = await api.getActiveSession();
      if (active.state) {
        apply(active.state);
        return;
      }
      apply(await api.createSession({ reuseActive: true }));
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [apply, fail, sessionId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  async function run(work: () => Promise<SessionState>) {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await work());
    } catch (err) {
      fail(err);
      try {
        apply(await api.getSession(state.session.id));
      } catch {
        // keep existing error
      }
    } finally {
      setBusy(false);
    }
  }

  function playUci(uci: string) {
    if (!state) return;
    void run(() => api.playMove(state.session.id, { uci, clientEventId: crypto.randomUUID() }));
  }

  function onManual(event: FormEvent) {
    event.preventDefault();
    if (!state || !manual.trim()) return;
    const value = manual.trim();
    const isUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(value);
    void run(() =>
      api.playMove(state.session.id, {
        uci: isUci ? value : undefined,
        san: isUci ? undefined : value,
        clientEventId: crypto.randomUUID(),
      }),
    );
    setManual('');
  }

  async function confirmStartNew() {
    setConfirmNew(false);
    setBusy(true);
    try {
      apply(await api.createSession({ force: true, lessonName: lessonName || undefined }));
      window.location.hash = '/learn';
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveOpening(event: FormEvent) {
    event.preventDefault();
    if (!state) return;
    setBusy(true);
    try {
      const opening = await api.saveOpening({
        sessionId: state.session.id,
        name: openingName,
        source: openingSource,
        notes: openingNotes,
      });
      setNameOpen(false);
      setNotice(`Saved named opening “${opening.name}”. Shared move history is unchanged.`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveLesson() {
    if (!state) return;
    try {
      apply(await api.updateSession(state.session.id, { lessonName: lessonName || null }));
      setNotice('Session lesson name saved.');
    } catch (err) {
      fail(err);
    }
  }

  if (loading) {
    return <div className="page"><div className="card">Loading board…</div></div>;
  }

  if (!state) {
    return (
      <div className="page">
        {error && <div className="banner error">{error}</div>}
        <div className="empty">
          Could not start a learning session. Start the local API, then refresh.
          <div className="controls">
            <button type="button" className="btn primary" onClick={() => void bootstrap()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const viewingHistory = state.session.ply < state.maxPly;

  return (
    <div className="page learn-page">
      {error && <div className="banner error">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}
      <div className="learn-layout">
        <div className="board-column">
          <div className="status-row">
            <span className="turn-pill">{state.game.statusText}</span>
            <p className="hint">Click an arrow or destination to play a known move.</p>
          </div>
          <ChessBoard
            fen={state.fen}
            lastMove={state.lastMove}
            inCheck={state.game.inCheck}
            turn={state.game.turn}
            disabled={busy || state.session.status !== 'active' || state.game.isGameOver}
            suggestions={state.suggestions}
            hoverUci={hoverUci}
            onHoverSuggestion={setHoverUci}
            onMove={playUci}
          />
          <SuggestionsPanel
            suggestions={state.suggestions}
            disabled={busy}
            hoverUci={hoverUci}
            onHover={setHoverUci}
            onPlay={playUci}
          />
          <form className="move-form" onSubmit={onManual}>
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="SAN or UCI — e4, Nf6, e2e4, e7e8q"
              aria-label="Enter move in SAN or UCI"
            />
            <button className="btn primary" type="submit" disabled={busy}>Play</button>
          </form>
          <div className="controls">
            <button className="btn" type="button" disabled={!state.canUndo || busy} onClick={() => void run(() => api.undo(state.session.id))}>
              Back / Undo
            </button>
            <button className="btn" type="button" disabled={!state.canRedo || busy} onClick={() => void run(() => api.redo(state.session.id))}>
              Redo
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => setConfirmNew(true)}>
              Restart board
            </button>
            <button className="btn primary" type="button" disabled={busy || state.session.ply === 0} onClick={() => setNameOpen(true)}>
              Name this line
            </button>
          </div>
          {viewingHistory && (
            <p className="hint" style={{ marginTop: 10 }}>
              You are browsing an earlier ply. Redo to return, or play another legal move to branch.
            </p>
          )}
        </div>
        <div className="side-column">
          <MoveHistory
            history={state.history}
            ply={state.session.ply}
            onGoto={(ply) => void run(() => api.gotoPly(state.session.id, ply))}
          />
          <section className="card session-card">
            <h2>Session #{state.session.id}</h2>
            <p className="hint">Ply {state.session.ply}</p>
            <div className="field">
              <label htmlFor="lesson">Lesson / source name</label>
              <input
                id="lesson"
                value={lessonName}
                onChange={(event) => setLessonName(event.target.value)}
                placeholder="Lotus Lesson 1"
              />
            </div>
            <div className="controls">
              <button className="btn" type="button" onClick={() => void saveLesson()}>Save lesson name</button>
              <button className="btn" type="button" onClick={() => setConfirmNew(true)}>New session</button>
            </div>
          </section>
        </div>
      </div>

      {confirmNew && (
        <Modal title="Start a new session?" onClose={() => setConfirmNew(false)}>
          <p>
            The board will return to the starting position. Saved observations, named openings, and
            encounter counts stay in the local library.
          </p>
          <div className="controls">
            <button className="btn" type="button" onClick={() => setConfirmNew(false)}>Keep this session</button>
            <button className="btn primary" type="button" onClick={() => void confirmStartNew()}>Start new session</button>
          </div>
        </Modal>
      )}

      {nameOpen && (
        <Modal title="Name this opening / lesson" onClose={() => setNameOpen(false)}>
          <p className="hint">
            This names the <strong>current observed line</strong>. Alternative continuations at the
            same positions remain available as suggestions and can belong to other named lessons.
          </p>
          <p className="pgn">{state.history.filter((move) => move.ply <= state.session.ply).map((move) => move.san).join(' ')}</p>
          <form onSubmit={(event) => void saveOpening(event)}>
            <div className="field">
              <label htmlFor="op-name">Opening name</label>
              <input id="op-name" value={openingName} onChange={(e) => setOpeningName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="op-source">Source / lesson</label>
              <input id="op-source" value={openingSource} onChange={(e) => setOpeningSource(e.target.value)} placeholder="Lotus Lesson 1" />
            </div>
            <div className="field">
              <label htmlFor="op-notes">Notes</label>
              <textarea id="op-notes" rows={3} value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} />
            </div>
            <div className="controls">
              <button className="btn" type="button" onClick={() => setNameOpen(false)}>Cancel</button>
              <button className="btn primary" type="submit">Save named opening</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
