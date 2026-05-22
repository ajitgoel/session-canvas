const DB_NAME = "session-canvas-db";
const DB_VERSION = 2;
const COLLECTIONS_STORE = "collections";
const GROUPS_STORE = "groups";
const LINKS_STORE = "links";
const META_STORE = "meta";

let dbPromise;

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

export async function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const transaction = request.transaction;

        if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
          const collections = db.createObjectStore(COLLECTIONS_STORE, {
            keyPath: "id",
            autoIncrement: true
          });
          collections.createIndex("by_updated_at", "updatedAt");
          collections.createIndex("by_sort_order", "sortOrder");
        }

        if (!db.objectStoreNames.contains(GROUPS_STORE)) {
          const groups = db.createObjectStore(GROUPS_STORE, {
            keyPath: "id",
            autoIncrement: true
          });
          groups.createIndex("by_updated_at", "updatedAt");
          groups.createIndex("by_sort_order", "sortOrder");
        }

        if (!db.objectStoreNames.contains(LINKS_STORE)) {
          const links = db.createObjectStore(LINKS_STORE, {
            keyPath: "id",
            autoIncrement: true
          });
          links.createIndex("by_group_id", "groupId");
          links.createIndex("by_updated_at", "updatedAt");
          links.createIndex("by_search_text", "searchText");
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }

        if (request.oldVersion > 0 && request.oldVersion < 2) {
          const collectionsStore = transaction.objectStore(COLLECTIONS_STORE);
          const groupsStore = transaction.objectStore(GROUPS_STORE);
          const addCollectionRequest = collectionsStore.add({
            name: "Default",
            color: "#efb907",
            sortOrder: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });

          addCollectionRequest.onsuccess = () => {
            const defaultCollectionId = addCollectionRequest.result;
            const getAllGroupsRequest = groupsStore.getAll();
            getAllGroupsRequest.onsuccess = () => {
              const groups = getAllGroupsRequest.result || [];
              groups.forEach((group) => {
                groupsStore.put({
                  ...group,
                  collectionId: defaultCollectionId
                });
              });
            };
          };
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

export async function ensureDefaultData() {
  const collections = await getAllCollections();
  if (collections.length === 0) {
    const personal = await createCollection({
      name: "Personal",
      color: "#efb907"
    });

    await createGroup({
      collectionId: personal.id,
      name: "Inbox",
      color: "#efb907"
    });

    const work = await createCollection({
      name: "Work",
      color: "#1c86e2"
    });

    await createGroup({
      collectionId: work.id,
      name: "Research",
      color: "#1c86e2"
    });
    return;
  }

  const groups = await getAllGroups();
  if (groups.length > 0) {
    return;
  }

  const primaryCollection = collections[0];
  await createGroup({
    collectionId: primaryCollection.id,
    name: "Personal",
    color: "#efb907"
  });

  await createGroup({
    collectionId: primaryCollection.id,
    name: "Research",
    color: "#1c86e2"
  });
}

export async function getAllCollections() {
  const { store } = await getStore(COLLECTIONS_STORE);
  const collections = await requestToPromise(store.getAll());
  return collections.sort((a, b) => {
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }

    return b.updatedAt - a.updatedAt;
  });
}

export async function getAllGroups() {
  const { store } = await getStore(GROUPS_STORE);
  const groups = await requestToPromise(store.getAll());
  return groups.sort((a, b) => {
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }

    return b.updatedAt - a.updatedAt;
  });
}

export async function getAllLinks() {
  const { store } = await getStore(LINKS_STORE);
  const links = await requestToPromise(store.getAll());
  return links.sort((a, b) => b.updatedAt - a.updatedAt);
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
  const [collections, groups, links] = await Promise.all([
    getAllCollections(),
    getAllGroups(),
    getAllLinks()
  ]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      collections,
      groups,
      links: links.map((link) => ({
        ...link,
        tags: normalizeTags(link.tags),
        notesFormat: link.notesFormat || "plain"
      }))
    }
  };
}

export async function importBackupData(backup) {
  const payload = backup?.data || backup;
  const collections = Array.isArray(payload?.collections) ? payload.collections : [];
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const links = Array.isArray(payload?.links) ? payload.links : [];

  const db = await openDb();
  const transaction = db.transaction(
    [COLLECTIONS_STORE, GROUPS_STORE, LINKS_STORE, META_STORE],
    "readwrite"
  );
  const collectionsStore = transaction.objectStore(COLLECTIONS_STORE);
  const groupsStore = transaction.objectStore(GROUPS_STORE);
  const linksStore = transaction.objectStore(LINKS_STORE);
  const metaStore = transaction.objectStore(META_STORE);

  await Promise.all([
    requestNoResult(collectionsStore.clear()),
    requestNoResult(groupsStore.clear()),
    requestNoResult(linksStore.clear())
  ]);

  collections.forEach((collection) => {
    collectionsStore.put(collection);
  });

  groups.forEach((group) => {
    groupsStore.put(group);
  });

  links.forEach((link) => {
    const normalized = {
      ...link,
      url: normalizeUrl(link.url),
      tags: normalizeTags(link.tags),
      notesFormat: link.notesFormat || "plain"
    };
    normalized.searchText = buildSearchText(normalized, "");
    linksStore.put(normalized);
  });

  metaStore.put({ key: "lastImportedAt", value: Date.now() });
  await transactionDone(transaction);
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
    notesFormat: link.notesFormat || "plain",
    groupName: groupMap.get(link.groupId)?.name || "Ungrouped"
  }));

  return collections.map((collection) => {
    const collectionGroups = groups
      .filter((group) => group.collectionId === collection.id)
      .map((group) => {
        const groupLinks = hydratedLinks.filter((link) => link.groupId === group.id);
        return {
          ...group,
          links: groupLinks
        };
      });

    return {
      ...collection,
      groups: collectionGroups
    };
  });
}

export async function createCollection({ name, color }) {
  const now = Date.now();
  const collections = await getAllCollections();
  const nextSortOrder = collections.length;
  const record = {
    name: name.trim(),
    color,
    sortOrder: nextSortOrder,
    createdAt: now,
    updatedAt: now
  };

  const { store, done } = await getStore(COLLECTIONS_STORE, "readwrite");
  const id = await requestToPromise(store.add(record));
  await done;
  return { ...record, id };
}

export async function updateCollection(id, updates) {
  const { store, done } = await getStore(COLLECTIONS_STORE, "readwrite");
  const current = await requestToPromise(store.get(id));
  if (!current) {
    throw new Error("Collection not found");
  }

  const next = {
    ...current,
    ...updates,
    name: (updates.name ?? current.name).trim(),
    updatedAt: Date.now()
  };

  store.put(next);
  await done;
  return next;
}

export async function createGroup({ collectionId, name, color }) {
  const now = Date.now();
  const groups = await getAllGroups();
  const nextSortOrder = groups.filter((group) => group.collectionId === Number(collectionId)).length;
  const record = {
    collectionId: Number(collectionId),
    name: name.trim(),
    color,
    collapsed: false,
    sortOrder: nextSortOrder,
    createdAt: now,
    updatedAt: now
  };

  const { store, done } = await getStore(GROUPS_STORE, "readwrite");
  const id = await requestToPromise(store.add(record));
  await done;
  await updateCollection(record.collectionId, {});
  return { ...record, id };
}

export async function updateGroup(id, updates) {
  const { store, done } = await getStore(GROUPS_STORE, "readwrite");
  const current = await requestToPromise(store.get(id));
  if (!current) {
    throw new Error("Group not found");
  }

  const next = {
    ...current,
    ...updates,
    collectionId: Number(updates.collectionId ?? current.collectionId),
    name: (updates.name ?? current.name).trim(),
    updatedAt: Date.now()
  };

  store.put(next);
  await done;
  await updateCollection(next.collectionId, {});
  return next;
}

export async function deleteCollection(id) {
  const snapshot = await getSnapshot();
  const targetCollection = snapshot.find((collection) => collection.id === id);
  if (!targetCollection) {
    return;
  }

  const remainingCollections = snapshot.filter((collection) => collection.id !== id);
  let fallbackCollection = remainingCollections[0];
  if (!fallbackCollection) {
    fallbackCollection = await createCollection({ name: "Saved", color: "#efb907" });
  }

  const db = await openDb();
  const transaction = db.transaction([COLLECTIONS_STORE, GROUPS_STORE], "readwrite");
  const collectionsStore = transaction.objectStore(COLLECTIONS_STORE);
  const groupsStore = transaction.objectStore(GROUPS_STORE);

  for (const group of targetCollection.groups) {
    groupsStore.put({
      ...group,
      collectionId: fallbackCollection.id,
      updatedAt: Date.now()
    });
  }

  collectionsStore.delete(id);
  await transactionDone(transaction);
}

export async function deleteGroup(id) {
  const snapshot = await getSnapshot();
  const targetCollection = snapshot.find((collection) =>
    collection.groups.some((group) => group.id === id)
  );
  const targetGroup = targetCollection?.groups.find((group) => group.id === id);
  if (!targetGroup) {
    return;
  }

  const remainingGroups = targetCollection.groups.filter((group) => group.id !== id);
  let fallbackGroup = remainingGroups[0];
  if (!fallbackGroup) {
    fallbackGroup = await createGroup({
      collectionId: targetCollection.id,
      name: "Saved",
      color: "#efb907"
    });
  }

  const db = await openDb();
  const transaction = db.transaction([GROUPS_STORE, LINKS_STORE], "readwrite");
  const groupsStore = transaction.objectStore(GROUPS_STORE);
  const linksStore = transaction.objectStore(LINKS_STORE);

  for (const link of targetGroup.links) {
    const { groupName, ...rest } = link;
    linksStore.put({
      ...rest,
      groupId: fallbackGroup.id,
      searchText: buildSearchText({ ...rest, groupId: fallbackGroup.id }, fallbackGroup.name),
      updatedAt: Date.now()
    });
  }

  groupsStore.delete(id);
  await transactionDone(transaction);
  await updateCollection(targetCollection.id, {});
}

export async function saveLink(link) {
  const groups = await getAllGroups();
  const group = groups.find((entry) => entry.id === Number(link.groupId)) || groups[0];
  if (!group) {
    throw new Error("No groups available");
  }

  const now = Date.now();
  const normalized = {
    url: normalizeUrl(link.url),
    title: link.title.trim(),
    notes: (link.notes || "").trim(),
    notesFormat: link.notesFormat || "plain",
    tags: normalizeTags(link.tags),
    favicon: link.favicon || "",
    groupId: group.id,
    pinned: Boolean(link.pinned),
    createdAt: link.createdAt || now,
    updatedAt: now
  };

  normalized.searchText = buildSearchText(normalized, group.name);

  const { store, done } = await getStore(LINKS_STORE, "readwrite");

  let id;
  if (link.id) {
    const next = { ...normalized, id: link.id };
    store.put(next);
    id = link.id;
  } else {
    id = await requestToPromise(store.add(normalized));
  }

  await done;
  await updateGroup(group.id, {});

  return { ...normalized, id };
}

export async function deleteLink(id) {
  const { store, done } = await getStore(LINKS_STORE, "readwrite");
  store.delete(id);
  await done;
}

export async function importLinks(links, groupId) {
  const groups = await getAllGroups();
  const group = groups.find((entry) => entry.id === Number(groupId)) || groups[0];
  if (!group) {
    throw new Error("No groups available");
  }

  const now = Date.now();
  const db = await openDb();
  const transaction = db.transaction([LINKS_STORE, GROUPS_STORE], "readwrite");
  const linksStore = transaction.objectStore(LINKS_STORE);
  const groupsStore = transaction.objectStore(GROUPS_STORE);

  links.forEach((link) => {
      const normalized = {
        url: normalizeUrl(link.url),
        title: (link.title || link.url).trim(),
        notes: (link.notes || "").trim(),
        notesFormat: link.notesFormat || "plain",
        tags: normalizeTags(link.tags),
      favicon: link.favicon || "",
      groupId: group.id,
      pinned: Boolean(link.pinned),
      createdAt: now,
      updatedAt: now
    };

    normalized.searchText = buildSearchText(normalized, group.name);
    linksStore.add(normalized);
  });

  groupsStore.put({
    ...group,
    updatedAt: now
  });

  await transactionDone(transaction);
  await updateCollection(group.collectionId, {});
}

export async function setGroupCollapsed(id, collapsed) {
  return updateGroup(id, { collapsed });
}

export async function getMeta(key) {
  const { store } = await getStore(META_STORE);
  return requestToPromise(store.get(key));
}

export async function setMeta(key, value) {
  const { store, done } = await getStore(META_STORE, "readwrite");
  store.put({ key, value });
  await done;
}
