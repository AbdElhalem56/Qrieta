import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale: 'ar-EG' | 'en-US' = 'ar-EG') {
  if (locale === 'ar-EG') {
    return `${amount.toLocaleString('ar-EG')} جـ`;
  }
  return `${amount.toLocaleString('en-US')} LE`;
}
