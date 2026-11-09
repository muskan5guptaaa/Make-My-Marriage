// The few RSVP chat replies that code writes itself (when the AI's reply would mislead), in the
// guest's language. The language is read from the script of their latest message: Devanagari is
// answered in Hindi, Tamil script in Tamil, anything else in English. (The AI writes every other
// reply, and is told to answer in the guest's own language.)
// Hindi and Tamil wording: please have a native speaker check before relying on it.

export function languageOf(text = '') {
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Tamil}/u.test(text)) return 'ta';
  return 'en';
}

const AND = { en: 'and', hi: 'और', ta: 'மற்றும்' };
export const listIn = (lang, names) => (names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} ${AND[lang]} ${names.at(-1)}`);

export const WORDS = {
  en: {
    notInvited: (names, many) => `${names} ${many ? "aren't" : "isn't"} on your invitation, so please check with the couple about ${many ? 'them' : 'it'}.`,
    restFilled: "I've filled in the rest below. Please check it and press Save.",
    invitedTo: (names, many) => `You're invited to ${names}. Would you like to answer for ${many ? 'those' : 'it'}?`,
    understood: "Here's what I understood. Please check it and press Save.",
    needMore: 'Sorry, I need a little more. Which function do you mean, and how many of you are coming?',
    tooMany: (fn, n) => `Your invitation for the ${fn} is for up to ${n} ${n === 1 ? 'person' : 'people'}, so it says ${n}. Please check with the couple about more.`,
  },
  hi: {
    notInvited: (names, many) => `${names} आपके निमंत्रण में ${many ? 'नहीं हैं' : 'नहीं है'}, इसलिए कृपया ${many ? 'इनके' : 'इसके'} बारे में दूल्हा-दुल्हन से पूछ लें।`,
    restFilled: 'बाकी जवाब मैंने नीचे भर दिए हैं। कृपया जाँचकर Save दबाएँ।',
    invitedTo: (names, many) => `आपको ${names} का निमंत्रण है। क्या आप ${many ? 'इनके' : 'इसके'} लिए जवाब देना चाहेंगे?`,
    understood: 'मैंने यह समझा है। कृपया जाँचकर Save दबाएँ।',
    needMore: 'माफ़ कीजिए, थोड़ी और जानकारी चाहिए। आप किस समारोह की बात कर रहे हैं, और कितने लोग आ रहे हैं?',
    tooMany: (fn, n) => `${fn} के लिए आपका निमंत्रण ज़्यादा से ज़्यादा ${n} ${n === 1 ? 'व्यक्ति' : 'लोगों'} के लिए है, इसलिए ${n} लिखा गया है। ज़्यादा लोगों के लिए कृपया दूल्हा-दुल्हन से पूछें।`,
  },
  ta: {
    notInvited: (names, many) => `${names} உங்கள் அழைப்பில் இல்லை, ${many ? 'அவற்றைப்' : 'அதைப்'} பற்றி மணமக்களிடம் கேளுங்கள்.`,
    restFilled: 'மீதமுள்ள பதில்களைக் கீழே நிரப்பியுள்ளேன். சரிபார்த்து Save அழுத்தவும்.',
    invitedTo: (names, many) => `நீங்கள் ${names} நிகழ்ச்சிக்கு அழைக்கப்பட்டுள்ளீர்கள். ${many ? 'அவற்றுக்கு' : 'அதற்கு'} பதில் சொல்ல விரும்புகிறீர்களா?`,
    understood: 'நான் புரிந்துகொண்டது இதுதான். சரிபார்த்து Save அழுத்தவும்.',
    needMore: 'மன்னிக்கவும், இன்னும் கொஞ்சம் விவரம் தேவை. எந்த நிகழ்ச்சி, எத்தனை பேர் வருகிறீர்கள்?',
    tooMany: (fn, n) => `${fn} நிகழ்ச்சிக்கான உங்கள் அழைப்பு அதிகபட்சம் ${n} பேருக்கு மட்டும், அதனால் ${n} என்று உள்ளது. அதிகமானவர்களுக்கு மணமக்களிடம் கேளுங்கள்.`,
  },
};

// Replies that talk as if an answer is already recorded, in each language. Only Save records one.
export const SOUNDS_RECORDED = [
  /\b(got you down|put you down|saved|noted|recorded|confirmed|all set)\b/i,
  /(दर्ज कर|सेव कर|नोट कर|सहेज)/u,
  /(பதிவு செய்த|சேமித்த|குறித்துக்கொண்ட)/u,
];
