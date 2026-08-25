const DATABASE_NAME = "lyfeos-calendar-mutations";
const DATABASE_VERSION = 1;
const STORE_NAME = "pending";
const MAX_QUEUED_MUTATIONS = 100;

type QueueStatus = "pending" | "conflict" | "failed";
type MutationKind = "create" | "update";

type ConflictQuest = {
  id: number;
  title: string;
  revision: number;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
};

type CalendarMutationRecord = {
  id: string;
  userId: number;
  kind: MutationKind;
  url: string;
  body: Record<string, unknown>;
  questId: number | null;
  expectedRevision: number | null;
  title: string;
  createdAt: string;
  attemptedAt?: string;
  status: QueueStatus;
  lastError?: string;
  currentQuest?: ConflictQuest;
};

export type CalendarMutationQueueItem = Pick<CalendarMutationRecord,
  "id" | "kind" | "questId" | "expectedRevision" | "title" | "createdAt" | "status"
> & {
  lastError: string | null;
  currentQuest: ConflictQuest | null;
};

export type CalendarMutationResult<T> =
  | { queued: true; mutationId: string; status: QueueStatus }
  | { queued: false; mutationId: string; data: T };

export class CalendarOfflineStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarOfflineStorageError";
  }
}

class CalendarMutationHttpError extends Error {
  constructor(readonly status: number, message: string, readonly currentQuest?: ConflictQuest) {
    super(message);
    this.name = "CalendarMutationHttpError";
  }
}

function storageError(error: unknown): CalendarOfflineStorageError {
  if (error instanceof CalendarOfflineStorageError) return error;
  const name = typeof error === "object" && error && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "QuotaExceededError") return new CalendarOfflineStorageError("This device is out of private offline storage. The Calendar change was not saved; keep the form open or reconnect and try again.");
  if (["SecurityError", "InvalidStateError", "NotSupportedError"].includes(name)) return new CalendarOfflineStorageError("Private Calendar storage is unavailable in this browser. The change was not saved; stay online or keep the form open and try again.");
  if (name === "VersionError" || name === "BlockedError") return new CalendarOfflineStorageError("Another LyfeOS tab is blocking private Calendar storage. Close the other tab and try again.");
  return new CalendarOfflineStorageError("Private Calendar storage failed. The change was not saved; keep the form open and try again.");
}

function mutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `calendar_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(storageError({ name: "NotSupportedError" }));
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
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => reject(storageError({ name: "BlockedError" }));
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
      request.onerror = () => reject(storageError(request.error));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(storageError(transaction.error));
      transaction.onerror = () => reject(storageError(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function put(record: CalendarMutationRecord): Promise<void> { await withStore("readwrite", (store) => store.put(record)); }
async function remove(id: string): Promise<void> { await withStore("readwrite", (store) => store.delete(id)); }

async function recordsForUser(userId: number): Promise<CalendarMutationRecord[]> {
  const records = await withStore<CalendarMutationRecord[]>("readonly", (store) => store.index("userId").getAll(userId));
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "NetworkError");
}

async function send<T>(record: CalendarMutationRecord): Promise<T> {
  const response = await fetch(record.url, {
    method: record.kind === "create" ? "POST" : "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-lyfeos-mutation-id": record.id,
      ...(record.expectedRevision === null ? {} : { "x-lyfeos-expected-revision": String(record.expectedRevision) }),
    },
    credentials: "include",
    body: JSON.stringify(record.body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown; currentQuest?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `${response.status}: ${response.statusText || "Calendar change rejected"}`;
    const candidate = payload?.currentQuest as Partial<ConflictQuest> | undefined;
    const currentQuest = candidate && Number.isInteger(candidate.id) && Number.isInteger(candidate.revision) && typeof candidate.title === "string"
      ? candidate as ConflictQuest
      : undefined;
    throw new CalendarMutationHttpError(response.status, message, currentQuest);
  }
  return await response.json() as T;
}

async function storeNew(record: CalendarMutationRecord): Promise<void> {
  const existing = await recordsForUser(record.userId);
  if (existing.length >= MAX_QUEUED_MUTATIONS) throw new CalendarOfflineStorageError("This device already holds 100 unsynced Calendar changes. Reconnect and review them before adding another.");
  await put(record);
}

export async function submitCalendarMissionMutation<T>(input: {
  userId: number;
  kind: MutationKind;
  url: string;
  body: Record<string, unknown>;
  questId?: number | null;
  expectedRevision?: number | null;
  title: string;
}): Promise<CalendarMutationResult<T>> {
  const record: CalendarMutationRecord = {
    id: mutationId(), userId: input.userId, kind: input.kind, url: input.url, body: input.body,
    questId: input.questId ?? null, expectedRevision: input.expectedRevision ?? null,
    title: input.title.trim() || "Untitled mission", createdAt: new Date().toISOString(), status: "pending",
  };
  if (record.kind === "update" && (!record.questId || !record.expectedRevision)) {
    throw new Error("Reload this mission before saving an offline-capable change.");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (record.kind === "update") {
      const existing = (await recordsForUser(record.userId)).find((item) => item.kind === "update" && item.questId === record.questId && item.status === "pending" && !item.attemptedAt);
      if (existing) {
        await put({ ...existing, body: { ...existing.body, ...record.body }, title: record.title });
        return { queued: true, mutationId: existing.id, status: "pending" };
      }
    }
    await storeNew(record);
    return { queued: true, mutationId: record.id, status: "pending" };
  }
  try {
    return { queued: false, mutationId: record.id, data: await send<T>({ ...record, attemptedAt: new Date().toISOString() }) };
  } catch (error) {
    if (error instanceof CalendarMutationHttpError && error.status === 409) {
      await storeNew({ ...record, attemptedAt: new Date().toISOString(), status: "conflict", lastError: error.message, currentQuest: error.currentQuest });
      return { queued: true, mutationId: record.id, status: "conflict" };
    }
    if (!isNetworkFailure(error)) throw error;
    await storeNew({ ...record, attemptedAt: new Date().toISOString() });
    return { queued: true, mutationId: record.id, status: "pending" };
  }
}

export async function flushCalendarMutationQueue(userId: number): Promise<{ sent: number; pending: number; conflicts: number; failed: number }> {
  const initial = await recordsForUser(userId);
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      sent: 0,
      pending: initial.filter((record) => record.status === "pending").length,
      conflicts: initial.filter((record) => record.status === "conflict").length,
      failed: initial.filter((record) => record.status === "failed").length,
    };
  }
  let sent = 0;
  for (const record of initial) {
    if (record.status !== "pending") continue;
    try {
      await put({ ...record, attemptedAt: new Date().toISOString() });
      await send(record);
      await remove(record.id);
      sent += 1;
    } catch (error) {
      if (isNetworkFailure(error)) break;
      const status = error instanceof CalendarMutationHttpError ? error.status : 0;
      if (status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) break;
      if (error instanceof CalendarMutationHttpError && status === 409) {
        await put({ ...record, attemptedAt: new Date().toISOString(), status: "conflict", lastError: error.message, currentQuest: error.currentQuest });
        continue;
      }
      await put({ ...record, attemptedAt: new Date().toISOString(), status: "failed", lastError: error instanceof Error ? error.message : "The server rejected this Calendar change." });
    }
  }
  const remaining = await recordsForUser(userId);
  return {
    sent,
    pending: remaining.filter((record) => record.status === "pending").length,
    conflicts: remaining.filter((record) => record.status === "conflict").length,
    failed: remaining.filter((record) => record.status === "failed").length,
  };
}

export async function listCalendarMutationQueue(userId: number): Promise<CalendarMutationQueueItem[]> {
  return (await recordsForUser(userId)).map((record) => ({
    id: record.id, kind: record.kind, questId: record.questId, expectedRevision: record.expectedRevision,
    title: record.title, createdAt: record.createdAt, status: record.status,
    lastError: record.lastError || null, currentQuest: record.currentQuest || null,
  }));
}

export async function retryCalendarMutationQueueItem(userId: number, id: string, expectedRevision?: number): Promise<{ sent: number; pending: number; conflicts: number; failed: number }> {
  const record = (await recordsForUser(userId)).find((item) => item.id === id);
  if (!record) throw new Error("That queued Calendar change is no longer stored on this device.");
  if (record.kind === "update" && record.status === "conflict" && !expectedRevision) {
    throw new Error("Review the current mission version before applying this change.");
  }
  await put({ ...record, expectedRevision: expectedRevision ?? record.expectedRevision, status: "pending", lastError: undefined, currentQuest: undefined, attemptedAt: undefined });
  return flushCalendarMutationQueue(userId);
}

export async function discardCalendarMutationQueueItem(userId: number, id: string): Promise<boolean> {
  const record = (await recordsForUser(userId)).find((item) => item.id === id);
  if (!record) return false;
  await remove(record.id);
  return true;
}
