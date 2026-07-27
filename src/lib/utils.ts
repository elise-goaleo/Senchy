import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extrait le nom de ville d'une adresse "Ville, Région, Pays" → "Ville". */
export function cityName(s: string | null | undefined): string {
  return (s ?? "").split(",")[0].trim()
}

/** Format a duration in minutes as "X h Y min" (e.g. 180 → "3 h", 95 → "1 h 35 min", 45 → "45 min"). */
export function formatDuration(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
