const DB_NAME = "session-canvas-db";
const DB_VERSION = 3;
const COLLECTIONS_STORE = "collections";
const GROUPS_STORE = "groups";
const LINKS_STORE = "links";
const META_STORE = "meta";
const VAULT_STORE = "vault";
const VAULT_ID = "primary";
const SESSION_KEY_NAME = "sessionCanvasVaultKey";

let dbPromise;
let pageSessionKey = null;
let cachedVault = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeUrl(rawUrl) {
  const value = (rawUrl || "").trim();
  if (!value) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return value;
  }

  if (
    value.startsWith("localhost:") ||
    value.startsWith("127.0.0.1:") ||
    value.startsWith("[::1]") ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value)
  ) {
    return `http://${value}`;
  }

  return `https://${value}`;
}

function buildSearchText(link, groupName = "") {
  return [
    link.title,
    link.notes,
    link.url,
    groupName,
    ...(link.tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function requestNoResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createDefaultVault() {
  const now = Date.now();
  return {
    collections: [
      {
        id: 1,
        name: "Personal",
        color: "#efb907",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 2,
        name: "Work",
        color: "#1c86e2",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
    groups: [
      {
        id: 1,
        collectionId: 1,
        name: "Inbox",
        color: "#efb907",
        collapsed: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 2,
        collectionId: 2,
        name: "Research",
        color: "#1c86e2",
        collapsed: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      }
    ],
    links: [],
    counters: {
      collectionId: 3,
      groupId: 3,
      linkId: 1
    }
  };
}

function computeCounters(data) {
  return {
    collectionId: Math.max(0, ...data.collections.map((item) => item.id || 0)) + 1,
    groupId: Math.max(0, ...data.groups.map((item) => item.id || 0)) + 1,
    linkId: Math.max(0, ...data.links.map((item) => item.id || 0)) + 1
  };
}

function normalizeVaultData(data) {
  const collections = Array.isArray(data?.collections) ? data.collections : [];
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const links = Array.isArray(data?.links) ? data.links : [];

  return {
    collections,
    groups,
    links: links.map((link) => ({
      ...link,
      url: normalizeUrl(link.url),
      tags: normalizeTags(link.tags),
      notes: (link.notes || "").trim()
    })),
    counters: data?.counters || computeCounters({ collections, groups, links })
  };
}

async function deriveKeyFromPassphrase(passphrase, saltBytes) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 250000,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportSessionKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(raw);
}

async function importSessionKey(rawBase64) {
  return crypto.subtle.importKey(
    "raw",
    base64ToUint8Array(rawBase64),
    {
      name: "AES-GCM"
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function saveSessionKeyToSessionStorage(key) {
  if (!chrome?.storage?.session) {
    return;
  }
  const raw = await exportSessionKey(key);
  await chrome.storage.session.set({
    [SESSION_KEY_NAME]: raw
  });
}

async function loadSessionKeyFromSessionStorage() {
  if (!chrome?.storage?.session) {
    return null;
  }
  const result = await chrome.storage.session.get(SESSION_KEY_NAME);
  if (!result?.[SESSION_KEY_NAME]) {
    return null;
  }
  return importSessionKey(result[SESSION_KEY_NAME]);
}

async function clearSessionKeyFromSessionStorage() {
  if (!chrome?.storage?.session) {
    return;
  }
  await chrome.storage.session.remove(SESSION_KEY_NAME);
}

async function encryptVaultPayload(vault, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(vault));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encoded
  );

  return {
    iv: arrayBufferToBase64(iv),
    cipherText: arrayBufferToBase64(encrypted)
  };
}

async function decryptVaultPayload(record, key) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToUint8Array(record.iv)
    },
    key,
    base64ToUint8Array(record.cipherText)
  );

  return normalizeVaultData(JSON.parse(new TextDecoder().decode(decrypted)));
}

export async function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
          db.createObjectStore(COLLECTIONS_STORE, { keyPath: "id", autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(GROUPS_STORE)) {
          db.createObjectStore(GROUPS_STORE, { keyPath: "id", autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(LINKS_STORE)) {
          db.createObjectStore(LINKS_STORE, { keyPath: "id", autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(VAULT_STORE)) {
          db.createObjectStore(VAULT_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

async function getStore(storeName, mode = "readonly") {
  const db = await openDb();
  const transaction = db.transaction(storeName, mode);

  return {
    store: transaction.objectStore(storeName),
    done: transactionDone(transaction)
  };
}

async function getMetaValue(key) {
  const { store } = await getStore(META_STORE);
  const result = await requestToPromise(store.get(key));
  return result?.value;
}

async function setMetaValue(key, value) {
  const { store, done } = await getStore(META_STORE, "readwrite");
  store.put({ key, value });
  await done;
}

async function getVaultRecord() {
  const { store } = await getStore(VAULT_STORE);
  return requestToPromise(store.get(VAULT_ID));
}

async function putVaultRecord(record) {
  const { store, done } = await getStore(VAULT_STORE, "readwrite");
  store.put(record);
  await done;
}

async function clearLegacyStores() {
  const db = await openDb();
  const transaction = db.transaction([COLLECTIONS_STORE, GROUPS_STORE, LINKS_STORE], "readwrite");
  await Promise.all([
    requestNoResult(transaction.objectStore(COLLECTIONS_STORE).clear()),
    requestNoResult(transaction.objectStore(GROUPS_STORE).clear()),
    requestNoResult(transaction.objectStore(LINKS_STORE).clear())
  ]);
  await transactionDone(transaction);
}

async function readLegacyData() {
  const db = await openDb();
  const collectionStore = db.transaction(COLLECTIONS_STORE, "readonly").objectStore(COLLECTIONS_STORE);
  const groupStore = db.transaction(GROUPS_STORE, "readonly").objectStore(GROUPS_STORE);
  const linkStore = db.transaction(LINKS_STORE, "readonly").objectStore(LINKS_STORE);

  const [collections, groups, links] = await Promise.all([
    requestToPromise(collectionStore.getAll()),
    requestToPromise(groupStore.getAll()),
    requestToPromise(linkStore.getAll())
  ]);

  if (collections.length === 0 && groups.length === 0 && links.length === 0) {
    return null;
  }

  return normalizeVaultData({
    collections,
    groups,
    links
  });
}

async function ensureSessionKeyLoaded() {
  if (pageSessionKey) {
    return pageSessionKey;
  }

  pageSessionKey = await loadSessionKeyFromSessionStorage();
  return pageSessionKey;
}

async function persistCachedVault() {
  const key = await ensureSessionKeyLoaded();
  if (!key || !cachedVault) {
    throw new Error("Vault is locked");
  }

  const encrypted = await encryptVaultPayload(cachedVault, key);
  await putVaultRecord({
    id: VAULT_ID,
    ...encrypted,
    updatedAt: Date.now()
  });
}

async function requireUnlockedVault() {
  const key = await ensureSessionKeyLoaded();
  if (!key) {
    throw new Error("Vault is locked");
  }

  if (cachedVault) {
    return cachedVault;
  }

  const record = await getVaultRecord();
  if (!record) {
    throw new Error("Vault is not configured");
  }

  cachedVault = await decryptVaultPayload(record, key);
  return cachedVault;
}

export async function getVaultStatus() {
  const [configured, sessionKey] = await Promise.all([
    getMetaValue("vaultConfigured"),
    loadSessionKeyFromSessionStorage()
  ]);

  return {
    configured: Boolean(configured),
    unlocked: Boolean(sessionKey)
  };
}

export async function setupPassphrase(passphrase) {
  if (!passphrase || passphrase.length < 6) {
    throw new Error("Passphrase must be at least 6 characters");
  }

  const existingStatus = await getVaultStatus();
  if (existingStatus.configured) {
    throw new Error("Vault is already configured");
  }

  const legacy = await readLegacyData();
  const vault = legacy || createDefaultVault();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const encrypted = await encryptVaultPayload(vault, key);

  await putVaultRecord({
    id: VAULT_ID,
    ...encrypted,
    updatedAt: Date.now()
  });
  await setMetaValue("vaultConfigured", true);
  await setMetaValue("vaultSalt", arrayBufferToBase64(salt));
  await clearLegacyStores();

  pageSessionKey = key;
  cachedVault = vault;
  await saveSessionKeyToSessionStorage(key);
}

export async function unlockVault(passphrase) {
  const saltBase64 = await getMetaValue("vaultSalt");
  const record = await getVaultRecord();
  if (!saltBase64 || !record) {
    throw new Error("Vault is not configured");
  }

  const key = await deriveKeyFromPassphrase(passphrase, base64ToUint8Array(saltBase64));
  const vault = await decryptVaultPayload(record, key);
  pageSessionKey = key;
  cachedVault = vault;
  await saveSessionKeyToSessionStorage(key);
}

export async function lockVault() {
  pageSessionKey = null;
  cachedVault = null;
  await clearSessionKeyFromSessionStorage();
}

export async function ensureDefaultData() {
  const vault = await requireUnlockedVault();
  if (vault.collections.length === 0) {
    cachedVault = createDefaultVault();
    await persistCachedVault();
  }
}

export async function getAllCollections() {
  const vault = await requireUnlockedVault();
  return [...vault.collections].sort((a, b) => {
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }

    return b.updatedAt - a.updatedAt;
  });
}

export async function getAllGroups() {
  const vault = await requireUnlockedVault();
  return [...vault.groups].sort((a, b) => {
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }

    return b.updatedAt - a.updatedAt;
  });
}

export async function getAllLinks() {
  const vault = await requireUnlockedVault();
  return [...vault.links].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAllTags() {
  const links = await getAllLinks();
  const tagCounts = new Map();

  links.forEach((link) => {
    normalizeTags(link.tags).forEach((tag) => {
      const key = tag.toLowerCase();
      const current = tagCounts.get(key);
      if (current) {
        current.count += 1;
      } else {
        tagCounts.set(key, { tag, count: 1 });
      }
    });
  });

  return Array.from(tagCounts.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.tag.localeCompare(b.tag);
  });
}

export async function exportBackupData() {
  const vault = await requireUnlockedVault();
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    encrypted: true,
    data: normalizeVaultData(vault)
  };
}

export async function importBackupData(backup) {
  const payload = backup?.data || backup;
  cachedVault = normalizeVaultData(payload);
  cachedVault.counters = computeCounters(cachedVault);
  await persistCachedVault();
}

export async function getSnapshot() {
  const [collections, groups, links] = await Promise.all([
    getAllCollections(),
    getAllGroups(),
    getAllLinks()
  ]);
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  const hydratedLinks = links.map((link) => ({
    ...link,
    tags: normalizeTags(link.tags),
    groupName: groupMap.get(link.groupId)?.name || "Ungrouped"
  }));

  return collections.map((collection) => {
    const collectionGroups = groups
      .filter((group) => group.collectionId === collection.id)
      .map((group) => ({
        ...group,
        links: hydratedLinks.filter((link) => link.groupId === group.id)
      }));

    return {
      ...collection,
      groups: collectionGroups
    };
  });
}

export async function createCollection({ name, color }) {
  const vault = await requireUnlockedVault();
  const now = Date.now();
  const record = {
    id: vault.counters.collectionId,
    name: name.trim(),
    color,
    sortOrder: vault.collections.length,
    createdAt: now,
    updatedAt: now
  };

  vault.counters.collectionId += 1;
  vault.collections.push(record);
  await persistCachedVault();
  return record;
}

export async function updateCollection(id, updates) {
  const vault = await requireUnlockedVault();
  const collection = vault.collections.find((item) => item.id === id);
  if (!collection) {
    throw new Error("Collection not found");
  }

  Object.assign(collection, {
    ...updates,
    name: (updates.name ?? collection.name).trim(),
    updatedAt: Date.now()
  });
  await persistCachedVault();
  return collection;
}

export async function createGroup({ collectionId, name, color }) {
  const vault = await requireUnlockedVault();
  const now = Date.now();
  const record = {
    id: vault.counters.groupId,
    collectionId: Number(collectionId),
    name: name.trim(),
    color,
    collapsed: false,
    sortOrder: vault.groups.filter((group) => group.collectionId === Number(collectionId)).length,
    createdAt: now,
    updatedAt: now
  };

  vault.counters.groupId += 1;
  vault.groups.push(record);
  const collection = vault.collections.find((item) => item.id === Number(collectionId));
  if (collection) {
    collection.updatedAt = now;
  }
  await persistCachedVault();
  return record;
}

export async function updateGroup(id, updates) {
  const vault = await requireUnlockedVault();
  const group = vault.groups.find((item) => item.id === id);
  if (!group) {
    throw new Error("Group not found");
  }

  Object.assign(group, {
    ...updates,
    collectionId: Number(updates.collectionId ?? group.collectionId),
    name: (updates.name ?? group.name).trim(),
    updatedAt: Date.now()
  });
  const collection = vault.collections.find((item) => item.id === group.collectionId);
  if (collection) {
    collection.updatedAt = Date.now();
  }
  await persistCachedVault();
  return group;
}

export async function deleteCollection(id) {
  const vault = await requireUnlockedVault();
  const target = vault.collections.find((item) => item.id === id);
  if (!target) {
    return;
  }

  const remainingCollections = vault.collections.filter((item) => item.id !== id);
  let fallbackCollection = remainingCollections[0];
  if (!fallbackCollection) {
    fallbackCollection = await createCollection({ name: "Saved", color: "#efb907" });
  }

  vault.groups.forEach((group) => {
    if (group.collectionId === id) {
      group.collectionId = fallbackCollection.id;
      group.updatedAt = Date.now();
    }
  });

  vault.collections = vault.collections.filter((item) => item.id !== id);
  await persistCachedVault();
}

export async function deleteGroup(id) {
  const vault = await requireUnlockedVault();
  const targetGroup = vault.groups.find((item) => item.id === id);
  if (!targetGroup) {
    return;
  }

  const siblingGroups = vault.groups.filter(
    (group) => group.collectionId === targetGroup.collectionId && group.id !== id
  );
  let fallbackGroup = siblingGroups[0];
  if (!fallbackGroup) {
    fallbackGroup = await createGroup({
      collectionId: targetGroup.collectionId,
      name: "Saved",
      color: "#efb907"
    });
  }

  vault.links.forEach((link) => {
    if (link.groupId === id) {
      link.groupId = fallbackGroup.id;
      link.searchText = buildSearchText(link, fallbackGroup.name);
      link.updatedAt = Date.now();
    }
  });

  vault.groups = vault.groups.filter((group) => group.id !== id);
  const collection = vault.collections.find((item) => item.id === targetGroup.collectionId);
  if (collection) {
    collection.updatedAt = Date.now();
  }
  await persistCachedVault();
}

export async function saveLink(link) {
  const vault = await requireUnlockedVault();
  const group = vault.groups.find((entry) => entry.id === Number(link.groupId));
  if (!group) {
    throw new Error("No group available");
  }

  const now = Date.now();
  const normalized = {
    url: normalizeUrl(link.url),
    title: link.title.trim(),
    notes: (link.notes || "").trim(),
    tags: normalizeTags(link.tags),
    favicon: link.favicon || "",
    groupId: group.id,
    pinned: Boolean(link.pinned),
    createdAt: link.createdAt || now,
    updatedAt: now
  };
  normalized.searchText = buildSearchText(normalized, group.name);

  if (link.id) {
    const index = vault.links.findIndex((item) => item.id === link.id);
    if (index === -1) {
      throw new Error("Link not found");
    }
    vault.links[index] = {
      ...vault.links[index],
      ...normalized,
      id: link.id
    };
  } else {
    vault.links.push({
      ...normalized,
      id: vault.counters.linkId
    });
    vault.counters.linkId += 1;
  }

  group.updatedAt = now;
  const collection = vault.collections.find((item) => item.id === group.collectionId);
  if (collection) {
    collection.updatedAt = now;
  }

  await persistCachedVault();
}

export async function deleteLink(id) {
  const vault = await requireUnlockedVault();
  vault.links = vault.links.filter((link) => link.id !== id);
  await persistCachedVault();
}

export async function importLinks(links, groupId) {
  const vault = await requireUnlockedVault();
  const group = vault.groups.find((entry) => entry.id === Number(groupId));
  if (!group) {
    throw new Error("No group available");
  }

  const now = Date.now();
  links.forEach((link) => {
    const normalized = {
      id: vault.counters.linkId,
      url: normalizeUrl(link.url),
      title: (link.title || link.url).trim(),
      notes: (link.notes || "").trim(),
      tags: normalizeTags(link.tags),
      favicon: link.favicon || "",
      groupId: group.id,
      pinned: Boolean(link.pinned),
      createdAt: now,
      updatedAt: now
    };
    normalized.searchText = buildSearchText(normalized, group.name);
    vault.links.push(normalized);
    vault.counters.linkId += 1;
  });

  group.updatedAt = now;
  const collection = vault.collections.find((item) => item.id === group.collectionId);
  if (collection) {
    collection.updatedAt = now;
  }

  await persistCachedVault();
}

export async function setGroupCollapsed(id, collapsed) {
  return updateGroup(id, { collapsed });
}

export async function getMeta(key) {
  return getMetaValue(key);
}

export async function setMeta(key, value) {
  return setMetaValue(key, value);
}
