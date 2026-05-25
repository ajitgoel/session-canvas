import {
  clearGoogleSheetRange,
  refreshGoogleAccessToken,
  updateGoogleSheetValues
} from "./drive-sync.js";

const HOLD_SHEET_ID = "1shZNltde7hEgBvGgO9Gp7wQex0AQuR2e";
const HOLD_SHEET_NAME = "units-on-hold-downtown-inn";
const HOLD_SHEET_CLEAR_RANGE = `${HOLD_SHEET_NAME}!A:Z`;
const HOLD_SHEET_WRITE_RANGE = `${HOLD_SHEET_NAME}!A1`;

const els = {
  popupFavicon: document.querySelector("#popupFavicon"),
  popupTitle: document.querySelector("#popupTitle"),
  popupUrl: document.querySelector("#popupUrl"),
  saveInManagerBtn: document.querySelector("#saveInManagerBtn"),
  openManagerBtn: document.querySelector("#openManagerBtn"),
  cloudbedsPanel: document.querySelector("#cloudbedsPanel"),
  cloudbedsStatus: document.querySelector("#cloudbedsStatus"),
  cloudbedsHoldCount: document.querySelector("#cloudbedsHoldCount"),
  cloudbedsHoldList: document.querySelector("#cloudbedsHoldList"),
  addCloudbedsNoteBtn: document.querySelector("#addCloudbedsNoteBtn"),
  saveCloudbedsSheetBtn: document.querySelector("#saveCloudbedsSheetBtn")
};

let activeTab;
let cloudbedsHoldSnapshot = null;
let cloudbedsActionInFlight = false;

function isCloudbedsCalendarTab(tab) {
  return Boolean(tab?.url?.includes("hotels.cloudbeds.com/connect/") && tab.url.includes("#/calendar"));
}

function renderCloudbedsState(snapshot) {
  if (!snapshot || !snapshot.ok) {
    els.cloudbedsPanel.classList.add("hidden");
    els.addCloudbedsNoteBtn.disabled = true;
    els.saveCloudbedsSheetBtn.disabled = true;
    return;
  }

  cloudbedsHoldSnapshot = snapshot;
  els.cloudbedsPanel.classList.remove("hidden");
  els.cloudbedsHoldCount.textContent = String(snapshot.holdCount);
  els.cloudbedsStatus.textContent =
    snapshot.holdCount > 0
      ? `Captured ${snapshot.holdCount} visible unit${snapshot.holdCount === 1 ? "" : "s"} on hold from the current calendar view.`
      : "No visible hold units were found in the current calendar view.";
  els.cloudbedsHoldList.innerHTML = "";

  snapshot.holds.slice(0, 10).forEach((hold) => {
    const item = document.createElement("li");
    item.className = "popup-holds-item";
    const title = document.createElement("strong");
    title.textContent = hold.unit;
    const detail = document.createElement("span");
    detail.textContent = hold.entries.join("; ");
    item.append(title, detail);
    els.cloudbedsHoldList.append(item);
  });

  if (snapshot.holds.length > 10) {
    const overflowItem = document.createElement("li");
    overflowItem.className = "popup-holds-item muted";
    overflowItem.textContent = `+${snapshot.holds.length - 10} more units in the note`;
    els.cloudbedsHoldList.append(overflowItem);
  }

  setCloudbedsActionsDisabled(false);
}

async function loadCloudbedsSnapshot() {
  cloudbedsHoldSnapshot = null;
  if (!isCloudbedsCalendarTab(activeTab)) {
    els.cloudbedsPanel.classList.add("hidden");
    return;
  }

  els.cloudbedsPanel.classList.remove("hidden");
  els.cloudbedsHoldCount.textContent = "…";
  els.cloudbedsStatus.textContent = "Reading visible hold units from the Cloudbeds calendar…";
  els.cloudbedsHoldList.innerHTML = "";
  setCloudbedsActionsDisabled(true);

  try {
    const snapshot = await chrome.tabs.sendMessage(activeTab.id, {
      type: "GET_CLOUDBEDS_HOLD_NOTE"
    });
    renderCloudbedsState(snapshot);
  } catch (_error) {
    els.cloudbedsStatus.textContent =
      "Could not read the Cloudbeds calendar yet. Refresh the tab and reopen this popup.";
  }
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  els.popupTitle.textContent = tab?.title || "Untitled tab";
  els.popupUrl.textContent = tab?.url || "";
  els.popupFavicon.src =
    tab?.favIconUrl ||
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230c7bdc' fill-opacity='.14'/%3E%3Cpath d='M10 22V10h12v3h-9v9h9v-3h2v5H10Z' fill='%23095ca8'/%3E%3C/svg%3E";
  await loadCloudbedsSnapshot();
}

function openManagerWithCurrentTab() {
  chrome.runtime.sendMessage({
    type: "OPEN_MANAGER",
    prefill: activeTab?.url
      ? {
          title: activeTab.title || activeTab.url,
          url: activeTab.url,
          favicon: activeTab.favIconUrl || ""
        }
      : undefined
  });
  window.close();
}

function addCloudbedsNote() {
  if (!cloudbedsHoldSnapshot?.ok) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "OPEN_MANAGER",
    prefill: {
      title: cloudbedsHoldSnapshot.noteTitle,
      notes: cloudbedsHoldSnapshot.noteMarkdown,
      tab: "notes"
    }
  });
  window.close();
}

function setCloudbedsActionsDisabled(disabled) {
  els.addCloudbedsNoteBtn.disabled = disabled;
  els.saveCloudbedsSheetBtn.disabled = disabled;
}

function buildHoldSheetRows(snapshot) {
  return [
    ["captured_at", "property", "unit", "hold_ranges", "source_url"],
    ...snapshot.holds.map((hold) => [
      snapshot.capturedAt,
      snapshot.propertyName,
      hold.unit,
      hold.entries.join("; "),
      activeTab?.url || snapshot.sourceUrl || ""
    ])
  ];
}

async function getCachedGoogleAuthSettings() {
  const data = await chrome.storage.local.get("sessionCanvasGoogleAuth");
  return data.sessionCanvasGoogleAuth || { clientId: "", refreshToken: "" };
}

async function saveCloudbedsSnapshotToSheet() {
  if (!cloudbedsHoldSnapshot?.ok || cloudbedsActionInFlight) {
    return;
  }

  cloudbedsActionInFlight = true;
  setCloudbedsActionsDisabled(true);
  const previousStatus = els.cloudbedsStatus.textContent;
  els.cloudbedsStatus.textContent = "Saving visible hold units to Google Sheets…";

  try {
    const { clientId, refreshToken } = await getCachedGoogleAuthSettings();
    if (!clientId || !refreshToken) {
      throw new Error("Connect Google Drive in Session Canvas settings first, then try again.");
    }

    const accessToken = await refreshGoogleAccessToken({ clientId, refreshToken });
    const rows = buildHoldSheetRows(cloudbedsHoldSnapshot);
    await clearGoogleSheetRange(accessToken, HOLD_SHEET_ID, HOLD_SHEET_CLEAR_RANGE);
    await updateGoogleSheetValues(accessToken, HOLD_SHEET_ID, HOLD_SHEET_WRITE_RANGE, rows);

    els.cloudbedsStatus.textContent =
      `Saved ${cloudbedsHoldSnapshot.holdCount} unit${cloudbedsHoldSnapshot.holdCount === 1 ? "" : "s"} to ${HOLD_SHEET_NAME}.`;
  } catch (error) {
    const message = error?.message || "Could not save to Google Sheets.";
    if (/insufficient|scope|permission/i.test(message)) {
      els.cloudbedsStatus.textContent =
        "Google Sheets access needs a fresh reconnect in Session Canvas settings, then try again.";
    } else {
      els.cloudbedsStatus.textContent = message;
    }
  } finally {
    cloudbedsActionInFlight = false;
    if (cloudbedsHoldSnapshot?.ok) {
      setCloudbedsActionsDisabled(false);
    } else {
      els.cloudbedsStatus.textContent = previousStatus;
    }
  }
}

function attachEvents() {
  els.saveInManagerBtn.addEventListener("click", openManagerWithCurrentTab);
  els.openManagerBtn.addEventListener("click", openManagerWithCurrentTab);
  els.addCloudbedsNoteBtn.addEventListener("click", addCloudbedsNote);
  els.saveCloudbedsSheetBtn.addEventListener("click", saveCloudbedsSnapshotToSheet);
}

async function init() {
  attachEvents();
  await loadCurrentTab();
}

init();
