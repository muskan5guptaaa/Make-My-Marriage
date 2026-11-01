import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';

const MAX_SIDE = 1600; // px; keeps a phone photo readable and well under the upload limit

// A photo shrunk and re-saved as JPEG, as { mimeType, data } with data in base64.
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// The kept rows as the CSV the normal import reads, so it checks them exactly as a file.
function toCsv(rows) {
  const lines = rows.map((r) => [r.name, r.phone, r.side, r.groupTag, r.functions.join('; '), r.plusOnesAllowed].map(cell).join(','));
  return ['Name,Phone,Side,Group,Functions,Plus ones', ...lines].join('\n');
}

// Paste a WhatsApp list or choose a photo of a handwritten one; the AI fills in a table to check.
export default function SmartImportDialog({ onClose, onImported }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [rows, setRows] = useState(null); // null until the list is read
  const [functions, setFunctions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const edit = (i, change) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...change, problem: '' } : r)));
  const kept = rows?.filter((r) => r.keep) ?? [];

  async function read() {
    setBusy(true);
    setError('');
    try {
      let body;
      if (photo) {
        try {
          body = { image: await shrinkPhoto(photo) };
        } catch {
          throw new Error("Couldn't open that photo. Use a JPEG or PNG.");
        }
      } else {
        body = { text };
      }
      const res = await api.extractGuests(wedding._id, body);
      setFunctions(res.meta.functions);
      setRows(res.data.map((r) => ({ ...r, phone: r.phone ?? '', keep: !r.existing, problem: '' })));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      setResult(await api.importGuests(wedding._id, toCsv(kept)));
      onImported();
    } catch (err) {
      setError(err.message);
      // The import numbers rows from 2 (row 1 is the header); match them back to the kept rows.
      const problems = new Map((err.fields?.rows ?? []).map((p) => [p.row - 2, p.message]));
      let k = -1;
      setRows((list) => list.map((r) => (r.keep ? { ...r, problem: problems.get(++k) ?? '' } : r)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="modal wide" onClose={onClose} aria-labelledby="smart-import-title">
      <form onSubmit={(e) => { e.preventDefault(); if (rows) save(); else read(); }} noValidate>
        <div className="modal-head">
          <h2 id="smart-import-title">Import guests with AI</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {result ? (
            <div className="notice" role="status">
              Added {result.created} guest{result.created === 1 ? '' : 's'}.
              {result.skipped > 0 && ` Skipped ${result.skipped} already on your list.`} Each one has a private link, shown when you open them.
            </div>
          ) : rows === null ? (
            <>
              <p className="muted">
                Paste a guest list from WhatsApp or your notes, or choose a photo of a handwritten list. You check every guest before anything is added.
              </p>
              {photo ? (
                <div className="smart-photo">
                  <p>Photo: <b>{photo.name}</b> <button type="button" className="link-button small" onClick={() => setPhoto(null)}>Remove</button></p>
                  <p className="muted small">The whole photo is sent to Google’s free Gemini AI, including any phone numbers written in it.</p>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="smart-text">Guest list</label>
                    <textarea
                      id="smart-text"
                      rows={8}
                      maxLength={20000}
                      placeholder={'Bride side\n1. Priya Mehta 98765 43210 +2\n2. Kabir Singh (Sangeet only)'}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <p className="muted small">Phone numbers are hidden from the AI and put back here afterwards.</p>
                  </div>
                  <div className="field file-field">
                    <label htmlFor="smart-photo">Or a photo of the list</label>
                    <input id="smart-photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                  </div>
                </>
              )}
            </>
          ) : rows.length === 0 ? (
            <p className="muted" role="status">No guests found in that list. Start over and try pasting it as text.</p>
          ) : (
            <>
              <p className="muted small" role="status">
                Found {rows.length} guest{rows.length === 1 ? '' : 's'}. Fix anything that looks wrong and untick anyone you don’t want to add.
              </p>
              <ul className="plan-list">
                {rows.map((r, i) => (
                  <li key={i} className={r.keep ? 'plan-row' : 'plan-row dropped'}>
                    <input type="checkbox" aria-label={`Add ${r.name}`} checked={r.keep} onChange={(e) => edit(i, { keep: e.target.checked })} />
                    <div className="plan-main smart-fields">
                      <div className="smart-line">
                        <input aria-label="Name" value={r.name} maxLength={100} onChange={(e) => edit(i, { name: e.target.value })} />
                        <input
                          aria-label={`Phone for ${r.name}`}
                          aria-invalid={!r.phoneOk || undefined}
                          value={r.phone}
                          placeholder="No phone"
                          onChange={(e) => edit(i, { phone: e.target.value, phoneOk: true })}
                        />
                        <input
                          type="number"
                          min={0}
                          max={10}
                          aria-label={`Plus ones for ${r.name}`}
                          placeholder="+0"
                          value={r.plusOnesAllowed ?? ''}
                          onChange={(e) => edit(i, { plusOnesAllowed: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </div>
                      <div className="smart-line">
                        <select aria-label={`Side for ${r.name}`} value={r.side ?? ''} onChange={(e) => edit(i, { side: e.target.value || null })}>
                          <option value="">Both sides</option>
                          <option value="bride">Bride side</option>
                          <option value="groom">Groom side</option>
                        </select>
                        <select aria-label={`Group for ${r.name}`} value={r.groupTag ?? ''} onChange={(e) => edit(i, { groupTag: e.target.value || null })}>
                          <option value="">Other</option>
                          <option value="family">Family</option>
                          <option value="friends">Friends</option>
                          <option value="colleagues">Colleagues</option>
                        </select>
                        {functions.map((name) => {
                          const on = r.functions.includes(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              className="chip"
                              aria-pressed={on}
                              aria-label={`${name} for ${r.name}`}
                              onClick={() => edit(i, { functions: on ? r.functions.filter((f) => f !== name) : [...r.functions, name] })}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                      {r.existing && <p className="task-fn">Already on your guest list</p>}
                      {!r.phoneOk && <p className="field-error">Check this phone number, or clear it.</p>}
                      {r.problem && <p className="field-error" role="alert">{r.problem}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <div className="alert" role="alert">{error}</div>}
        </div>

        <div className="modal-foot">
          {rows && !result && (
            <button type="button" className="link-button small" onClick={() => setRows(null)} disabled={busy}>Start over</button>
          )}
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
            {!result && rows === null && (
              <button type="submit" className="btn btn-primary inline" disabled={busy || (!photo && !text.trim())}>
                {busy ? 'Reading…' : 'Read the list'}
              </button>
            )}
            {!result && rows?.length > 0 && (
              <button type="submit" className="btn btn-primary inline" disabled={busy || kept.length === 0}>
                {busy ? 'Adding…' : `Add ${kept.length} guest${kept.length === 1 ? '' : 's'}`}
              </button>
            )}
          </span>
        </div>
      </form>
    </dialog>
  );
}
