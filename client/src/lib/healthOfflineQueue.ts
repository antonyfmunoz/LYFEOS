import { getBrowserTimeZone } from "./utils";

const DATABASE_NAME = "lyfeos-health-mutations";
const DATABASE_VERSION = 1;
const STORE_NAME = "pending";

type QueueStatus = "pending" | "failed";
type HealthMutationRecord = {
  id: string;
  userId: number;
  url: string;
  method: "POST";
  body: unknown;
  createdAt: string;
  status: QueueStatus;
  lastError?: string;
};

export type HealthMutationQueueItem = {
  id: string;
  recordType: "nutrition" | "workout" | "sleep" | "recovery" | "health";
  createdAt: string;
  status: QueueStatus;
  lastError: string | null;
};

export type HealthMutationResult<T> =
  | { queued: true; mutationId: string }
  | { queued: false; mutationId: string; data: T };

export type HealthOfflineStorageErrorCode = "unavailable" | "quota" | "blocked" | "operation_failed";

export class HealthOfflineStorageError extends Error {
  constructor(public readonly code: HealthOfflineStorageErrorCode, message: string) {
    super(message);
    this.name = "HealthOfflineStorageError";
  }
}

export function offlineHealthStorageError(error: unknown, fallback: HealthOfflineStorageErrorCode = "operation_failed"): HealthOfflineStorageError {
  if (error instanceof HealthOfflineStorageError) return error;
  const name = typeof error === "object" && error && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "QuotaExceededError") return new HealthOfflineStorageError("quota", "This device is out of private offline storage. This record was not saved; keep the form open, free device storage, or reconnect and try again.");
  if (["SecurityError", "InvalidStateError", "NotSupportedError"].includes(name)) return new HealthOfflineStorageError("unavailable", "Private offline storage is unavailable in this browser. This record was not saved; stay online or keep the form open and try again.");
  if (name === "VersionError" || name === "BlockedError") return new HealthOfflineStorageError("blocked", "Private offline storage could not be opened because another LyfeOS session is blocking it. This record was not saved; close other LyfeOS tabs and try again.");
  return new HealthOfflineStorageError(fallback, "Private offline storage failed. This record was not saved; keep the form open and try again.");
}

function mutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `health_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(offlineHealthStorageError({ name: "NotSupportedError" }, "unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains("userId")) store.createIndex("userId", "userId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(offlineHealthStorageError(request.error, "unavailable"));
    request.onblocked = () => reject(offlineHealthStorageError({ name: "BlockedError" }, "blocked"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let result!: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(offlineHealthStorageError(request.error));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(offlineHealthStorageError(transaction.error));
      transaction.onerror = () => reject(offlineHealthStorageError(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function put(record: HealthMutationRecord): Promise<void> {
  await withStore("readwrite", (store) => store.put(record));
}

async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

async function recordsForUser(userId: number): Promise<HealthMutationRecord[]> {
  const records = await withStore<HealthMutationRecord[]>("readonly", (store) => store.index("userId").getAll(userId));
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function send<T>(record: HealthMutationRecord): Promise<T> {
  const response = await fetch(record.url, {
    method: record.method,
    headers: { "Content-Type": "application/json", "x-lyfeos-mutation-id": record.id, "x-lyfeos-time-zone": getBrowserTimeZone(), "x-lyfeos-utc-offset-minutes": String(-new Date().getTimezoneOffset()) },
    credentials: "include",
    body: JSON.stringify(record.body),
  });
  if (!response.ok) {
    const detail = (await response.text()) || response.statusText;
    throw Object.assign(new Error(`${response.status}: ${detail}`), { status: response.status });
  }
  return await response.json() as T;
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === "NetworkError");
}

export async function submitHealthMutation<T>(input: { userId: number; url: string; body: unknown }): Promise<HealthMutationResult<T>> {
  const record: HealthMutationRecord = { id: mutationId(), userId: input.userId, url: input.url, method: "POST", body: input.body, createdAt: new Date().toISOString(), status: "pending" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await put(record);
    return { queued: true, mutationId: record.id };
  }
  try {
    return { queued: false, mutationId: record.id, data: await send<T>(record) };
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    await put(record);
    return { queued: true, mutationId: record.id };
  }
}

export async function flushHealthMutationQueue(userId: number): Promise<{ sent: number; pending: number; failed: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { sent: 0, pending: (await recordsForUser(userId)).filter((record) => record.status === "pending").length, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const record of await recordsForUser(userId)) {
    if (record.status === "failed") { failed += 1; continue; }
    try {
      await send(record);
      await remove(record.id);
      sent += 1;
    } catch (error) {
      if (isNetworkFailure(error)) break;
      const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 0;
      if (status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) break;
      await put({ ...record, status: "failed", lastError: status ? `The server rejected this queued record (${status}).` : "The server rejected this queued record." });
      failed += 1;
    }
  }
  const remaining = await recordsForUser(userId);
  return { sent, pending: remaining.filter((record) => record.status === "pending").length, failed: Math.max(failed, remaining.filter((record) => record.status === "failed").length) };
}

export async function countHealthMutationQueue(userId: number): Promise<{ pending: number; failed: number }> {
  const records = await recordsForUser(userId);
  return { pending: records.filter((record) => record.status === "pending").length, failed: records.filter((record) => record.status === "failed").length };
}

export async function listHealthMutationQueue(userId: number): Promise<HealthMutationQueueItem[]> {
  return (await recordsForUser(userId)).map((record) => ({
    id: record.id,
    recordType: record.url.startsWith("/api/nutrition/") ? "nutrition" : record.url.startsWith("/api/workouts") ? "workout" : record.url.startsWith("/api/health-fitness/sleep/") ? "sleep" : record.url.startsWith("/api/recovery-") ? "recovery" : "health",
    createdAt: record.createdAt,
    status: record.status,
    lastError: record.status === "failed" ? "The server rejected this queued record." : null,
  }));
}

export async function retryHealthMutationQueueItem(userId: number, id: string): Promise<{ sent: number; pending: number; failed: number }> {
  const record = (await recordsForUser(userId)).find((item) => item.id === id);
  if (!record) throw new Error("That offline health record is no longer stored on this device.");
  await put({ ...record, status: "pending", lastError: undefined });
  return flushHealthMutationQueue(userId);
}

export async function discardHealthMutationQueueItem(userId: number, id: string): Promise<boolean> {
  const record = (await recordsForUser(userId)).find((item) => item.id === id);
  if (!record) return false;
  await remove(record.id);
  return true;
}
