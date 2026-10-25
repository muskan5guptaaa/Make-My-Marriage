// Renders an assistant answer: short paragraphs and lists, **bold**, and citations such as
// [G3] or [G3, F1] shown as numbers that match the Sources list under the answer.
const TOKEN = /(\*\*[^*]+\*\*)|\[([FGTEBA]\d+(?:\s*,\s*[FGTEBA]\d+)*)\]/g;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

function inline(text, numberOf) {
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      nodes.push(<strong key={m.index}>{m[1].slice(2, -2)}</strong>);
    } else {
      const numbers = [...new Set(m[2].split(/\s*,\s*/).map(numberOf).filter(Boolean))];
      if (numbers.length) nodes.push(<sup key={m.index} className="cite">{numbers.join(', ')}</sup>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Answer({ text, sources, streaming }) {
  const numberOf = (ref) => {
    const i = sources.findIndex((s) => s.ref === ref);
    return i === -1 ? null : i + 1;
  };
  // While it is still arriving, hide a citation that is only half written ("[G1").
  const shown = streaming ? text.replace(/\[[FGTEBA0-9,\s]*$/, '') : text;

  const blocks = [];
  for (const raw of shown.split('\n')) {
    const line = raw.replace(/^#+\s*/, '');
    if (!line.trim()) continue;
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '');
      if (blocks.at(-1)?.list) blocks.at(-1).items.push(item);
      else blocks.push({ list: true, items: [item] });
    } else {
      blocks.push({ list: false, text: line });
    }
  }

  return (
    <div className="answer-text">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i}>{b.items.map((item, j) => <li key={j}>{inline(item, numberOf)}</li>)}</ul>
        ) : (
          <p key={i}>{inline(b.text, numberOf)}</p>
        ),
      )}
      {streaming && <span className="typing" aria-hidden="true" />}
    </div>
  );
}
