import { getApiBaseUrl, getSessionToken } from './api';

export type LiveEventHandler = (payload: unknown) => void;

const listeners = new Map<string, Set<LiveEventHandler>>();
let connected = false;

/**
 * Live-update socket helper for the patient app (always routed via the gateway).
 * Real-time queue and journey events arrive in Sprint 2 (KAN-27).
 */
export function connectRealtime(): { url: string; hasToken: boolean } {
  connected = true;
  return {
    url: getApiBaseUrl(),
    hasToken: Boolean(getSessionToken()),
  };
}

export function disconnectRealtime(): void {
  connected = false;
  listeners.clear();
}

export function isRealtimeConnected(): boolean {
  return connected;
}

export function onRealtimeEvent(event: string, handler: LiveEventHandler): () => void {
  const set = listeners.get(event) ?? new Set<LiveEventHandler>();
  set.add(handler);
  listeners.set(event, set);
  return () => {
    set.delete(handler);
  };
}
