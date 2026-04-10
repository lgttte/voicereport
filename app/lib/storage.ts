// ── VoiceReport — localStorage Storage Layer ──

import type { UserProfile, SavedReport, ChantierEntry, OfflineQueueItem, ReportSections } from "./types";

const KEYS = {
  USER: "voicereport_user",
  HISTORY: "voicereport_history",
  CHANTIERS: "voicereport_chantiers",
  LAST_CHANTIER: "voicereport_last_chantier",
  EMAIL: "lastRecipientEmail",
  OFFLINE_QUEUE: "voicereport_offline_queue",
} as const;

const MAX_HISTORY = 100;

// ── User Profile ──
export function loadUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveUser(user: UserProfile) {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
}

// ── Reports History ──
export function loadHistory(): SavedReport[] {
  try {
    const raw = localStorage.getItem(KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveToHistory(
  report: ReportSections,
  recipientEmail: string,
  extra?: Partial<Omit<SavedReport, "id" | "date" | "report" | "recipientEmail">>
): SavedReport {
  const history = loadHistory();
  const entry: SavedReport = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    report,
    recipientEmail,
    ...extra,
  };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
  return entry;
}

export function deleteFromHistory(id: string) {
  const history = loadHistory().filter(h => h.id !== id);
  localStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
}

export function clearHistory() {
  localStorage.removeItem(KEYS.HISTORY);
}

// ── Chantiers Registry ──
export function loadChantiers(): ChantierEntry[] {
  try {
    const raw = localStorage.getItem(KEYS.CHANTIERS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveChantiers(list: ChantierEntry[]) {
  localStorage.setItem(KEYS.CHANTIERS, JSON.stringify(list));
}

export function addOrUpdateChantier(name: string): ChantierEntry {
  const list = loadChantiers();
  const normalized = name.trim();
  const existing = list.find(c => c.name.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    existing.lastUsed = Date.now();
    saveChantiers(list);
    localStorage.setItem(KEYS.LAST_CHANTIER, existing.id);
    return existing;
  }
  const entry: ChantierEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: normalized,
    lastUsed: Date.now(),
  };
  list.unshift(entry);
  saveChantiers(list);
  localStorage.setItem(KEYS.LAST_CHANTIER, entry.id);
  return entry;
}

export function getLastChantierId(): string | null {
  return localStorage.getItem(KEYS.LAST_CHANTIER);
}

// ── Email ──
export function loadEmail(): string {
  return localStorage.getItem(KEYS.EMAIL) || "";
}

export function saveEmail(email: string) {
  localStorage.setItem(KEYS.EMAIL, email);
}

// ── Offline Queue ──
export function loadOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(KEYS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveOfflineQueue(queue: OfflineQueueItem[]) {
  localStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
}

// ── Utilities ──
export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
