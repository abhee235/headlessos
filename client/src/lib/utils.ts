// Utility: cn() — merge Tailwind classes with conflict resolution
// Used by all shadcn-style components

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
