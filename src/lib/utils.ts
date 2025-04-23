import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateShortId(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, length);
}
