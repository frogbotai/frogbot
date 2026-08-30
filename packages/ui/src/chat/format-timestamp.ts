const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatMessageTimestamp(value: Date | number | string, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = now.getTime() - date.getTime();
  const withinWeek = elapsed >= 0 && elapsed < 7 * 24 * 60 * 60 * 1000;
  const formatter = withinWeek
    ? weekday
    : date.getFullYear() === now.getFullYear()
      ? monthDay
      : monthDayYear;

  return `${formatter.format(date)} ${time.format(date)}`;
}
