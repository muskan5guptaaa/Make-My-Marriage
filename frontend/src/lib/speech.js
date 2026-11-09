// Speech in the browser, free: speech to text (Web Speech API, in Chrome and Edge) and reading a
// reply aloud (speech synthesis, in most browsers). Nothing here talks to our server.

export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ta-IN', label: 'தமிழ்' },
];

export const Recognition = () => (typeof window === 'undefined' ? undefined : window.SpeechRecognition || window.webkitSpeechRecognition);
export const canListen = () => Boolean(Recognition());
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

// The guest's own language as the default, if it's one we offer.
export function defaultVoiceLanguage() {
  const wanted = (typeof navigator !== 'undefined' && navigator.language) || 'en-IN';
  return VOICE_LANGUAGES.find((l) => l.code.slice(0, 2) === wanted.slice(0, 2))?.code ?? 'en-IN';
}

// The language to read a text in, from its script.
export function languageOfText(text = '') {
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi-IN';
  if (/\p{Script=Tamil}/u.test(text)) return 'ta-IN';
  return 'en-IN';
}

const SPEECH_ERRORS = {
  'not-allowed': 'Allow the microphone for this page (the icon in the address bar), then try again.',
  'service-not-allowed': 'Allow the microphone for this page (the icon in the address bar), then try again.',
  'no-speech': "I didn't hear anything. Tap the microphone and speak again.",
  'audio-capture': 'No microphone was found.',
  network: 'Speech needs an internet connection. You can type instead.',
};
export const speechErrorMessage = (code) => SPEECH_ERRORS[code] ?? 'Speaking didn’t work this time. You can type instead.';

/**
 * Listens once, in `lang`. onText(final) is called with the words heard; onInterim(words) while
 * speaking; onEnd() when it stops; onError(message). Returns a stop function.
 */
export function listen(lang, { onText, onInterim, onEnd, onError }) {
  const Rec = Recognition();
  const rec = new Rec();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let final = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const piece = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += piece;
      else interim += piece;
    }
    onInterim?.(interim);
    if (final.trim()) onText(final.trim());
  };
  rec.onerror = (e) => onError?.(speechErrorMessage(e.error));
  rec.onend = () => onEnd?.();
  rec.start();
  return () => rec.stop();
}

/**
 * Reads `text` aloud in its language. Returns false when this device has no voice for it (then
 * nothing is read, rather than reading Hindi or Tamil with an English voice).
 */
export function speak(text, lang = languageOfText(text)) {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.slice(0, 2) === lang.slice(0, 2));
  if (!voice && lang !== 'en-IN') return false;
  const u = new window.SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  synth.cancel();
  synth.speak(u);
  return true;
}
