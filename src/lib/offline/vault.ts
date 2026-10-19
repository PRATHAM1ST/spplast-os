import Dexie, { type Table } from 'dexie';
export interface LocalRow { id: string; user: string; kind: 'cache' | 'queue' | 'photo' | 'draft' | 'session'; iv: Uint8Array<ArrayBuffer>; encrypted: ArrayBuffer; state: 'pending' | 'synced' | 'conflict' | 'failed'; attempts: number; retryAt: number; error: string; updatedAt: number }
class LocalDB extends Dexie {
  rows!: Table<LocalRow>; keys!: Table<{ user: string; salt: Uint8Array<ArrayBuffer> }>;
  constructor() { super('spplast-local-v1'); this.version(1).stores({ rows: 'id,user,kind,state,[user+kind]', keys: 'user' }); }
}
export const local = new LocalDB();
let vaultKey: CryptoKey | null = null; let vaultUser = '';
export async function unlock(user: string, passphrase: string) {
  let salt = (await local.keys.get(user))?.salt;
  if (!salt) { salt = crypto.getRandomValues(new Uint8Array(16)); await local.keys.put({ user, salt }); }
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  vaultKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  vaultUser = user;
  try { const existing = await local.rows.get(`${user}:session`); if (existing) await open(existing); } catch { lock(); throw new Error('Incorrect device passphrase'); }
}
export function lock() { vaultKey = null; vaultUser = ''; }
export async function seal<T>(id: string, kind: LocalRow['kind'], data: T, state: LocalRow['state'] = 'pending') {
  if (!vaultKey) throw new Error('Unlock this device first');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${vaultUser}:${id}`) }, vaultKey, new TextEncoder().encode(JSON.stringify(data)));
  const row: LocalRow = { id, user: vaultUser, kind, iv, encrypted, state, attempts: 0, retryAt: 0, error: '', updatedAt: Date.now() };
  await local.rows.put(row); return row;
}
export async function open<T>(row: LocalRow): Promise<T> {
  if (!vaultKey || row.user !== vaultUser) throw new Error('Device is locked');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv, additionalData: new TextEncoder().encode(`${vaultUser}:${row.id}`) }, vaultKey, row.encrypted);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
export async function read<T>(id: string) { const row = await local.rows.get(id); return row ? open<T>(row) : null; }
export async function purge(user: string) { await local.rows.where('user').equals(user).delete(); await local.keys.delete(user); lock(); }
export async function fileData(file: Blob) { const bytes = new Uint8Array(await file.arrayBuffer()); let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte); return btoa(raw); }
export function dataFile(data: string, type: string) { return new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type }); }
