const els = {
  popupFavicon: document.querySelector("#popupFavicon"),
  popupTitle: document.querySelector("#popupTitle"),
  popupUrl: document.querySelector("#popupUrl"),
  saveInManagerBtn: document.querySelector("#saveInManagerBtn"),
  openManagerBtn: document.querySelector("#openManagerBtn")
};

let activeTab;

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  els.popupTitle.textContent = tab?.title || "Untitled tab";
  els.popupUrl.textContent = tab?.url || "";
  els.popupFavicon.src =
    tab?.favIconUrl ||
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230c7bdc' fill-opacity='.14'/%3E%3Cpath d='M10 22V10h12v3h-9v9h9v-3h2v5H10Z' fill='%23095ca8'/%3E%3C/svg%3E";
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

function attachEvents() {
  els.saveInManagerBtn.addEventListener("click", openManagerWithCurrentTab);
  els.openManagerBtn.addEventListener("click", openManagerWithCurrentTab);
}

async function init() {
  attachEvents();
  await loadCurrentTab();
}

init();
