import {
  createCollection,
  createGroup,
  deleteCollection,
  deleteGroup,
  deleteLink,
  getAllTags,
  ensureDefaultData,
  getSnapshot,
  importLinks,
  saveLink,
  setGroupCollapsed,
  updateCollection,
  updateGroup
} from "./db.js";

const state = {
  collections: [],
  tags: [],
  activeCollectionId: null,
  searchTerm: "",
  selectedTag: "",
  currentTabCount: 0
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  saveCurrentTabBtn: document.querySelector("#saveCurrentTabBtn"),
  importWindowBtn: document.querySelector("#importWindowBtn"),
  addLinkBtn: document.querySelector("#addLinkBtn"),
  thisBrowserBtn: document.querySelector("#thisBrowserBtn"),
  browserTabCount: document.querySelector("#browserTabCount"),
  newCollectionBtn: document.querySelector("#newCollectionBtn"),
  collectionNav: document.querySelector("#collectionNav"),
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
  linkCardTemplate: document.querySelector("#linkCardTemplate")
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

async function refreshCurrentTabCount() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  state.currentTabCount = tabs.length;
  els.browserTabCount.textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
}

async function refreshData() {
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
    els.heroMeta.textContent = "0 groups";
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
    notes.textContent = link.notes;
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

function attachEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim();
    render();
  });

  els.addLinkBtn.addEventListener("click", () => openLinkDialog());
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
