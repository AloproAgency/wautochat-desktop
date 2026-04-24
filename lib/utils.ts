import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { parsePhoneNumberFromString, getCountryCallingCode, type CountryCode } from "libphonenumber-js";

/** Group digits by 2 (e.g. "57222777" → "57 22 27 77") for readability. */
function groupByPairs(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/**
 * Format a raw WhatsApp phone number into a human-readable international form:
 *   22957222777  →  +229 57 22 27 77
 *   33612345678  →  +33 6 12 34 56 78
 *
 * Uses libphonenumber-js to detect the country calling code (1–3 digits,
 * not easy to guess manually). Some valid numbers from newer numbering plans
 * (Benin 2021, etc.) are marked "invalid" by libphonenumber but the country
 * detection still works — we fall back on isPossible() and manual grouping.
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = (phone || "").replace(/\D/g, "");
  if (!cleaned) return phone;

  try {
    const parsed = parsePhoneNumberFromString("+" + cleaned);
    if (parsed && parsed.country) {
      const cc = getCountryCallingCode(parsed.country as CountryCode);
      const national = cleaned.slice(cc.length);
      return `+${cc} ${groupByPairs(national)}`;
    }
    if (parsed && parsed.countryCallingCode) {
      const cc = parsed.countryCallingCode;
      const national = cleaned.slice(cc.length);
      return `+${cc} ${groupByPairs(national)}`;
    }
  } catch {
    // fall through
  }

  // Very short numbers (< 5 digits) — just prefix
  if (cleaned.length < 5) return "+" + cleaned;
  // Last resort: assume a 2-digit country code
  return `+${cleaned.slice(0, 2)} ${groupByPairs(cleaned.slice(2))}`;
}

export function formatTimestamp(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Hier";
  if (days < 7) {
    return d.toLocaleDateString("fr-FR", { weekday: "long" });
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function wppIdToNumber(wid: string): string {
  return wid.replace(/@c\.us|@g\.us|@s\.whatsapp\.net/g, "");
}

export function numberToWppId(number: string, isGroup = false): string {
  const cleaned = number.replace(/\D/g, "");
  return `${cleaned}@${isGroup ? "g.us" : "c.us"}`;
}
