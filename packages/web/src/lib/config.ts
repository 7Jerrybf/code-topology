export function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window !== 'undefined') return `ws://${window.location.hostname}:8765`;
  return 'ws://localhost:8765';
}
