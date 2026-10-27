import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { ApiError, api } from '../api';
import type { Opening, SessionState } from '../types';

type Props = {
  onPlayed: (state: SessionState) => void;
};

export function LibraryPage({ onPlayed }: Props) {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Opening | null>(null);
  const [deleting, setDeleting] = useState<Opening | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh(q = query) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listOpenings(q);
      setOpenings(data.openings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load openings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh('');
  }, []);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await refresh(query);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    try {
      await api.updateOpening(editing.id, {
        name: editing.name,
        source: editing.source ?? '',
        notes: editing.notes ?? '',
      });
      setEditing(null);
      setNotice('Opening updated.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.deleteOpening(deleting.id);
      setDeleting(null);
      setNotice('Named opening removed. Shared move observations were kept.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  async function play(opening: Opening) {
    if (!window.confirm('Replay this opening on the board? The current session will be closed. Saved library data is kept.')) {
      return;
    }
    try {
      const state = await api.playOpening(opening.id);
      onPlayed(state);
      window.location.hash = '/learn';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open this line');
    }
  }

  async function exportLibrary() {
    try {
      const data = await api.exportLibrary();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lotus-opening-library-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Backup downloaded. It contains openings, moves, sessions, and encounter history — no passwords.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    }
  }

  async function importLibrary(file: File) {
    setError(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError('That file is not valid JSON.');
        return;
      }
      const result = await api.importLibrary(payload);
      setNotice(`Import complete. Openings: ${result.summary.openings}, observations: ${result.summary.observations}.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const extra = Array.isArray(err.details) ? ` ${err.details.slice(0, 5).join(' ')}` : '';
        setError(`${err.message}.${extra}`);
        return;
      }
      setError('Import failed');
    }
  }

  return (
    <div className="page">
      {error && <div className="banner error">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}
      <section className="card">
        <h2>Opening library</h2>
        <p className="hint">
          Named lines point at a shared move tree. Deleting a name does not erase observed encounters.
        </p>
        <div className="library-toolbar">
          <form className="search" onSubmit={(event) => void onSearch(event)}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or source"
            />
          </form>
          <button className="btn" type="button" onClick={() => void exportLibrary()}>Export backup</button>
          <label className="btn">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importLibrary(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading && openings.length === 0 ? (
          <div className="empty">
            No named openings yet. Learn a line on the board, then use “Name this line”.
          </div>
        ) : (
          <div className="opening-list">
            {openings.map((opening) => (
              <article key={opening.id} className="card" style={{ boxShadow: 'none' }}>
                <h3>{opening.name}</h3>
                <p className="pgn">{opening.pgn || '(no moves)'}</p>
                <p className="meta">
                  {opening.source || 'No source'} · created {opening.createdAt} · updated {opening.updatedAt}
                </p>
                {opening.notes && <p>{opening.notes}</p>}
                <div className="controls">
                  <button className="btn primary" type="button" onClick={() => void play(opening)}>Replay on board</button>
                  <button className="btn" type="button" onClick={() => setEditing({ ...opening })}>Edit</button>
                  <button className="btn danger" type="button" onClick={() => setDeleting(opening)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <Modal title="Edit opening" onClose={() => setEditing(null)}>
          <form onSubmit={(event) => void saveEdit(event)}>
            <div className="field">
              <label>Name</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Source</label>
              <input value={editing.source ?? ''} onChange={(e) => setEditing({ ...editing, source: e.target.value })} />
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea rows={4} value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
            <div className="controls">
              <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" type="submit">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete named opening?" onClose={() => setDeleting(null)}>
          <p>
            “{deleting.name}” will be removed. Observed moves and encounter counts stay in the library
            because they may be shared with other lines.
          </p>
          <div className="controls">
            <button className="btn" type="button" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn danger" type="button" onClick={() => void confirmDelete()}>Delete name</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
