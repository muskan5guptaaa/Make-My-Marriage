// One format for every phone number: "+<country code><number>", e.g. +918707463461.
// Indian mobiles may be typed without +91 (10 digits starting 6-9, or with a leading 0 or 91);
// other countries need their + code. Returns null when the number can't be understood.
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  const indian = (ten) => (/^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null);

  if (raw.startsWith('+')) {
    if (digits.startsWith('91')) return indian(digits.slice(2));
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return indian(digits);
  if (digits.length === 11 && digits.startsWith('0')) return indian(digits.slice(1));
  if (digits.length === 12 && digits.startsWith('91')) return indian(digits.slice(2));
  if (digits.length === 14 && digits.startsWith('0091')) return indian(digits.slice(4));
  return null;
}

export const PHONE_MESSAGE = 'Enter a 10-digit Indian mobile number, or include the country code, like +44 7700 900123.';
