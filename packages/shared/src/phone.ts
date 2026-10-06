/** Normalizes Kenyan mobile input (07.., 7.., 254.., +254..) to E.164, or null if invalid. */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  let national: string;
  if (/^254\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) national = digits;
  else return null;
  if (!/^[17]\d{8}$/.test(national)) return null;
  return `+254${national}`;
}

/** "+254712345312" -> "+254 7•• ••• 312" */
export function maskPhone(e164: string): string {
  const national = e164.replace(/^\+254/, '');
  return `+254 ${national.slice(0, 1)}•• ••• ${national.slice(-3)}`;
}

export function shortMaskPhone(e164: string): string {
  return `•••${e164.slice(-3)}`;
}
