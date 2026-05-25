const HOLDS_MESSAGE_TYPE = "GET_CLOUDBEDS_HOLD_NOTE";

function isCloudbedsCalendarPage() {
  return window.location.hostname === "hotels.cloudbeds.com" && window.location.hash.startsWith("#/calendar");
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatHoldRange(slotText, startDateRaw, endDateRaw) {
  const cleanedText = normalizeText(slotText);
  if (cleanedText && !/^holds?$/i.test(cleanedText)) {
    return cleanedText;
  }

  if (!startDateRaw) {
    return cleanedText || "hold";
  }

  const startDate = new Date(`${startDateRaw}T00:00:00`);
  const endDateExclusive = endDateRaw ? new Date(`${endDateRaw}T00:00:00`) : null;
  if (!endDateExclusive || Number.isNaN(startDate.getTime()) || Number.isNaN(endDateExclusive.getTime())) {
    return formatDate(startDate);
  }

  const endDate = new Date(endDateExclusive);
  endDate.setDate(endDate.getDate() - 1);

  if (startDate.toDateString() === endDate.toDateString()) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

function getRoomLabelMap() {
  return new Map(
    Array.from(document.querySelectorAll(".c-room[data-room-id]")).map((roomNode) => [
      roomNode.getAttribute("data-room-id"),
      normalizeText(roomNode.textContent) || roomNode.getAttribute("data-room-id") || "Unknown unit"
    ])
  );
}

function extractCloudbedsHoldSnapshot() {
  if (!isCloudbedsCalendarPage()) {
    return {
      ok: false,
      reason: "not-calendar"
    };
  }

  const roomLabels = getRoomLabelMap();
  const groupedHolds = new Map();

  Array.from(document.querySelectorAll(".calendar-slot.calendar-slot-blocked_dates")).forEach((slotNode) => {
    const slotText = normalizeText(slotNode.textContent);
    if (!/\bholds?\b/i.test(slotText)) {
      return;
    }

    const roomId = slotNode.getAttribute("data-room-id") || slotNode.closest(".c-room-line")?.getAttribute("data-room-id");
    if (!roomId) {
      return;
    }

    const unit = roomLabels.get(roomId) || roomId;
    const rangeLabel = formatHoldRange(
      slotText,
      slotNode.getAttribute("data-start-date"),
      slotNode.getAttribute("data-end-date")
    );

    if (!groupedHolds.has(roomId)) {
      groupedHolds.set(roomId, {
        roomId,
        unit,
        entries: []
      });
    }

    const roomHold = groupedHolds.get(roomId);
    if (!roomHold.entries.includes(rangeLabel)) {
      roomHold.entries.push(rangeLabel);
    }
  });

  const holds = Array.from(groupedHolds.values()).sort((left, right) =>
    left.unit.localeCompare(right.unit, undefined, { numeric: true, sensitivity: "base" })
  );

  const propertyName = normalizeText((document.title || "").replace(/\s*-\s*Calendar.*$/, "")) || "Cloudbeds";
  const capturedAt = new Date();
  const noteLines = [
    `# ${propertyName} units on hold`,
    "",
    `Captured from the Cloudbeds calendar on ${capturedAt.toLocaleString()}.`,
    `Visible units on hold: ${holds.length}`,
    ""
  ];

  if (holds.length === 0) {
    noteLines.push("No visible hold units were found in the current calendar view.");
  } else {
    holds.forEach((hold) => {
      noteLines.push(`- ${hold.unit}: ${hold.entries.join("; ")}`);
    });
  }

  noteLines.push("", `Source: ${window.location.href}`);

  return {
    ok: true,
    propertyName,
    capturedAt: capturedAt.toISOString(),
    holdCount: holds.length,
    holds,
    noteTitle: `${propertyName} hold units`,
    noteMarkdown: noteLines.join("\n")
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== HOLDS_MESSAGE_TYPE) {
    return false;
  }

  sendResponse(extractCloudbedsHoldSnapshot());
  return false;
});
