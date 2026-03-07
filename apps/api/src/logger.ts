export function logEvent(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...payload
  }));
}
