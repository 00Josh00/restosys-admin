export const LIMA_TIMEZONE = 'America/Lima';

export function getLimaNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: LIMA_TIMEZONE }));
}

export function toLimaDate(date: Date | string | number): Date {
  const d = new Date(date);
  return new Date(d.toLocaleString('en-US', { timeZone: LIMA_TIMEZONE }));
}

export function formatInLima(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
  },
  locale = 'es-PE'
): string {
  const d = toLimaDate(date);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: LIMA_TIMEZONE }).format(d);
}

export function formatDateInLima(
  date: Date | string | number,
  locale = 'es-PE'
): string {
  return formatInLima(date, { dateStyle: 'short' }, locale);
}

export function formatTimeInLima(
  date: Date | string | number,
  locale = 'es-PE'
): string {
  return formatInLima(date, { timeStyle: 'short' }, locale);
}

export function formatDateTimeInLima(
  date: Date | string | number,
  locale = 'es-PE'
): string {
  return formatInLima(date, { dateStyle: 'short', timeStyle: 'short' }, locale);
}

export function startOfDayInLima(date: Date | string | number): Date {
  const lima = toLimaDate(date);
  lima.setHours(0, 0, 0, 0);
  return lima;
}

export function endOfDayInLima(date: Date | string | number): Date {
  const lima = toLimaDate(date);
  lima.setHours(23, 59, 59, 999);
  return lima;
}

export function toISOInLima(date: Date | string | number): string {
  return toLimaDate(date).toISOString();
}

export function createLimaDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date {
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  return new Date(date.toLocaleString('en-US', { timeZone: LIMA_TIMEZONE }));
}

export function getLimaOffsetMinutes(): number {
  const now = new Date();
  const lima = new Date(now.toLocaleString('en-US', { timeZone: LIMA_TIMEZONE }));
  return (now.getTime() - lima.getTime()) / 60000;
}