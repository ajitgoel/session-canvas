import {
  createGroup,
  deleteGroup,
  deleteLink,
  ensureDefaultData,
  getAllGroups,
  getSnapshot,
  importLinks,
  saveLink,
  setGroupCollapsed,
  updateGroup
} from "./db.js";

const state = {
  groups: [],
  activeGroupId: null,
  searchTerm: "",
  currentTabCount: 0
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  saveCurrentTabBtn: document.querySelector("#saveCurrentTabBtn"),
  importWindowBtn: document.querySelector("#importWindowBtn"),
  addLinkBtn: document.querySelector("#addLinkBtn"),
  thisBrowserBtn: document.querySelector("#thisBrowserBtn"),
  browserTabCount: document.querySelector("#browserTabCount"),
  newGroupBtn: document.querySelector("#newGroupBtn"),
  groupNav: document.querySelector("#groupNav"),
  heroBadge: document.querySelector("#heroBadge"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  editGroupBtn: document.querySelector("#editGroupBtn"),
  openGroupBtn: document.querySelector("#openGroupBtn"),
  groupsContainer: document.querySelector("#groupsContainer"),
  emptyState: document.querySelector("#emptyState"),
  linkDialog: document.querySelector("#linkDialog"),
  linkDialogTitle: document.querySelector("#linkDialogTitle"),
  linkForm: document.querySelector("#linkForm"),
  linkId: document.querySelector("#linkId"),
  linkTitle: document.querySelector("#linkTitle"),
  linkUrl: document.querySelector("#linkUrl"),
  linkDescription: document.querySelector("#linkDescription"),
  linkNotes: document.querySelector("#linkNotes"),
  linkTags: document.querySelector("#linkTags"),
  linkGroup: document.querySelector("#linkGroup"),
  linkPinned: document.querySelector("#linkPinned"),
  groupDialog: document.querySelector("#groupDialog"),
  groupDialogTitle: document.querySelector("#groupDialogTitle"),
  groupForm: document.querySelector("#groupForm"),
  groupId: document.querySelector("#groupId"),
  groupName: document.querySelector("#groupName"),
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

function groupMatchesSearch(group, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const normalized = searchTerm.toLowerCase();
  if (group.name.toLowerCase().includes(normalized)) {
    return true;
  }

  return group.links.some((link) => {
    return [
      link.title,
      link.description,
      link.notes,
      link.url,
      ...(link.tags || [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

function filterGroupLinks(group) {
  if (!state.searchTerm) {
    return group.links;
  }

  const normalized = state.searchTerm.toLowerCase();
  return group.links.filter((link) => {
    return [
      link.title,
      link.description,
      link.notes,
      link.url,
      ...(link.tags || [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

function getActiveGroup() {
  return state.groups.find((group) => group.id === state.activeGroupId) || null;
}

async function refreshCurrentTabCount() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  state.currentTabCount = tabs.length;
  els.browserTabCount.textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
}

async function refreshData() {
  await ensureDefaultData();
  state.groups = await getSnapshot();

  if (!state.activeGroupId || !state.groups.some((group) => group.id === state.activeGroupId)) {
    state.activeGroupId = state.groups[0]?.id || null;
  }

  render();
}

function populateGroupSelect() {
  const previous = Number(els.linkGroup.value) || state.activeGroupId;
  els.linkGroup.innerHTML = "";

  for (const group of state.groups) {
    const option = document.createElement("option");
    option.value = String(group.id);
    option.textContent = group.name;
    option.selected = group.id === previous;
    els.linkGroup.append(option);
  }
}

function renderNav() {
  els.groupNav.innerHTML = "";

  const visibleGroups = state.groups.filter((group) => groupMatchesSearch(group, state.searchTerm));

  for (const group of visibleGroups) {
    const button = document.createElement("button");
    button.className = `group-nav-item${group.id === state.activeGroupId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="group-dot" style="background:${group.color}"></span>
      <div>
        <div class="group-nav-item-title">${group.name}</div>
        <small>${relativeTime(group.updatedAt)}</small>
      </div>
    `;

    button.addEventListener("click", () => {
      state.activeGroupId = group.id;
      render();
    });

    els.groupNav.append(button);
  }
}

function renderHero() {
  const activeGroup = getActiveGroup();
  if (!activeGroup) {
    els.heroTitle.textContent = "All collections";
    els.heroMeta.textContent = "0 links";
    els.heroBadge.style.background = "transparent";
    return;
  }

  const visibleLinks = filterGroupLinks(activeGroup);
  els.heroTitle.textContent = activeGroup.name;
  els.heroMeta.textContent = `${visibleLinks.length} link${visibleLinks.length === 1 ? "" : "s"} · ${relativeTime(activeGroup.updatedAt)}`;
  els.heroBadge.style.background = activeGroup.color;
}

function createLinkCard(link) {
  const fragment = els.linkCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".link-card");
  const favicon = fragment.querySelector(".link-favicon");
  const title = fragment.querySelector(".link-title");
  const description = fragment.querySelector(".link-description");
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
  description.textContent = link.description || "No short description";
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
  card.querySelector('[data-action="open"]').addEventListener("click", () => chrome.tabs.create({ url: link.url }));
  card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    await deleteLink(link.id);
    await refreshData();
  });

  return fragment;
}

function renderGroups() {
  els.groupsContainer.innerHTML = "";
  const groupsToRender = state.groups.filter((group) => groupMatchesSearch(group, state.searchTerm));
  const activeGroup = getActiveGroup();
  const orderedGroups = activeGroup && groupsToRender.some((group) => group.id === activeGroup.id)
    ? [activeGroup, ...groupsToRender.filter((group) => group.id !== activeGroup.id)]
    : groupsToRender;

  let visibleLinkCount = 0;

  for (const group of orderedGroups) {
    const visibleLinks = filterGroupLinks(group)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
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
      await Promise.all(visibleLinks.map((link) => chrome.tabs.create({ url: link.url, active: false })));
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

  els.emptyState.classList.toggle("hidden", visibleLinkCount > 0);
}

function render() {
  const visibleGroups = state.groups.filter((group) => groupMatchesSearch(group, state.searchTerm));
  if (visibleGroups.length > 0 && !visibleGroups.some((group) => group.id === state.activeGroupId)) {
    state.activeGroupId = visibleGroups[0].id;
  }

  populateGroupSelect();
  renderNav();
  renderHero();
  renderGroups();
}

function closeDialog(dialog) {
  dialog.close();
}

function openLinkDialog(link = null) {
  els.linkDialogTitle.textContent = link ? "Edit link" : "Add link";
  els.linkId.value = link?.id || "";
  els.linkTitle.value = link?.title || "";
  els.linkUrl.value = link?.url || "";
  els.linkDescription.value = link?.description || "";
  els.linkNotes.value = link?.notes || "";
  els.linkTags.value = (link?.tags || []).join(", ");
  els.linkPinned.checked = Boolean(link?.pinned);
  populateGroupSelect();
  els.linkGroup.value = String(link?.groupId || state.activeGroupId || state.groups[0]?.id || "");
  els.linkDialog.showModal();
}

function openGroupDialog(group = null) {
  els.groupDialogTitle.textContent = group ? "Edit group" : "New group";
  els.groupId.value = group?.id || "";
  els.groupName.value = group?.name || "";
  els.groupColor.value = group?.color || "#efb907";
  els.deleteGroupBtn.classList.toggle("hidden", !group);
  els.groupDialog.showModal();
}

async function saveCurrentTabToGroup(groupId = null) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return;
  }

  await saveLink({
    title: tab.title || tab.url,
    url: tab.url,
    description: "",
    notes: "",
    tags: [],
    favicon: tab.favIconUrl || "",
    groupId: groupId || state.activeGroupId || state.groups[0]?.id,
    pinned: false
  });

  await refreshData();
}

async function importCurrentWindow(groupId = null) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await importLinks(
    tabs
      .filter((tab) => /^https?:/.test(tab.url || ""))
      .map((tab) => ({
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || ""
      })),
    groupId || state.activeGroupId || state.groups[0]?.id
  );
  await refreshData();
}

async function openVisibleLinks() {
  const activeGroup = getActiveGroup();
  if (!activeGroup) {
    return;
  }

  const visibleLinks = filterGroupLinks(activeGroup);
  for (const link of visibleLinks) {
    await chrome.tabs.create({ url: link.url, active: false });
  }
}

function attachEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim();
    render();
  });

  els.addLinkBtn.addEventListener("click", () => openLinkDialog());
  els.newGroupBtn.addEventListener("click", () => openGroupDialog());
  els.editGroupBtn.addEventListener("click", () => {
    const activeGroup = getActiveGroup();
    if (activeGroup) {
      openGroupDialog(activeGroup);
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
      description: els.linkDescription.value,
      notes: els.linkNotes.value,
      tags: els.linkTags.value,
      groupId: Number(els.linkGroup.value),
      pinned: els.linkPinned.checked
    });
    closeDialog(els.linkDialog);
    await refreshData();
  });

  els.groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.groupId.value) {
      await updateGroup(Number(els.groupId.value), {
        name: els.groupName.value,
        color: els.groupColor.value
      });
      state.activeGroupId = Number(els.groupId.value);
    } else {
      const group = await createGroup({
        name: els.groupName.value,
        color: els.groupColor.value
      });
      state.activeGroupId = group.id;
    }

    closeDialog(els.groupDialog);
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
