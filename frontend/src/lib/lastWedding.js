// Remembers which wedding to open after sign-in on this browser. Storage can be blocked,
// so every access is guarded and a miss just falls back to the first wedding.
const KEY = 'mmm:lastWedding';

export function getLastWedding() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastWedding(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
