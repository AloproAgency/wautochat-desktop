import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return phone;
  // WhatsApp IDs are always international numbers without "+"
  // Simply format as +{code} XX XX XX XX...
  const rest = cleaned;
  const grouped = rest.replace(/(\d{2})(?=\d)/g, "$1 ");
  return `+${grouped}`;
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
