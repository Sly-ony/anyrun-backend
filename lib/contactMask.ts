const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
// 9 to 15 digits, optionally separated by spaces, dots, dashes or brackets.
const PHONE = /(?<!\d)(?:\+?\d[\s().-]?){9,15}(?!\d)/g;
const OFF_PLATFORM =
  /\b(pay\s+me\s+(directly|outside|in\s+cash|cash)|outside\s+(the\s+)?(app|platform|anyrun)|off\s*(the\s+)?(app|platform)|bank\s+transfer|paypal|cash\s*app|venmo|western\s+union|whatsapp|telegram|call\s+me|text\s+me)\b/i;

export interface MaskResult {
  text: string;
  masked: boolean; // contact details or links were replaced
  offPlatform: boolean; // mentions paying or talking outside the app
  warning: string | null;
}

export function maskContactInfo(input: string): MaskResult {
  let masked = false;
  const swap = (label: string) => () => {
    masked = true;
    return label;
  };
  const text = input
    .replace(EMAIL, swap("[email hidden]"))
    .replace(LINK, swap("[link hidden]"))
    .replace(PHONE, swap("[phone hidden]"));
  const offPlatform = OFF_PLATFORM.test(input);

  let warning: string | null = null;
  if (masked) {
    warning = "Contact details and links are hidden. Keep chat and payment inside Anyrun so you stay protected.";
  } else if (offPlatform) {
    warning = "For your protection, keep payment inside Anyrun. Payments made outside the app are not covered.";
  }
  return { text, masked, offPlatform, warning };
}