import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function kg(value: string | number = 0) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(value)); }
export function inr(value: string | number = 0) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value)); }
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function dateLabel(value: string) { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00+05:30` : value)); }
export function uid() { return crypto.randomUUID(); }
export function humanize(value: string) { return value.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase()); }
