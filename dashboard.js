import {
  createCollection,
  createGroup,
  deleteCollection,
  deleteGroup,
  deleteLink,
  ensureDefaultData,
  exportBackupData,
  getAllTags,
  getSnapshot,
  getVaultStatus,
  importBackupData,
  importLinks,
  lockVault,
  saveLink,
  setGroupCollapsed,
  setupPassphrase,
  unlockVault,
  updateCollection,
  updateGroup
} from "./db.js";

const state = {
  collections: [],
  tags: [],
  activeCollectionId: null,
  searchTerm: "",
  selectedTag: "",
  currentTabCount: 0,
  resumeLinkDialogAfterGroup: false,
  vaultConfigured: false,
  vaultUnlocked: false
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  saveCurrentTabBtn: document.querySelector("#saveCurrentTabBtn"),
  importWindowBtn: document.querySelector("#importWindowBtn"),
  importBackupBtn: document.querySelector("#importBackupBtn"),
  exportBackupBtn: document.querySelector("#exportBackupBtn"),
  lockVaultBtn: document.querySelector("#lockVaultBtn"),
  addLinkBtn: document.querySelector("#addLinkBtn"),
  thisBrowserBtn: document.querySelector("#thisBrowserBtn"),
  browserTabCount: document.querySelector("#browserTabCount"),
  newCollectionBtn: document.querySelector("#newCollectionBtn"),
  collectionNav: document.querySelector("#collectionNav"),
  securityGate: document.querySelector("#securityGate"),
  securityTitle: document.querySelector("#securityTitle"),
  securityMessage: document.querySelector("#securityMessage"),
  securityForm: document.querySelector("#securityForm"),
  securityPassphrase: document.querySelector("#securityPassphrase"),
  heroBadge: document.querySelector("#heroBadge"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  tagFilterChips: document.querySelector("#tagFilterChips"),
  newGroupBtn: document.querySelector("#newGroupBtn"),
  editCollectionBtn: document.querySelector("#editCollectionBtn"),
  openGroupBtn: document.querySelector("#openGroupBtn"),
  groupsContainer: document.querySelector("#groupsContainer"),
  emptyState: document.querySelector("#emptyState"),
  linkDialog: document.querySelector("#linkDialog"),
  linkDialogTitle: document.querySelector("#linkDialogTitle"),
  linkForm: document.querySelector("#linkForm"),
  linkId: document.querySelector("#linkId"),
  linkTitle: document.querySelector("#linkTitle"),
  linkUrl: document.querySelector("#linkUrl"),
  linkNotes: document.querySelector("#linkNotes"),
  linkTags: document.querySelector("#linkTags"),
  tagSuggestions: document.querySelector("#tagSuggestions"),
  existingTagSuggestions: document.querySelector("#existingTagSuggestions"),
  linkGroup: document.querySelector("#linkGroup"),
  linkNewGroupBtn: document.querySelector("#linkNewGroupBtn"),
  linkPinned: document.querySelector("#linkPinned"),
  collectionDialog: document.querySelector("#collectionDialog"),
  collectionDialogTitle: document.querySelector("#collectionDialogTitle"),
  collectionForm: document.querySelector("#collectionForm"),
  collectionId: document.querySelector("#collectionId"),
  collectionName: document.querySelector("#collectionName"),
  collectionColor: document.querySelector("#collectionColor"),
  deleteCollectionBtn: document.querySelector("#deleteCollectionBtn"),
  groupDialog: document.querySelector("#groupDialog"),
  groupDialogTitle: document.querySelector("#groupDialogTitle"),
  groupForm: document.querySelector("#groupForm"),
  groupId: document.querySelector("#groupId"),
  groupName: document.querySelector("#groupName"),
  groupCollection: document.querySelector("#groupCollection"),
  groupColor: document.querySelector("#groupColor"),
  deleteGroupBtn: document.querySelector("#deleteGroupBtn"),
  groupSectionTemplate: document.querySelector("#groupSectionTemplate"),
  linkCardTemplate: document.querySelector("#linkCardTemplate"),
  importBackupInput: document.querySelector("#importBackupInput")
};

function relativeTime(date) {
  const diffMs = Date.now() - date;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "Updated just now";
  }
  if (minutes < 60) {
    return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
  }

  return `Updated ${new Date(date).toLocaleDateString()}`;
}

function matchesSearch(parts, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  return parts.join(" ").toLowerCase().includes(searchTerm.toLowerCase());
}

function linkMatchesSelectedTag(link) {
  if (!state.selectedTag) {
    return true;
  }

  return (link.tags || []).some((tag) => tag.toLowerCase() === state.selectedTag.toLowerCase());
}

function groupMatchesSearch(group, searchTerm) {
  if (matchesSearch([group.name], searchTerm)) {
    return true;
  }

  return group.links.some((link) =>
    matchesSearch([link.title, link.notes, link.url, ...(link.tags || [])], searchTerm) &&
    linkMatchesSelectedTag(link)
  );
}

function filterGroupLinks(group) {
  return group.links.filter((link) =>
    matchesSearch([link.title, link.notes, link.url, ...(link.tags || [])], state.searchTerm) &&
    linkMatchesSelectedTag(link)
  );
}

function getActiveCollection() {
  return state.collections.find((collection) => collection.id === state.activeCollectionId) || null;
}

function getVisibleCollections() {
  return state.collections.filter((collection) => {
    if (matchesSearch([collection.name], state.searchTerm)) {
      return true;
    }

    return collection.groups.some((group) => groupMatchesSearch(group, state.searchTerm));
  });
}

function getVisibleGroups(collection) {
  if (!collection) {
    return [];
  }

  return collection.groups.filter((group) => groupMatchesSearch(group, state.searchTerm));
}

function escapeHtml(value) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdownToHtml(text) {
  const escaped = escapeHtml(text);
  const withLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );

  return withLinks
    .split(/\n{2,}/)
    .map((block) => {
      let html = block.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
      html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
      html = html.replace(/\n/g, "<br>");
      return `<p>${html}</p>`;
    })
    .join("");
}

function setVaultUiState() {
  const locked = !state.vaultUnlocked;
  els.securityGate.classList.toggle("hidden", !locked);
  els.lockVaultBtn.classList.toggle("hidden", locked);

  [
    els.importBackupBtn,
    els.exportBackupBtn,
    els.saveCurrentTabBtn,
    els.importWindowBtn,
    els.addLinkBtn,
    els.newCollectionBtn,
    els.newGroupBtn,
    els.editCollectionBtn,
    els.openGroupBtn,
    els.searchInput
  ].forEach((element) => {
    element.disabled = locked;
  });

  if (!state.vaultConfigured) {
    els.securityTitle.textContent = "Create your passphrase";
    els.securityMessage.textContent =
      "All IndexedDB content will be encrypted at rest. Choose a passphrase to initialize the vault.";
  } else {
    els.securityTitle.textContent = "Unlock Session Canvas";
    els.securityMessage.textContent =
      "Enter your passphrase to decrypt your saved collections, groups, links, tags, and notes.";
  }
}

async function refreshCurrentTabCount() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  state.currentTabCount = tabs.length;
  els.browserTabCount.textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
}

async function refreshData() {
  const vaultStatus = await getVaultStatus();
  state.vaultConfigured = vaultStatus.configured;
  state.vaultUnlocked = vaultStatus.unlocked;
  setVaultUiState();

  if (!state.vaultUnlocked) {
    state.collections = [];
    state.tags = [];
    render();
    return;
  }

  await ensureDefaultData();
  const [collections, tags] = await Promise.all([getSnapshot(), getAllTags()]);
  state.collections = collections;
  state.tags = tags;

  if (
    !state.activeCollectionId ||
    !state.collections.some((collection) => collection.id === state.activeCollectionId)
  ) {
    state.activeCollectionId = state.collections[0]?.id || null;
  }

  if (
    state.selectedTag &&
    !state.tags.some((entry) => entry.tag.toLowerCase() === state.selectedTag.toLowerCase())
  ) {
    state.selectedTag = "";
  }

  render();
}

function populateGroupSelect() {
  const activeCollection = getActiveCollection();
  const previous = Number(els.linkGroup.value);
  els.linkGroup.innerHTML = "";

  const groups = activeCollection?.groups || [];
  groups.forEach((group, index) => {
    const option = document.createElement("option");
    option.value = String(group.id);
    option.textContent = group.name;
    option.selected = previous ? group.id === previous : index === 0;
    els.linkGroup.append(option);
  });
}

function populateCollectionSelect() {
  const previous = Number(els.groupCollection.value) || state.activeCollectionId;
  els.groupCollection.innerHTML = "";

  state.collections.forEach((collection) => {
    const option = document.createElement("option");
    option.value = String(collection.id);
    option.textContent = collection.name;
    option.selected = collection.id === previous;
    els.groupCollection.append(option);
  });
}

function renderNav() {
  els.collectionNav.innerHTML = "";

  for (const collection of getVisibleCollections()) {
    const button = document.createElement("button");
    button.className = `group-nav-item${collection.id === state.activeCollectionId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="group-dot" style="background:${collection.color}"></span>
      <div>
        <div class="group-nav-item-title">${collection.name}</div>
        <small>${relativeTime(collection.updatedAt)}</small>
      </div>
    `;

    button.addEventListener("click", () => {
      state.activeCollectionId = collection.id;
      render();
    });

    els.collectionNav.append(button);
  }
}

function renderHero() {
  const activeCollection = getActiveCollection();
  if (!activeCollection) {
    els.heroTitle.textContent = "Collections";
    els.heroMeta.textContent = state.vaultUnlocked ? "0 groups" : "Vault locked";
    els.heroBadge.style.background = "transparent";
    return;
  }

  const visibleGroups = getVisibleGroups(activeCollection);
  const visibleLinkCount = visibleGroups.reduce((count, group) => count + filterGroupLinks(group).length, 0);
  els.heroTitle.textContent = activeCollection.name;
  els.heroMeta.textContent = `${visibleGroups.length} group${visibleGroups.length === 1 ? "" : "s"} · ${visibleLinkCount} link${visibleLinkCount === 1 ? "" : "s"} · ${relativeTime(activeCollection.updatedAt)}`;
  els.heroBadge.style.background = activeCollection.color;
}

function renderTagFilters() {
  els.tagFilterChips.innerHTML = "";
  if (!state.vaultUnlocked) {
    return;
  }

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `tag-filter-chip${state.selectedTag ? "" : " active"}`;
  allButton.textContent = "All tags";
  allButton.addEventListener("click", () => {
    state.selectedTag = "";
    render();
  });
  els.tagFilterChips.append(allButton);

  state.tags.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag-filter-chip${state.selectedTag.toLowerCase() === entry.tag.toLowerCase() ? " active" : ""}`;
    button.textContent = `${entry.tag} (${entry.count})`;
    button.addEventListener("click", () => {
      state.selectedTag = entry.tag;
      render();
    });
    els.tagFilterChips.append(button);
  });
}

function appendTagToInput(tag) {
  const currentTags = els.linkTags.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!currentTags.some((value) => value.toLowerCase() === tag.toLowerCase())) {
    currentTags.push(tag);
  }

  els.linkTags.value = currentTags.join(", ");
  els.linkTags.focus();
}

function renderTagSuggestions() {
  els.tagSuggestions.innerHTML = "";
  els.existingTagSuggestions.innerHTML = "";

  state.tags.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.tag;
    els.tagSuggestions.append(option);
  });

  state.tags.slice(0, 12).forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "existing-tag-chip";
    button.textContent = entry.tag;
    button.addEventListener("click", () => appendTagToInput(entry.tag));
    els.existingTagSuggestions.append(button);
  });
}

function createLinkCard(link) {
  const fragment = els.linkCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".link-card");
  const favicon = fragment.querySelector(".link-favicon");
  const title = fragment.querySelector(".link-title");
  const url = fragment.querySelector(".link-url");
  const notes = fragment.querySelector(".link-notes");
  const tagRow = fragment.querySelector(".tag-row");
  const pinPill = fragment.querySelector(".pin-pill");

  favicon.src =
    link.favicon ||
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`;
  favicon.onerror = () => {
    favicon.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230c7bdc' fill-opacity='.14'/%3E%3Cpath d='M20 44V20h24v6H26v18h18v-6h4v10H20Z' fill='%23095ca8'/%3E%3Cpath d='M30 18h14v4H30zM38 26h6v4h-6zM34 30h10v4H34z' fill='%23095ca8'/%3E%3C/svg%3E";
  };

  title.textContent = link.title || link.url;
  url.href = link.url;
  url.textContent = link.url;

  if (link.notes) {
    notes.innerHTML = renderMarkdownToHtml(link.notes);
    notes.classList.remove("hidden");
  }

  if (link.pinned) {
    pinPill.classList.remove("hidden");
  }

  (link.tags || []).forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag";
    pill.textContent = tag;
    tagRow.append(pill);
  });

  card.querySelector('[data-action="edit"]').addEventListener("click", () => openLinkDialog(link));
  card.querySelector('[data-action="open"]').addEventListener("click", () =>
    chrome.tabs.create({ url: link.url })
  );
  card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    await deleteLink(link.id);
    await refreshData();
  });

  return fragment;
}

function renderGroups() {
  els.groupsContainer.innerHTML = "";
  if (!state.vaultUnlocked) {
    els.emptyState.classList.add("hidden");
    return;
  }

  const activeCollection = getActiveCollection();
  const groupsToRender = getVisibleGroups(activeCollection);
  let visibleLinkCount = 0;

  for (const group of groupsToRender) {
    const visibleLinks = filterGroupLinks(group).sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
    );
    visibleLinkCount += visibleLinks.length;

    const fragment = els.groupSectionTemplate.content.cloneNode(true);
    const section = fragment.querySelector(".group-section");
    const header = fragment.querySelector(".group-header");
    const title = fragment.querySelector(".group-title");
    const meta = fragment.querySelector(".group-meta");
    const actions = fragment.querySelector(".group-header-actions");
    const linksContainer = fragment.querySelector(".group-links");

    section.dataset.groupId = String(group.id);
    section.classList.toggle("collapsed", Boolean(group.collapsed));
    title.textContent = group.name;
    meta.textContent = `${visibleLinks.length} link${visibleLinks.length === 1 ? "" : "s"} · ${relativeTime(group.updatedAt)}`;

    const openBtn = document.createElement("button");
    openBtn.className = "link-action";
    openBtn.type = "button";
    openBtn.textContent = "Open group";
    openBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      for (const link of visibleLinks) {
        await chrome.tabs.create({ url: link.url, active: false });
      }
    });

    const editBtn = document.createElement("button");
    editBtn.className = "link-action";
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openGroupDialog(group);
    });

    actions.append(openBtn, editBtn);

    header.addEventListener("click", async () => {
      await setGroupCollapsed(group.id, !group.collapsed);
      await refreshData();
    });

    visibleLinks.forEach((link) => linksContainer.append(createLinkCard(link)));
    els.groupsContainer.append(fragment);
  }

  els.emptyState.classList.toggle("hidden", groupsToRender.length > 0 || visibleLinkCount > 0);
}

function render() {
  const visibleCollections = getVisibleCollections();
  if (
    visibleCollections.length > 0 &&
    !visibleCollections.some((collection) => collection.id === state.activeCollectionId)
  ) {
    state.activeCollectionId = visibleCollections[0].id;
  }

  populateCollectionSelect();
  populateGroupSelect();
  renderNav();
  renderHero();
  renderTagFilters();
  renderTagSuggestions();
  renderGroups();
}

function closeDialog(dialog) {
  dialog.close();
}

function openLinkDialog(link = null) {
  const activeCollection = getActiveCollection();
  const fallbackGroupId = activeCollection?.groups[0]?.id || "";
  els.linkDialogTitle.textContent = link ? "Edit link" : "Add link";
  els.linkId.value = link?.id || "";
  els.linkTitle.value = link?.title || "";
  els.linkUrl.value = link?.url || "";
  els.linkNotes.value = link?.notes || "";
  els.linkTags.value = (link?.tags || []).join(", ");
  els.linkPinned.checked = Boolean(link?.pinned);
  populateGroupSelect();
  renderTagSuggestions();
  els.linkGroup.value = String(link?.groupId || fallbackGroupId);
  els.linkDialog.showModal();
}

function snapshotLinkForm() {
  return {
    id: els.linkId.value,
    title: els.linkTitle.value,
    url: els.linkUrl.value,
    notes: els.linkNotes.value,
    tags: els.linkTags.value,
    groupId: els.linkGroup.value,
    pinned: els.linkPinned.checked
  };
}

function restoreLinkForm(snapshot) {
  if (!snapshot) {
    return;
  }

  els.linkId.value = snapshot.id || "";
  els.linkTitle.value = snapshot.title || "";
  els.linkUrl.value = snapshot.url || "";
  els.linkNotes.value = snapshot.notes || "";
  els.linkTags.value = snapshot.tags || "";
  els.linkPinned.checked = Boolean(snapshot.pinned);
  populateGroupSelect();
  if (snapshot.groupId) {
    els.linkGroup.value = snapshot.groupId;
  }
}

function openCollectionDialog(collection = null) {
  els.collectionDialogTitle.textContent = collection ? "Edit collection" : "New collection";
  els.collectionId.value = collection?.id || "";
  els.collectionName.value = collection?.name || "";
  els.collectionColor.value = collection?.color || "#efb907";
  els.deleteCollectionBtn.classList.toggle("hidden", !collection);
  els.collectionDialog.showModal();
}

function openGroupDialog(group = null) {
  els.groupDialogTitle.textContent = group ? "Edit group" : "New group";
  els.groupId.value = group?.id || "";
  els.groupName.value = group?.name || "";
  els.groupColor.value = group?.color || getActiveCollection()?.color || "#efb907";
  populateCollectionSelect();
  els.groupCollection.value = String(group?.collectionId || state.activeCollectionId || "");
  els.deleteGroupBtn.classList.toggle("hidden", !group);
  els.groupDialog.showModal();
}

async function saveCurrentTabToGroup(groupId = null) {
  const activeCollection = getActiveCollection();
  const defaultGroupId = groupId || activeCollection?.groups[0]?.id;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !defaultGroupId) {
    return;
  }

  await saveLink({
    title: tab.title || tab.url,
    url: tab.url,
    notes: "",
    tags: [],
    favicon: tab.favIconUrl || "",
    groupId: defaultGroupId,
    pinned: false
  });

  await refreshData();
}

async function importCurrentWindow(groupId = null) {
  const activeCollection = getActiveCollection();
  const defaultGroupId = groupId || activeCollection?.groups[0]?.id;
  if (!defaultGroupId) {
    return;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  await importLinks(
    tabs
      .filter((tab) => /^https?:/.test(tab.url || ""))
      .map((tab) => ({
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || ""
      })),
    defaultGroupId
  );
  await refreshData();
}

async function openVisibleLinks() {
  const activeCollection = getActiveCollection();
  if (!activeCollection) {
    return;
  }

  for (const group of getVisibleGroups(activeCollection)) {
    for (const link of filterGroupLinks(group)) {
      await chrome.tabs.create({ url: link.url, active: false });
    }
  }
}

async function exportBackup() {
  const backup = await exportBackupData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  anchor.href = blobUrl;
  anchor.download = `session-canvas-backup-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

function attachEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim();
    render();
  });

  els.securityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (state.vaultConfigured) {
        await unlockVault(els.securityPassphrase.value);
      } else {
        await setupPassphrase(els.securityPassphrase.value);
      }
      els.securityPassphrase.value = "";
      await refreshData();
    } catch (error) {
      window.alert(error.message || "Could not unlock vault");
    }
  });

  els.addLinkBtn.addEventListener("click", () => openLinkDialog());
  els.linkNewGroupBtn.addEventListener("click", () => {
    state.resumeLinkDialogAfterGroup = snapshotLinkForm();
    closeDialog(els.linkDialog);
    openGroupDialog();
  });
  els.importBackupBtn.addEventListener("click", () => els.importBackupInput.click());
  els.exportBackupBtn.addEventListener("click", exportBackup);
  els.lockVaultBtn.addEventListener("click", async () => {
    await lockVault();
    await refreshData();
  });
  els.newCollectionBtn.addEventListener("click", () => openCollectionDialog());
  els.newGroupBtn.addEventListener("click", () => openGroupDialog());
  els.editCollectionBtn.addEventListener("click", () => {
    const activeCollection = getActiveCollection();
    if (activeCollection) {
      openCollectionDialog(activeCollection);
    }
  });
  els.saveCurrentTabBtn.addEventListener("click", () => saveCurrentTabToGroup());
  els.importWindowBtn.addEventListener("click", () => importCurrentWindow());
  els.openGroupBtn.addEventListener("click", openVisibleLinks);
  els.thisBrowserBtn.addEventListener("click", () => importCurrentWindow());
  els.importBackupInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const shouldImport = window.confirm(
      "Importing a backup will replace the current saved data. Continue?"
    );
    if (!shouldImport) {
      event.target.value = "";
      return;
    }

    const text = await file.text();
    const parsed = JSON.parse(text);
    await importBackupData(parsed);
    event.target.value = "";
    await refreshData();
  });

  els.linkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveLink({
      id: els.linkId.value ? Number(els.linkId.value) : undefined,
      title: els.linkTitle.value,
      url: els.linkUrl.value,
      notes: els.linkNotes.value,
      tags: els.linkTags.value,
      groupId: Number(els.linkGroup.value),
      pinned: els.linkPinned.checked
    });
    closeDialog(els.linkDialog);
    await refreshData();
  });

  els.collectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.collectionId.value) {
      await updateCollection(Number(els.collectionId.value), {
        name: els.collectionName.value,
        color: els.collectionColor.value
      });
      state.activeCollectionId = Number(els.collectionId.value);
    } else {
      const collection = await createCollection({
        name: els.collectionName.value,
        color: els.collectionColor.value
      });
      await createGroup({
        collectionId: collection.id,
        name: "General",
        color: els.collectionColor.value
      });
      state.activeCollectionId = collection.id;
    }

    closeDialog(els.collectionDialog);
    await refreshData();
  });

  els.groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    let createdGroupId = null;
    if (els.groupId.value) {
      await updateGroup(Number(els.groupId.value), {
        name: els.groupName.value,
        color: els.groupColor.value,
        collectionId: Number(els.groupCollection.value)
      });
      createdGroupId = Number(els.groupId.value);
    } else {
      const group = await createGroup({
        collectionId: Number(els.groupCollection.value),
        name: els.groupName.value,
        color: els.groupColor.value
      });
      createdGroupId = group.id;
    }

    state.activeCollectionId = Number(els.groupCollection.value);
    closeDialog(els.groupDialog);
    await refreshData();

    if (state.resumeLinkDialogAfterGroup) {
      const snapshot = state.resumeLinkDialogAfterGroup;
      state.resumeLinkDialogAfterGroup = false;
      openLinkDialog();
      restoreLinkForm({
        ...snapshot,
        groupId: String(createdGroupId || snapshot.groupId || "")
      });
    }
  });

  els.deleteCollectionBtn.addEventListener("click", async () => {
    const id = Number(els.collectionId.value);
    if (!id) {
      return;
    }
    await deleteCollection(id);
    closeDialog(els.collectionDialog);
    await refreshData();
  });

  els.deleteGroupBtn.addEventListener("click", async () => {
    const id = Number(els.groupId.value);
    if (!id) {
      return;
    }
    await deleteGroup(id);
    closeDialog(els.groupDialog);
    await refreshData();
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.querySelector(`#${button.getAttribute("data-close-dialog")}`);
      closeDialog(dialog);
    });
  });
}

async function init() {
  attachEvents();
  await refreshCurrentTabCount();
  await refreshData();
}

init();
