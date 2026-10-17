export function chronological<T extends { starts_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}