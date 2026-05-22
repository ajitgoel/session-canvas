import { ensureDefaultData, getSnapshot, getVaultStatus, importLinks, saveLink } from "./db.js";

const els = {
  popupFavicon: document.querySelector("#popupFavicon"),
  popupTitle: document.querySelector("#popupTitle"),
  popupUrl: document.querySelector("#popupUrl"),
  popupLockMessage: document.querySelector("#popupLockMessage"),
  popupNotes: document.querySelector("#popupNotes"),
  popupTags: document.querySelector("#popupTags"),
  popupGroup: document.querySelector("#popupGroup"),
  popupForm: document.querySelector("#popupForm"),
  popupImportBtn: document.querySelector("#popupImportBtn"),
  openManagerBtn: document.querySelector("#openManagerBtn")
};

let activeTab;

async function loadGroups() {
  const vaultStatus = await getVaultStatus();
  if (!vaultStatus.unlocked) {
    els.popupLockMessage.classList.remove("hidden");
    els.popupForm.querySelectorAll("textarea, input, select, button[type='submit']").forEach((element) => {
      if (element !== els.openManagerBtn && element !== els.popupImportBtn) {
        element.disabled = true;
      }
    });
    els.popupImportBtn.disabled = true;
    return;
  }

  await ensureDefaultData();
  const collections = await getSnapshot();
  els.popupGroup.innerHTML = "";
  collections.forEach((collection) => {
    collection.groups.forEach((group, index) => {
      const option = document.createElement("option");
      option.value = String(group.id);
      option.textContent = `${collection.name} / ${group.name}`;
      option.selected = els.popupGroup.options.length === 0 && index === 0;
      els.popupGroup.append(option);
    });
  });
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  els.popupTitle.textContent = tab?.title || "Untitled tab";
  els.popupUrl.textContent = tab?.url || "";
  els.popupFavicon.src =
    tab?.favIconUrl ||
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230c7bdc' fill-opacity='.14'/%3E%3Cpath d='M10 22V10h12v3h-9v9h9v-3h2v5H10Z' fill='%23095ca8'/%3E%3C/svg%3E";
}

async function saveActiveTab() {
  if (!activeTab?.url) {
    return;
  }

  await saveLink({
    title: activeTab.title || activeTab.url,
    url: activeTab.url,
    notes: els.popupNotes.value,
    tags: els.popupTags.value,
    groupId: Number(els.popupGroup.value),
    favicon: activeTab.favIconUrl || ""
  });

  window.close();
}

async function importWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await importLinks(
    tabs
      .filter((tab) => /^https?:/.test(tab.url || ""))
      .map((tab) => ({
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || ""
      })),
    Number(els.popupGroup.value)
  );
  window.close();
}

function attachEvents() {
  els.popupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveActiveTab();
  });

  els.popupImportBtn.addEventListener("click", importWindow);
  els.openManagerBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_MANAGER" });
    window.close();
  });
}

async function init() {
  attachEvents();
  await Promise.all([loadGroups(), loadCurrentTab()]);
}

init();
