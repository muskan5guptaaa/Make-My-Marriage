import { useState } from 'react';

// Label + input + error message. A password field gets a Show/Hide button.
export default function Field({ id, label, error, hint, labelRight, type = 'text', ...input }) {
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        {labelRight}
      </div>
      <div className="input-wrap">
        <input
          id={id}
          type={isPassword && shown ? 'text' : type}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={isPassword ? 'has-toggle' : undefined}
          {...input}
        />
        {isPassword && (
          <button type="button" className="toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="field-error">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
