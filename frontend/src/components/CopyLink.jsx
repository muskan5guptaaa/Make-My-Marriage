import { useRef, useState } from 'react';

// A read-only link with a Copy button. If the clipboard is blocked, the text is selected
// so it can be copied by hand.
export default function CopyLink({ url, label = 'Link' }) {
  const input = useRef(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      input.current?.select();
    }
  }

  return (
    <div className="copy-link">
      <input ref={input} readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-outline inline sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
