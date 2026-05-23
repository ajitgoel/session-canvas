import {
  createCollection,
  createGroup,
  deleteCollection,
  deleteGroup,
  deleteLink,
  ensureDefaultData,
  exportBackupData,
  getAllTags,
  getDriveSyncSettings,
  getSnapshot,
  getVaultStatus,
  importBackupData,
  importLinks,
  lockVault,
  saveLink,
  setGroupCollapsed,
  setupPassphrase,
  unlockVault,
  updateDriveSyncSettings,
  updateCollection,
  updateGroup
} from "./db.js";
import {
  connectGoogleDrive,
  downloadDriveBackup,
  findDriveBackupFile,
  getGoogleDriveRedirectUri,
  refreshGoogleAccessToken,
  uploadDriveBackup
} from "./drive-sync.js";

const state = {
  collections: [],
  tags: [],
  activeCollectionId: null,
  searchTerm: "",
  selectedTag: "",
  currentTabCount: 0,
  pendingCompose: null,
  vaultConfigured: false,
  vaultUnlocked: false,
  activeView: "collections",
  driveSettings: null,
  syncInFlight: false,
  hasAutoSyncedThisUnlock: false,
  pendingConflictResolver: null
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  saveCurrentTabBtn: document.querySelector("#saveCurrentTabBtn"),
  importWindowBtn: document.querySelector("#importWindowBtn"),
  lockVaultBtn: document.querySelector("#lockVaultBtn"),
  addLinkBtn: document.querySelector("#addLinkBtn"),
  newCollectionBtn: document.querySelector("#newCollectionBtn"),
  collectionNav: document.querySelector("#collectionNav"),
  securityGate: document.querySelector("#securityGate"),
  securityTitle: document.querySelector("#securityTitle"),
  securityMessage: document.querySelector("#securityMessage"),
  securityForm: document.querySelector("#securityForm"),
  securityPassphrase: document.querySelector("#securityPassphrase"),
  collectionsTabBtn: document.querySelector("#collectionsTabBtn"),
  settingsTabBtn: document.querySelector("#settingsTabBtn"),
  collectionsView: document.querySelector("#collectionsView"),
  settingsView: document.querySelector("#settingsView"),
  heroBadge: document.querySelector("#heroBadge"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  tagFilterChips: document.querySelector("#tagFilterChips"),
  newGroupBtn: document.querySelector("#newGroupBtn"),
  deleteCollectionQuickBtn: document.querySelector("#deleteCollectionQuickBtn"),
  openGroupBtn: document.querySelector("#openGroupBtn"),
  groupsContainer: document.querySelector("#groupsContainer"),
  emptyState: document.querySelector("#emptyState"),
  quickAddEyebrow: document.querySelector("#quickAddEyebrow"),
  quickAddHeading: document.querySelector("#quickAddHeading"),
  quickAddCancelEditBtn: document.querySelector("#quickAddCancelEditBtn"),
  quickAddSubmitBtn: document.querySelector("#quickAddSubmitBtn"),
  quickAddForm: document.querySelector("#quickAddForm"),
  quickAddLinkId: document.querySelector("#quickAddLinkId"),
  quickAddDetailsTabBtn: document.querySelector("#quickAddDetailsTabBtn"),
  quickAddNotesTabBtn: document.querySelector("#quickAddNotesTabBtn"),
  quickAddDetailsPanel: document.querySelector("#quickAddDetailsPanel"),
  quickAddNotesPanel: document.querySelector("#quickAddNotesPanel"),
  quickAddTitle: document.querySelector("#quickAddTitle"),
  quickAddUrl: document.querySelector("#quickAddUrl"),
  quickAddTagInput: document.querySelector("#quickAddTagInput"),
  quickSelectedTags: document.querySelector("#quickSelectedTags"),
  quickExistingTagSuggestions: document.querySelector("#quickExistingTagSuggestions"),
  quickAddGroupInput: document.querySelector("#quickAddGroupInput"),
  quickExistingGroupSuggestions: document.querySelector("#quickExistingGroupSuggestions"),
  quickAddPinned: document.querySelector("#quickAddPinned"),
  quickAddNotes: document.querySelector("#quickAddNotes"),
  linkDialog: document.querySelector("#linkDialog"),
  linkDialogTitle: document.querySelector("#linkDialogTitle"),
  linkForm: document.querySelector("#linkForm"),
  linkDetailsTabBtn: document.querySelector("#linkDetailsTabBtn"),
  linkNotesTabBtn: document.querySelector("#linkNotesTabBtn"),
  linkDetailsPanel: document.querySelector("#linkDetailsPanel"),
  linkNotesPanel: document.querySelector("#linkNotesPanel"),
  linkId: document.querySelector("#linkId"),
  linkTitle: document.querySelector("#linkTitle"),
  linkUrl: document.querySelector("#linkUrl"),
  linkNotes: document.querySelector("#linkNotes"),
  linkTagInput: document.querySelector("#linkTagInput"),
  selectedTags: document.querySelector("#selectedTags"),
  tagSuggestions: document.querySelector("#tagSuggestions"),
  existingTagSuggestions: document.querySelector("#existingTagSuggestions"),
  linkGroupInput: document.querySelector("#linkGroupInput"),
  groupSuggestions: document.querySelector("#groupSuggestions"),
  existingGroupSuggestions: document.querySelector("#existingGroupSuggestions"),
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
  importBackupInput: document.querySelector("#importBackupInput"),
  settingsExportBackupBtn: document.querySelector("#settingsExportBackupBtn"),
  settingsImportBackupBtn: document.querySelector("#settingsImportBackupBtn"),
  googleClientIdInput: document.querySelector("#googleClientIdInput"),
  googleRedirectUri: document.querySelector("#googleRedirectUri"),
  googleAutoSyncInput: document.querySelector("#googleAutoSyncInput"),
  connectDriveBtn: document.querySelector("#connectDriveBtn"),
  disconnectDriveBtn: document.querySelector("#disconnectDriveBtn"),
  syncNowBtn: document.querySelector("#syncNowBtn"),
  driveConnectionStatus: document.querySelector("#driveConnectionStatus"),
  driveLastSyncAt: document.querySelector("#driveLastSyncAt"),
  driveLastSyncStatus: document.querySelector("#driveLastSyncStatus"),
  syncHistoryEmpty: document.querySelector("#syncHistoryEmpty"),
  syncHistoryList: document.querySelector("#syncHistoryList"),
  syncConflictDialog: document.querySelector("#syncConflictDialog"),
  syncConflictMessage: document.querySelector("#syncConflictMessage"),
  syncConflictLocal: document.querySelector("#syncConflictLocal"),
  syncConflictRemote: document.querySelector("#syncConflictRemote"),
  cancelConflictBtn: document.querySelector("#cancelConflictBtn"),
  useRemoteConflictBtn: document.querySelector("#useRemoteConflictBtn"),
  keepLocalConflictBtn: document.querySelector("#keepLocalConflictBtn")
};

let draftTags = [];
let quickDraftTags = [];
let notesEditor = null;
let quickNotesEditor = null;

function setQuickAddMode(editing = false) {
  els.quickAddEyebrow.textContent = editing ? "Edit link" : "Quick add";
  els.quickAddHeading.textContent = editing ? "Edit link" : "Add link";
  els.quickAddSubmitBtn.textContent = editing ? "Save changes" : "Save link";
  els.quickAddCancelEditBtn.classList.toggle("hidden", !editing);
}

function setLinkDialogTab(tab) {
  const showingNotes = tab === "notes";
  els.linkDetailsTabBtn.classList.toggle("active", !showingNotes);
  els.linkNotesTabBtn.classList.toggle("active", showingNotes);
  els.linkDetailsPanel.classList.toggle("active", !showingNotes);
  els.linkNotesPanel.classList.toggle("active", showingNotes);

  if (showingNotes && notesEditor) {
    setTimeout(() => notesEditor.codemirror.refresh(), 0);
  }
}

function setQuickAddTab(tab) {
  const showingNotes = tab === "notes";
  els.quickAddDetailsTabBtn.classList.toggle("active", !showingNotes);
  els.quickAddNotesTabBtn.classList.toggle("active", showingNotes);
  els.quickAddDetailsPanel.classList.toggle("active", !showingNotes);
  els.quickAddNotesPanel.classList.toggle("active", showingNotes);

  if (showingNotes) {
    ensureQuickNotesEditor();
    if (quickNotesEditor) {
      setTimeout(() => quickNotesEditor.codemirror.refresh(), 0);
    }
  }
}

function requireVisibleValue(input, value, tabSetter, message) {
  if (value.trim()) {
    return true;
  }

  tabSetter("details");
  input.focus();
  window.alert(message);
  return false;
}

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

function formatLastSync(date) {
  if (!date) {
    return "Never";
  }

  return new Date(date).toLocaleString();
}

function buildSyncHistoryEntry(action, detail, extra = {}) {
  return {
    at: Date.now(),
    action,
    detail,
    localUpdatedAt: Number(extra.localUpdatedAt || 0),
    remoteUpdatedAt: Number(extra.remoteUpdatedAt || 0)
  };
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
    els.saveCurrentTabBtn,
    els.importWindowBtn,
    els.addLinkBtn,
    els.newCollectionBtn,
    els.newGroupBtn,
    els.openGroupBtn,
    els.searchInput,
    els.collectionsTabBtn,
    els.settingsTabBtn,
    els.settingsExportBackupBtn,
    els.settingsImportBackupBtn,
    els.googleAutoSyncInput,
    els.connectDriveBtn,
    els.disconnectDriveBtn,
    els.syncNowBtn,
    els.quickAddDetailsTabBtn,
    els.quickAddNotesTabBtn,
    els.quickAddTitle,
    els.quickAddUrl,
    els.quickAddTagInput,
    els.quickAddGroupInput,
    els.quickAddPinned,
    els.quickAddNotes
  ].filter(Boolean).forEach((element) => {
    element.disabled = locked;
  });

  els.googleClientIdInput.disabled = locked;

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

function renderView() {
  const showingSettings = state.activeView === "settings";
  els.collectionsTabBtn.classList.toggle("active", !showingSettings);
  els.settingsTabBtn.classList.toggle("active", showingSettings);
  els.collectionsView.classList.toggle("hidden", showingSettings);
  els.settingsView.classList.toggle("hidden", !showingSettings);
}

function renderDriveSettings() {
  const settings = state.driveSettings || {
    clientId: "",
    refreshToken: "",
    fileId: "",
    autoSync: false,
    lastSyncedVaultUpdatedAt: 0,
    lastSyncAt: 0,
    lastSyncStatus: "Not connected",
    history: []
  };
  const connected = Boolean(settings.refreshToken);

  els.googleRedirectUri.textContent = getGoogleDriveRedirectUri();
  if (document.activeElement !== els.googleClientIdInput) {
    els.googleClientIdInput.value = settings.clientId || "";
  }
  els.googleAutoSyncInput.checked = Boolean(settings.autoSync);
  els.driveConnectionStatus.textContent = connected ? "Connected" : "Not connected";
  els.driveLastSyncAt.textContent = formatLastSync(settings.lastSyncAt);
  els.driveLastSyncStatus.textContent = settings.lastSyncStatus || "Not connected";
  els.connectDriveBtn.textContent = connected ? "Reconnect Google Drive" : "Connect Google Drive";
  els.disconnectDriveBtn.disabled = !connected || !state.vaultUnlocked || state.syncInFlight;
  els.syncNowBtn.disabled = !connected || !state.vaultUnlocked || state.syncInFlight;

  els.syncHistoryList.innerHTML = "";
  const history = settings.history || [];
  els.syncHistoryEmpty.classList.toggle("hidden", history.length > 0);

  history.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "sync-history-item";

    const title = document.createElement("div");
    title.className = "sync-history-title";
    title.textContent = entry.action;

    const meta = document.createElement("div");
    meta.className = "sync-history-meta";
    meta.textContent = formatLastSync(entry.at);

    const detail = document.createElement("div");
    detail.className = "sync-history-detail";
    detail.textContent = entry.detail || "";

    item.append(title, meta);
    if (entry.detail) {
      item.append(detail);
    }

    els.syncHistoryList.append(item);
  });
}

async function refreshCurrentTabCount() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  state.currentTabCount = tabs.length;
}

async function refreshData() {
  const vaultStatus = await getVaultStatus();
  state.vaultConfigured = vaultStatus.configured;
  state.vaultUnlocked = vaultStatus.unlocked;
  setVaultUiState();

  if (!state.vaultUnlocked) {
    state.collections = [];
    state.tags = [];
    state.driveSettings = null;
    state.hasAutoSyncedThisUnlock = false;
    render();
    return;
  }

  await ensureDefaultData();
  const [collections, tags, driveSettings] = await Promise.all([
    getSnapshot(),
    getAllTags(),
    getDriveSyncSettings()
  ]);
  state.collections = collections;
  state.tags = tags;
  state.driveSettings = driveSettings;

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

  if (state.driveSettings.autoSync && !state.hasAutoSyncedThisUnlock) {
    state.hasAutoSyncedThisUnlock = true;
    await performDriveSync({ reason: "Auto sync on unlock" });
  }

  if (state.pendingCompose) {
    const compose = state.pendingCompose;
    state.pendingCompose = null;
    openLinkDialog(compose);
  }
}

function populateGroupSelect() {
  const activeCollection = getActiveCollection();
  const groups = activeCollection?.groups || [];
  const previous = els.linkGroupInput.value.trim();
  els.groupSuggestions.innerHTML = "";

  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.name;
    option.textContent = group.name;
    els.groupSuggestions.append(option);
  });

  if (!previous && groups[0]) {
    els.linkGroupInput.value = groups[0].name;
  }
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
    button.className = `collection-pill${collection.id === state.activeCollectionId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="group-dot" style="background:${collection.color}"></span>
      <div>
        <div class="collection-pill-title inline-editable">${collection.name}</div>
      </div>
    `;

    button.addEventListener("click", (event) => {
      if (event.target.closest(".collection-pill-title, .inline-rename-input")) {
        return;
      }
      if (document.activeElement?.classList?.contains("inline-rename-input")) {
        return;
      }
      state.activeCollectionId = collection.id;
      render();
    });

    const title = button.querySelector(".collection-pill-title");
    attachInlineRename(title, "collection", collection);
    title.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (title.__openTimer) {
        window.clearTimeout(title.__openTimer);
      }
      title.__openTimer = window.setTimeout(() => {
        state.activeCollectionId = collection.id;
        render();
        title.__openTimer = null;
      }, 320);
    });

    els.collectionNav.append(button);
  }
}

function renderHero() {
  const activeCollection = getActiveCollection();
  if (!activeCollection) {
    els.heroTitle.textContent = "Collections";
    els.heroMeta.textContent = "";
    els.heroBadge.style.background = "transparent";
    els.deleteCollectionQuickBtn.disabled = true;
    return;
  }

  els.heroTitle.textContent = activeCollection.name;
  els.heroMeta.textContent = "";
  els.heroBadge.style.background = activeCollection.color;
  els.deleteCollectionQuickBtn.disabled = false;
  attachInlineRename(els.heroTitle, "collection", activeCollection);
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
  const normalized = tag.trim();
  if (!normalized) {
    return;
  }
  if (!draftTags.some((value) => value.toLowerCase() === normalized.toLowerCase())) {
    draftTags.push(normalized);
  }
  renderSelectedTags();
  els.linkTagInput.value = "";
  els.linkTagInput.focus();
}

function appendQuickTag(tag) {
  const normalized = tag.trim();
  if (!normalized) {
    return;
  }
  if (!quickDraftTags.some((value) => value.toLowerCase() === normalized.toLowerCase())) {
    quickDraftTags.push(normalized);
  }
  renderQuickSelectedTags();
  els.quickAddTagInput.value = "";
  els.quickAddTagInput.focus();
}

function removeQuickTag(tag) {
  quickDraftTags = quickDraftTags.filter((value) => value.toLowerCase() !== tag.toLowerCase());
  renderQuickSelectedTags();
}

function removeDraftTag(tag) {
  draftTags = draftTags.filter((value) => value.toLowerCase() !== tag.toLowerCase());
  renderSelectedTags();
}

function renderSelectedTags() {
  els.selectedTags.innerHTML = "";
  draftTags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "selected-tag-chip";
    chip.textContent = `${tag} ×`;
    chip.addEventListener("click", () => removeDraftTag(tag));
    els.selectedTags.append(chip);
  });
}

function renderQuickSelectedTags() {
  els.quickSelectedTags.innerHTML = "";
  quickDraftTags.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "selected-tag-chip";
    chip.textContent = `${tag} ×`;
    chip.addEventListener("click", () => removeQuickTag(tag));
    els.quickSelectedTags.append(chip);
  });
}

function renderTagSuggestions() {
  els.tagSuggestions.innerHTML = "";
  els.existingTagSuggestions.innerHTML = "";
  els.quickExistingTagSuggestions.innerHTML = "";

  state.tags.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.tag;
    els.tagSuggestions.append(option);
  });

  state.tags.slice(0, 12).forEach((entry) => {
    const buildChip = (handler, container) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "existing-tag-chip";
      button.textContent = entry.tag;
      button.addEventListener("click", handler);
      container.append(button);
    };

    buildChip(() => appendTagToInput(entry.tag), els.existingTagSuggestions);
    buildChip(() => appendQuickTag(entry.tag), els.quickExistingTagSuggestions);
  });
}

function renderGroupSuggestions() {
  els.existingGroupSuggestions.innerHTML = "";
  els.quickExistingGroupSuggestions.innerHTML = "";
  const activeCollection = getActiveCollection();
  if (!activeCollection) {
    return;
  }

  activeCollection.groups.forEach((group) => {
    const makeChip = (targetInput, targetContainer) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "existing-tag-chip";
      button.textContent = group.name;
      button.addEventListener("click", () => {
        targetInput.value = group.name;
        targetInput.focus();
      });
      targetContainer.append(button);
    };

    makeChip(els.linkGroupInput, els.existingGroupSuggestions);
    makeChip(els.quickAddGroupInput, els.quickExistingGroupSuggestions);
  });
}

function setQuickAddDefaults() {
  const activeCollection = getActiveCollection();
  const firstGroup = activeCollection?.groups[0]?.name || "";
  if (!els.quickAddGroupInput.value.trim()) {
    els.quickAddGroupInput.value = firstGroup;
  }
}

function resetQuickAddForm(prefill = {}) {
  els.quickAddLinkId.value = prefill.id || "";
  els.quickAddTitle.value = prefill.title || "";
  els.quickAddUrl.value = prefill.url || "";
  els.quickAddPinned.checked = Boolean(prefill.pinned);
  if (quickNotesEditor) {
    quickNotesEditor.value(prefill.notes || "");
  } else {
    els.quickAddNotes.value = prefill.notes || "";
  }
  quickDraftTags = [...(prefill.tags || [])];
  renderQuickSelectedTags();
  els.quickAddGroupInput.value = prefill.groupName || "";
  setQuickAddDefaults();
  setQuickAddTab("details");
  setQuickAddMode(Boolean(prefill.id));
}

function editLinkInComposer(link) {
  resetQuickAddForm({
    id: link.id,
    title: link.title || "",
    url: link.url || "",
    notes: link.notes || "",
    tags: link.tags || [],
    groupName: link.groupName || "",
    pinned: Boolean(link.pinned)
  });
  els.quickAddTitle.focus();
  els.quickAddTitle.select();
}

async function renameInline(kind, entity, nextName) {
  const name = nextName.trim();
  const currentName = entity.name || entity.title || "";
  if (!name || name === currentName) {
    return;
  }

  if (kind === "collection") {
    await updateCollection(entity.id, { name });
  } else if (kind === "group") {
    await updateGroup(entity.id, { name });
  } else if (kind === "link") {
    await saveLink({
      ...entity,
      title: name
    });
  }

  await refreshData();
  await syncIfEnabled(`${kind} renamed`);
}

function attachInlineRename(element, kind, entity, options = {}) {
  element.ondblclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (element.__openTimer) {
      window.clearTimeout(element.__openTimer);
      element.__openTimer = null;
    }
    const input = document.createElement("input");
    input.value = entity.name || entity.title || "";
    input.className = "inline-rename-input";
    const commit = async () => {
      const value = input.value;
      input.replaceWith(element);
      await renameInline(kind, entity, value);
    };
    const cancel = () => input.replaceWith(element);

    input.addEventListener("keydown", async (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        await commit();
      } else if (keyEvent.key === "Escape") {
        cancel();
      }
    });
    input.addEventListener("blur", commit, { once: true });
    element.replaceWith(input);
    input.focus();
    input.select();
  };

  if (options.singleClick) {
    element.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    };
  } else {
    element.onclick = null;
  }
}

function createLinkCard(link) {
  const fragment = els.linkCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".link-card");
  const favicon = fragment.querySelector(".link-favicon");
  const title = fragment.querySelector(".link-title");
  const separator = fragment.querySelector(".link-separator");
  const url = fragment.querySelector(".link-url");
  const tagRow = fragment.querySelector(".tag-row");
  const pinPill = fragment.querySelector(".pin-pill");
  const hasUrl = Boolean(link.url);

  favicon.src = hasUrl
    ? link.favicon ||
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`
    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230c7bdc' fill-opacity='.14'/%3E%3Cpath d='M18 18h28a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4Zm4 8v2h20v-2Zm0 6v2h20v-2Zm0 6v2h14v-2Z' fill='%23095ca8'/%3E%3C/svg%3E";
  favicon.onerror = () => {
    favicon.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230c7bdc' fill-opacity='.14'/%3E%3Cpath d='M20 44V20h24v6H26v18h18v-6h4v10H20Z' fill='%23095ca8'/%3E%3Cpath d='M30 18h14v4H30zM38 26h6v4h-6zM34 30h10v4H34z' fill='%23095ca8'/%3E%3C/svg%3E";
  };

  title.textContent = link.title || link.url || "Untitled note";
  url.href = hasUrl ? link.url : "#";
  url.textContent = hasUrl ? link.url.replace(/^https?:\/\//, "") : "";
  separator.classList.toggle("hidden", !hasUrl);
  url.classList.toggle("hidden", !hasUrl);
  title.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasUrl) {
      editLinkInComposer(link);
      return;
    }
    if (title.__openTimer) {
      window.clearTimeout(title.__openTimer);
    }
    title.__openTimer = window.setTimeout(() => {
      chrome.tabs.create({ url: link.url });
      title.__openTimer = null;
    }, 320);
  });

  if (link.pinned) {
    pinPill.classList.remove("hidden");
  }

  (link.tags || []).forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag";
    pill.textContent = tag;
    tagRow.append(pill);
  });

  attachInlineRename(title, "link", link);
  card.querySelector('[data-action="edit"]').addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    editLinkInComposer(link);
  });
  card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    await deleteLink(link.id);
    await refreshData();
    await syncIfEnabled("Link deleted");
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
    meta.textContent = "";

    attachInlineRename(title, "group", group);

    const addBtn = document.createElement("button");
    addBtn.className = "link-action";
    addBtn.type = "button";
    addBtn.textContent = "Add here";
    addBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      els.quickAddGroupInput.value = group.name;
      els.quickAddTitle.focus();
    });

    const openBtn = document.createElement("button");
    openBtn.className = "link-action";
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      for (const link of visibleLinks) {
        if (!link.url) {
          continue;
        }
        await chrome.tabs.create({ url: link.url, active: false });
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "link-action danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete group";
    deleteBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const shouldDelete = window.confirm(
        `Delete the group "${group.name}"? Links in it will be moved to another group in the same collection.`
      );
      if (!shouldDelete) {
        return;
      }
      await deleteGroup(group.id);
      await refreshData();
      await syncIfEnabled("Group deleted");
    });

    actions.append(addBtn, openBtn, deleteBtn);

    header.addEventListener("click", async (event) => {
      if (event.target.closest(".inline-editable, .inline-rename-input, .group-header-actions")) {
        return;
      }
      await setGroupCollapsed(group.id, !group.collapsed);
      await refreshData();
      await syncIfEnabled("Group collapse updated");
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
  renderView();
  renderNav();
  renderHero();
  renderTagFilters();
  renderTagSuggestions();
  renderGroupSuggestions();
  renderDriveSettings();
  renderSelectedTags();
  renderQuickSelectedTags();
  renderGroups();
  setQuickAddDefaults();
}

function closeDialog(dialog) {
  dialog.close();
}

function openLinkDialog(link = null) {
  const activeCollection = getActiveCollection();
  const fallbackGroupName = activeCollection?.groups[0]?.name || "";
  els.linkDialogTitle.textContent = link ? "Edit link" : "Add link";
  els.linkId.value = link?.id || "";
  els.linkTitle.value = link?.title || "";
  els.linkUrl.value = link?.url || "";
  ensureNotesEditor();
  if (notesEditor) {
    notesEditor.value(link?.notes || "");
    setTimeout(() => notesEditor.codemirror.refresh(), 0);
  } else {
    els.linkNotes.value = link?.notes || "";
  }
  setLinkDialogTab("details");
  draftTags = [...(link?.tags || [])];
  els.linkPinned.checked = Boolean(link?.pinned);
  populateGroupSelect();
  renderTagSuggestions();
  renderGroupSuggestions();
  renderSelectedTags();
  if (link?.groupName) {
    els.linkGroupInput.value = link.groupName;
  } else if (link?.groupId) {
    const group = activeCollection?.groups.find((entry) => entry.id === link.groupId);
    els.linkGroupInput.value = group?.name || fallbackGroupName;
  } else {
    els.linkGroupInput.value = fallbackGroupName;
  }
  els.linkDialog.showModal();
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

function randomGroupColor() {
  const palette = ["#efb907", "#1c86e2", "#ef6c3b", "#2f9d67", "#8c61ff", "#cc5577", "#168aad"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function ensureNotesEditor() {
  if (notesEditor || !window.EasyMDE) {
    return;
  }

  notesEditor = new window.EasyMDE({
    element: els.linkNotes,
    autoDownloadFontAwesome: false,
    spellChecker: false,
    status: false,
    minHeight: "160px",
    sideBySideFullscreen: false,
    placeholder: "Write notes in Markdown",
    toolbar: [
      "bold",
      "italic",
      "heading",
      "|",
      "quote",
      "unordered-list",
      "ordered-list",
      "|",
      "link",
      "code",
      "table",
      "|",
      "preview",
      "side-by-side",
      "fullscreen"
    ]
  });

  // Open in split editor/preview mode by default.
  notesEditor.toggleSideBySide();
}

function ensureQuickNotesEditor() {
  if (quickNotesEditor || !window.EasyMDE) {
    return;
  }

  quickNotesEditor = new window.EasyMDE({
    element: els.quickAddNotes,
    autoDownloadFontAwesome: false,
    spellChecker: false,
    status: false,
    minHeight: "220px",
    sideBySideFullscreen: false,
    placeholder: "Write notes in Markdown",
    toolbar: [
      "bold",
      "italic",
      "heading",
      "|",
      "quote",
      "unordered-list",
      "ordered-list",
      "|",
      "link",
      "code",
      "table",
      "|",
      "preview",
      "side-by-side"
    ]
  });

  quickNotesEditor.toggleSideBySide();
}

async function resolveGroupIdFromInput() {
  const activeCollection = getActiveCollection();
  const typedName = els.linkGroupInput.value.trim();

  if (!activeCollection) {
    throw new Error("No active collection");
  }
  if (!typedName) {
    throw new Error("Please choose or type a group");
  }

  const existing = activeCollection.groups.find(
    (group) => group.name.trim().toLowerCase() === typedName.toLowerCase()
  );
  if (existing) {
    return existing.id;
  }

  const created = await createGroup({
    collectionId: activeCollection.id,
    name: typedName,
    color: randomGroupColor()
  });
  return created.id;
}

async function resolveQuickGroupId() {
  const activeCollection = getActiveCollection();
  const typedName = els.quickAddGroupInput.value.trim();

  if (!activeCollection) {
    throw new Error("No active collection");
  }
  if (!typedName) {
    throw new Error("Please choose or type a group");
  }

  const existing = activeCollection.groups.find(
    (group) => group.name.trim().toLowerCase() === typedName.toLowerCase()
  );
  if (existing) {
    return existing.id;
  }

  const created = await createGroup({
    collectionId: activeCollection.id,
    name: typedName,
    color: randomGroupColor()
  });
  return created.id;
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
  await syncIfEnabled("Current tab saved");
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
  await syncIfEnabled("Window imported");
}

async function openVisibleLinks() {
  const activeCollection = getActiveCollection();
  if (!activeCollection) {
    return;
  }

  for (const group of getVisibleGroups(activeCollection)) {
    for (const link of filterGroupLinks(group)) {
      if (!link.url) {
        continue;
      }
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

async function updateDriveStatus(lastSyncStatus, extra = {}) {
  state.driveSettings = await updateDriveSyncSettings({
    lastSyncStatus,
    ...extra
  }, {
    preserveVaultUpdatedAt: true
  });
  renderDriveSettings();
}

async function appendSyncHistory(action, detail, extra = {}) {
  const history = state.driveSettings?.history || [];
  state.driveSettings = await updateDriveSyncSettings({
    history: [buildSyncHistoryEntry(action, detail, extra), ...history].slice(0, 8)
  }, {
    preserveVaultUpdatedAt: true
  });
  renderDriveSettings();
}

function promptSyncConflict({ localUpdatedAt, remoteUpdatedAt }) {
  els.syncConflictMessage.textContent =
    "Session Canvas found newer changes both on this computer and in Google Drive. Choose which encrypted vault should win.";
  els.syncConflictLocal.textContent = formatLastSync(localUpdatedAt);
  els.syncConflictRemote.textContent = formatLastSync(remoteUpdatedAt);
  els.syncConflictDialog.showModal();

  return new Promise((resolve) => {
    state.pendingConflictResolver = resolve;
  });
}

function resolveSyncConflict(choice) {
  if (state.pendingConflictResolver) {
    state.pendingConflictResolver(choice);
    state.pendingConflictResolver = null;
  }
  if (els.syncConflictDialog.open) {
    els.syncConflictDialog.close();
  }
}

async function performDriveSync({ reason = "Manual sync" } = {}) {
  if (state.syncInFlight) {
    return;
  }

  const settings = state.driveSettings;
  if (!settings?.clientId || !settings?.refreshToken) {
    throw new Error("Connect Google Drive in Settings first");
  }

  state.syncInFlight = true;
  renderDriveSettings();

  try {
    await updateDriveStatus(`${reason} in progress...`);
    const localBackup = await exportBackupData();
    const accessToken = await refreshGoogleAccessToken({
      clientId: settings.clientId,
      refreshToken: settings.refreshToken
    });

    let remoteFile = settings.fileId
      ? { id: settings.fileId }
      : await findDriveBackupFile(accessToken);
    let remoteBackup = null;

    if (remoteFile?.id) {
      remoteBackup = await downloadDriveBackup(accessToken, remoteFile.id);
    }

    const localUpdatedAt = Number(localBackup?.vault?.updatedAt || 0);
    const remoteUpdatedAt = Number(remoteBackup?.vault?.updatedAt || 0);
    const baselineUpdatedAt = Number(settings.lastSyncedVaultUpdatedAt || 0);
    const localChangedSinceBaseline = localUpdatedAt > baselineUpdatedAt;
    const remoteChangedSinceBaseline = remoteUpdatedAt > baselineUpdatedAt;

    if (
      remoteBackup &&
      baselineUpdatedAt > 0 &&
      localChangedSinceBaseline &&
      remoteChangedSinceBaseline &&
      localUpdatedAt !== remoteUpdatedAt
    ) {
      const choice = await promptSyncConflict({
        localUpdatedAt,
        remoteUpdatedAt
      });

      if (choice === "cancel") {
        await updateDriveStatus("Sync cancelled because both computers changed since the last sync");
        await appendSyncHistory(
          "Conflict cancelled",
          "Both local and Google Drive changed since the last sync, and the conflict was left unresolved.",
          { localUpdatedAt, remoteUpdatedAt }
        );
        return;
      }

      if (choice === "remote") {
        await importBackupData(remoteBackup);
        await refreshData();
        if (!state.vaultUnlocked) {
          return;
        }
        state.driveSettings = await updateDriveSyncSettings({
          lastSyncedVaultUpdatedAt: remoteUpdatedAt,
          lastSyncAt: Date.now(),
          lastSyncStatus: "Used the Google Drive version after a sync conflict"
        }, {
          preserveVaultUpdatedAt: true
        });
        await appendSyncHistory(
          "Restored from Google Drive",
          "Used the Google Drive vault after a sync conflict.",
          { localUpdatedAt, remoteUpdatedAt }
        );
        renderDriveSettings();
        return;
      }

      await appendSyncHistory(
        "Kept local vault",
        "Kept the local encrypted vault after a sync conflict and uploaded it to Google Drive.",
        { localUpdatedAt, remoteUpdatedAt }
      );
    }

    if (remoteBackup && remoteUpdatedAt > localUpdatedAt) {
      await importBackupData(remoteBackup);
      await refreshData();
      if (!state.vaultUnlocked) {
        return;
      }
      const refreshedSettings = await getDriveSyncSettings();
      const uploaded = await uploadDriveBackup(
        accessToken,
        remoteBackup,
        remoteFile?.id || refreshedSettings.fileId
      );
      state.driveSettings = await updateDriveSyncSettings({
        fileId: uploaded.id || remoteFile?.id || refreshedSettings.fileId || "",
        lastSyncedVaultUpdatedAt: remoteUpdatedAt,
        lastSyncAt: Date.now(),
        lastSyncStatus: "Downloaded latest encrypted backup from Google Drive"
      }, {
        preserveVaultUpdatedAt: true
      });
      await appendSyncHistory(
        "Downloaded from Google Drive",
        "Applied the newer encrypted backup from Google Drive on this computer.",
        { localUpdatedAt, remoteUpdatedAt }
      );
      renderDriveSettings();
      return;
    }

    const uploaded = await uploadDriveBackup(accessToken, localBackup, remoteFile?.id || settings.fileId);
    state.driveSettings = await updateDriveSyncSettings({
      fileId: uploaded.id || remoteFile?.id || settings.fileId || "",
      lastSyncedVaultUpdatedAt: localUpdatedAt,
      lastSyncAt: Date.now(),
      lastSyncStatus: remoteBackup
        ? "Uploaded latest encrypted backup to Google Drive"
        : "Created encrypted backup in Google Drive"
    }, {
      preserveVaultUpdatedAt: true
    });
    await appendSyncHistory(
      remoteBackup ? "Uploaded to Google Drive" : "Created Drive backup",
      remoteBackup
        ? "Uploaded the latest local encrypted vault to Google Drive."
        : "Created the first encrypted vault backup in Google Drive.",
      { localUpdatedAt, remoteUpdatedAt }
    );
    renderDriveSettings();
  } catch (error) {
    await updateDriveStatus(error.message || "Google Drive sync failed");
    throw error;
  } finally {
    state.syncInFlight = false;
    renderDriveSettings();
  }
}

async function syncIfEnabled(reason) {
  if (!state.vaultUnlocked || !state.driveSettings?.autoSync || !state.driveSettings?.refreshToken) {
    return;
  }

  try {
    await performDriveSync({ reason });
  } catch (error) {
    console.error(error);
  }
}

function attachEvents() {
  els.linkDetailsTabBtn.addEventListener("click", () => setLinkDialogTab("details"));
  els.linkNotesTabBtn.addEventListener("click", () => setLinkDialogTab("notes"));
  els.quickAddDetailsTabBtn.addEventListener("click", () => setQuickAddTab("details"));
  els.quickAddNotesTabBtn.addEventListener("click", () => setQuickAddTab("notes"));

  els.collectionsTabBtn.addEventListener("click", () => {
    state.activeView = "collections";
    renderView();
  });

  els.settingsTabBtn.addEventListener("click", () => {
    state.activeView = "settings";
    renderView();
  });

  els.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim();
    render();
  });

  els.linkTagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      appendTagToInput(els.linkTagInput.value);
    } else if (event.key === "Backspace" && !els.linkTagInput.value && draftTags.length > 0) {
      removeDraftTag(draftTags[draftTags.length - 1]);
    }
  });

  els.linkTagInput.addEventListener("blur", () => {
    appendTagToInput(els.linkTagInput.value);
  });

  els.quickAddTagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      appendQuickTag(els.quickAddTagInput.value);
    } else if (event.key === "Backspace" && !els.quickAddTagInput.value && quickDraftTags.length > 0) {
      removeQuickTag(quickDraftTags[quickDraftTags.length - 1]);
    }
  });

  els.quickAddTagInput.addEventListener("blur", () => {
    appendQuickTag(els.quickAddTagInput.value);
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

  els.addLinkBtn.addEventListener("click", () => {
    resetQuickAddForm();
    els.quickAddTitle.focus();
  });
  els.quickAddCancelEditBtn.addEventListener("click", () => {
    resetQuickAddForm();
  });
  els.settingsImportBackupBtn.addEventListener("click", () => els.importBackupInput.click());
  els.settingsExportBackupBtn.addEventListener("click", exportBackup);
  els.lockVaultBtn.addEventListener("click", async () => {
    await lockVault();
    await refreshData();
  });
  els.newCollectionBtn.addEventListener("click", () => openCollectionDialog());
  els.newGroupBtn.addEventListener("click", () => openGroupDialog());
  els.deleteCollectionQuickBtn.addEventListener("click", async () => {
    const activeCollection = getActiveCollection();
    if (!activeCollection) {
      return;
    }
    const shouldDelete = window.confirm(
      `Delete the collection "${activeCollection.name}"? Its groups will be moved into another collection.`
    );
    if (!shouldDelete) {
      return;
    }
    await deleteCollection(activeCollection.id);
    await refreshData();
    await syncIfEnabled("Collection deleted");
  });
  els.saveCurrentTabBtn.addEventListener("click", () => saveCurrentTabToGroup());
  els.importWindowBtn.addEventListener("click", () => importCurrentWindow());
  els.openGroupBtn.addEventListener("click", openVisibleLinks);
  els.googleClientIdInput.addEventListener("change", async (event) => {
    const clientId = event.target.value.trim();
    state.driveSettings = await updateDriveSyncSettings({
      clientId,
      lastSyncStatus: clientId ? "OAuth client ID saved" : "Not connected"
    }, {
      preserveVaultUpdatedAt: true
    });
    renderDriveSettings();
  });
  els.googleAutoSyncInput.addEventListener("change", async (event) => {
    state.driveSettings = await updateDriveSyncSettings({
      autoSync: event.target.checked
    }, {
      preserveVaultUpdatedAt: true
    });
    renderDriveSettings();
  });
  els.connectDriveBtn.addEventListener("click", async () => {
    try {
      const clientId = els.googleClientIdInput.value.trim();
      const result = await connectGoogleDrive(clientId);
      state.driveSettings = await updateDriveSyncSettings({
        clientId,
        refreshToken: result.refreshToken,
        fileId: "",
        lastSyncedVaultUpdatedAt: 0,
        lastSyncAt: 0,
        lastSyncStatus: "Connected to Google Drive"
      }, {
        preserveVaultUpdatedAt: true
      });
      await appendSyncHistory(
        "Connected Google Drive",
        "Authorized Session Canvas to sync encrypted backups with the selected Google account."
      );
      renderDriveSettings();
      await performDriveSync({ reason: "Initial sync" });
    } catch (error) {
      window.alert(error.message || "Could not connect Google Drive");
    }
  });
  els.disconnectDriveBtn.addEventListener("click", async () => {
    state.driveSettings = await updateDriveSyncSettings({
      refreshToken: "",
      fileId: "",
      autoSync: false,
      lastSyncedVaultUpdatedAt: 0,
      lastSyncAt: 0,
      lastSyncStatus: "Disconnected"
    }, {
      preserveVaultUpdatedAt: true
    });
    await appendSyncHistory(
      "Disconnected Google Drive",
      "Removed the current Google Drive sync connection from this vault."
    );
    renderDriveSettings();
  });
  els.syncNowBtn.addEventListener("click", async () => {
    try {
      await performDriveSync({ reason: "Manual sync" });
    } catch (error) {
      window.alert(error.message || "Sync failed");
    }
  });
  els.keepLocalConflictBtn.addEventListener("click", () => resolveSyncConflict("local"));
  els.useRemoteConflictBtn.addEventListener("click", () => resolveSyncConflict("remote"));
  els.cancelConflictBtn.addEventListener("click", () => resolveSyncConflict("cancel"));
  els.syncConflictDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveSyncConflict("cancel");
  });
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
    if (state.vaultUnlocked) {
      await appendSyncHistory(
        "Imported encrypted backup",
        "Replaced the current local vault with an imported encrypted backup file."
      );
    }
    await syncIfEnabled("Backup import");
  });

  els.quickAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      !requireVisibleValue(
        els.quickAddTitle,
        els.quickAddTitle.value,
        setQuickAddTab,
        "Please enter a title."
      )
    ) {
      return;
    }

    try {
      const groupId = await resolveQuickGroupId();
      await saveLink({
        id: els.quickAddLinkId.value ? Number(els.quickAddLinkId.value) : undefined,
        title: els.quickAddTitle.value,
        url: els.quickAddUrl.value,
        notes: quickNotesEditor ? quickNotesEditor.value() : els.quickAddNotes.value,
        tags: quickDraftTags,
        groupId,
        pinned: els.quickAddPinned.checked
      });
      resetQuickAddForm();
      await refreshData();
      await syncIfEnabled("Link saved");
      els.quickAddTitle.focus();
    } catch (error) {
      window.alert(error.message || "Could not save entry");
    }
  });

  els.linkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      !requireVisibleValue(
        els.linkTitle,
        els.linkTitle.value,
        setLinkDialogTab,
        "Please enter a title."
      )
    ) {
      return;
    }

    try {
      const groupId = await resolveGroupIdFromInput();
      await saveLink({
        id: els.linkId.value ? Number(els.linkId.value) : undefined,
        title: els.linkTitle.value,
        url: els.linkUrl.value,
        notes: notesEditor ? notesEditor.value() : els.linkNotes.value,
        tags: draftTags,
        groupId,
        pinned: els.linkPinned.checked
      });
      draftTags = [];
      closeDialog(els.linkDialog);
      await refreshData();
      await syncIfEnabled("Link saved");
    } catch (error) {
      window.alert(error.message || "Could not save entry");
    }
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
    await syncIfEnabled("Collection saved");
  });

  els.groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.groupId.value) {
      await updateGroup(Number(els.groupId.value), {
        name: els.groupName.value,
        color: els.groupColor.value,
        collectionId: Number(els.groupCollection.value)
      });
    } else {
      await createGroup({
        collectionId: Number(els.groupCollection.value),
        name: els.groupName.value,
        color: els.groupColor.value
      });
    }

    state.activeCollectionId = Number(els.groupCollection.value);
    closeDialog(els.groupDialog);
    await refreshData();
    await syncIfEnabled("Group saved");
  });

  els.deleteCollectionBtn.addEventListener("click", async () => {
    const id = Number(els.collectionId.value);
    if (!id) {
      return;
    }
    const shouldDelete = window.confirm(
      `Delete this collection? Its groups will be moved into another collection.`
    );
    if (!shouldDelete) {
      return;
    }
    await deleteCollection(id);
    closeDialog(els.collectionDialog);
    await refreshData();
    await syncIfEnabled("Collection deleted");
  });

  els.deleteGroupBtn.addEventListener("click", async () => {
    const id = Number(els.groupId.value);
    if (!id) {
      return;
    }
    const shouldDelete = window.confirm(
      `Delete this group? Links in it will be moved to another group in the same collection.`
    );
    if (!shouldDelete) {
      return;
    }
    await deleteGroup(id);
    closeDialog(els.groupDialog);
    await refreshData();
    await syncIfEnabled("Group deleted");
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.querySelector(`#${button.getAttribute("data-close-dialog")}`);
      closeDialog(dialog);
    });
  });
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("compose") === "1") {
    state.pendingCompose = {
      title: params.get("title") || "",
      url: params.get("url") || "",
      notes: "",
      tags: [],
      pinned: false
    };
    window.history.replaceState({}, "", window.location.pathname);
  }
  attachEvents();
  ensureNotesEditor();
  ensureQuickNotesEditor();
  resetQuickAddForm();
  await refreshCurrentTabCount();
  await refreshData();
}

init();
