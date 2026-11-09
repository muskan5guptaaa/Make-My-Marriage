// Recognising wedding functions in what people type ("mehndi", "हल्दी", "the Sangeet").
// Used by the RSVP chat and photo search, so code (not the AI) decides which function is meant.

// Names people use for common functions. "Wedding" and "shaadi" are left out: "your wedding"
// usually means the whole event, not one function.
// Spellings in English letters, Hindi (Devanagari) and Tamil script.
export const FUNCTION_NAMES = [
  ['Haldi', 'haldi', 'pithi', 'हल्दी', 'ஹல்தி', 'மஞ்சள் நீராட்டு'],
  ['Mehendi', 'mehendi', 'mehndi', 'mehandi', 'henna', 'मेहंदी', 'मेंहदी', 'மெஹந்தி', 'மருதாணி'],
  ['Sangeet', 'sangeet', 'sangit', 'संगीत', 'சங்கீத்'],
  ['Reception', 'reception', 'रिसेप्शन', 'ரிசப்ஷன்', 'வரவேற்பு'],
  ['Cocktail', 'cocktail', 'कॉकटेल'],
  ['Engagement', 'engagement', 'roka', 'sagai', 'सगाई', 'रोका', 'நிச்சயதார்த்தம்'],
  ['Tilak', 'tilak', 'तिलक'],
];
export const GENERIC = /^(wedding|shaadi|shadi|vivah)$/i;

const escaped = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether `word` appears in `text` as a whole word, in any script and case.
export const said = (text, word) => new RegExp(`(^|[^\\p{L}\\p{M}])${escaped(word)}($|[^\\p{L}\\p{M}])`, 'iu').test(text);

// A function's own name plus the other names people use for it.
export const namesOf = (name) => {
  const family = FUNCTION_NAMES.find(([, ...aliases]) => aliases.some((a) => said(name, a)));
  return [name, ...(family ? family.slice(1) : [])];
};

export const nameList = (names) => (names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
