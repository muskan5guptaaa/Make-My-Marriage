import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

const HOW = {
  ai: (m) => `Picked by AI: ${m.reason}`,
  you: () => 'Picked by you',
  size: () => 'The largest shot, for now. Ask the AI to pick the best, or choose one yourself.',
};

// One album's look-alike shots, grouped into moments (by code, free), each with its best shot.
// The AI picks the best of a group only when asked (one request); the couple can always choose.
export default function Moments({ weddingId, album, canEdit, onChanged }) {
  const [data, setData] = useState(null); // { groups, total, grouped, waitingForHash }
  const [busy, setBusy] = useState(null); // a group key
  const [errors, setErrors] = useState({}); // group key → message
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      let res = await api.listMoments(weddingId, album._id);
      setData(res);
      // Photos uploaded before moments existed get their fingerprint a few at a time.
      while (res.waitingForHash > 0) {
        res = await api.listMoments(weddingId, album._id);
        setData(res);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [weddingId, album._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key, work) {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: '' }));
    try {
      const res = await work();
      setData((d) => ({ ...d, groups: d.groups.map((g) => (g.key === key ? res.moment : g)) }));
      if (res.hidden) onChanged();
    } catch (err) {
      if (err.code === 'moment_changed') await load();
      setErrors((e) => ({
        ...e,
        [key]: err.code === 'ai_daily_limit' ? 'Today’s free AI allowance is used up. Choose the best yourself, or ask again tomorrow.' : err.message,
      }));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <div className="alert" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Finding look-alike shots…</p>;
  if (data.groups.length === 0) {
    return (
      <p className="muted small" role="status">
        {data.waitingForHash > 0 ? 'Checking the photos…' : `No look-alike shots in ${album.name}: each of the ${data.total} photos is a different moment.`}
      </p>
    );
  }

  return (
    <section className="moments" aria-label="Moments">
      <p className="muted small" role="status">
        {data.grouped} of {data.total} photos are look-alike shots of {data.groups.length} moment{data.groups.length === 1 ? '' : 's'}.
        Found by comparing how the photos look: no face data. Hidden photos stay in the album for you.
      </p>
      <ul className="moment-list">
        {data.groups.map((m, i) => {
          const best = m.photos.find((p) => p._id === m.best);
          const others = m.photos.filter((p) => p._id !== m.best);
          const visibleOthers = others.filter((p) => !p.hidden).length;
          return (
            <li key={m.key} className="card moment" aria-label={`Moment ${i + 1}`}>
              <div className="moment-best">
                <img src={best.thumbUrl} alt={best.caption ?? `Best shot of moment ${i + 1}`} />
                <span className="photo-badge mono">Best shot</span>
              </div>
              <div className="moment-main">
                <p className="moment-how">{HOW[m.by](m)}</p>
                {best.caption && <p className="muted small">{best.caption}</p>}
                <ul className="moment-others">
                  {others.map((p, j) => (
                    <li key={p._id} className={p.hidden ? 'is-hidden' : undefined}>
                      <img src={p.thumbUrl} alt={p.caption ?? `Other shot ${j + 1}`} />
                      {p.hidden && <span className="photo-badge mono">Hidden</span>}
                      {canEdit && (
                        <button type="button" className="link-button small" disabled={busy !== null} onClick={() => run(m.key, () => api.chooseMoment(weddingId, album._id, m.key, p._id))}>
                          Use this one
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {errors[m.key] && <p className="field-error" role="alert">{errors[m.key]}</p>}
                {canEdit && (
                  <div className="row-actions">
                    {m.by !== 'ai' && (
                      <button type="button" className="btn btn-outline inline sm" disabled={busy !== null} onClick={() => run(m.key, () => api.pickMoment(weddingId, album._id, m.key))}>
                        {busy === m.key ? 'Looking…' : 'Ask AI to pick the best'}
                      </button>
                    )}
                    {visibleOthers > 0 && (
                      <button type="button" className="btn btn-outline inline sm" disabled={busy !== null} onClick={() => run(m.key, () => api.hideMomentRest(weddingId, album._id, m.key))}>
                        Hide the other {visibleOthers} from guests
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
