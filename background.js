chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_MANAGER") {
    const url = new URL(chrome.runtime.getURL("dashboard.html"));
    if (message.prefill) {
      Object.entries(message.prefill).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, value);
        }
      });
      url.searchParams.set("compose", "1");
    }
    chrome.tabs.create({ url: url.toString() });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
