export function money(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}Rs ${Math.abs(Math.round(value)).toLocaleString('en-IN')}`
}

export function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
