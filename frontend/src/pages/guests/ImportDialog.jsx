import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';

const HEADER = 'Name,Phone,Email,Side,Group,Functions,Plus ones';

// Upload a CSV of guests. If any row has a problem, nothing is imported and every problem is listed.
export default function ImportDialog({ functions, onClose, onImported }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // A starter file with this wedding's function names already in it.
  function downloadTemplate() {
    const names = functions.map((f) => f.name);
    const example = `Priya Mehta,+91 98765 43210,priya@email.com,Bride,Friends,"${names.slice(0, 2).join('; ') || 'Sangeet'}",2`;
    const blob = new Blob([`${HEADER}\n${example}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guests-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setRows([]);
    setResult(null);
    try {
      const res = await api.importGuests(wedding._id, await file.text());
      setResult(res);
      onImported();
    } catch (err) {
      setError(err.message);
      setRows(err.fields?.rows ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="modal wide" onClose={onClose} aria-labelledby="import-title">
      <form onSubmit={onSubmit} noValidate>
        <div className="modal-head">
          <h2 id="import-title">Import guests from CSV</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          {result ? (
            <div className="notice" role="status">
              Imported {result.created} guest{result.created === 1 ? '' : 's'}.
              {result.skipped > 0 && ` Skipped ${result.skipped} already on your list (same name and phone or email).`} Each one has a private
              link, shown when you open them.
            </div>
          ) : (
            <>
              <p className="muted">
                Save your spreadsheet as CSV with these columns. Only <b>Name</b> is required. Put several functions in one cell
                separated by semicolons.
              </p>
              <pre className="code">{HEADER}</pre>
              <ul className="muted small import-tips">
                <li>Side: Bride, Groom or Both (blank means Both).</li>
                <li>Group: Family, Friends, Colleagues or Other.</li>
                <li>
                  Functions must match names in this wedding
                  {functions.length ? `: ${functions.map((f) => f.name).join(', ')}.` : '. Add functions first.'}
                </li>
                <li>Guests already on your list with the same name and phone or email are skipped.</li>
              </ul>
              <button type="button" className="link-button small" onClick={downloadTemplate}>Download a template</button>

              <div className="field file-field">
                <label htmlFor="csv-file">CSV file</label>
                <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>

              {error && <div className="alert" role="alert">{error}</div>}
              {rows.length > 0 && (
                <div className="table-scroll import-errors">
                  <table className="guest-table">
                    <thead>
                      <tr>
                        <th scope="col" className="num">Row</th>
                        <th scope="col">Name</th>
                        <th scope="col">Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.row}>
                          <td className="num mono">{r.row}</td>
                          <td>{r.name ?? '—'}</td>
                          <td className="muted-cell">{r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
            {!result && (
              <button type="submit" className="btn btn-primary inline" disabled={!file || busy}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            )}
          </span>
        </div>
      </form>
    </dialog>
  );
}
