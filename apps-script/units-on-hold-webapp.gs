const SPREADSHEET_ID = "1shZNltde7hEgBvGgO9Gp7wQex0AQuR2e";
const WORKSHEET_NAME = "units-on-hold-downtown-inn";

function doGet() {
  return jsonResponse({
    ok: true,
    message: "Cloudbeds hold sheet web app is running."
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const worksheetName = payload.worksheetName || WORKSHEET_NAME;
    const rows = Array.isArray(payload.rows) ? payload.rows : buildRows_(payload);

    if (!rows.length) {
      throw new Error("No rows were provided.");
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(worksheetName);
    if (!sheet) {
      throw new Error(`Worksheet not found: ${worksheetName}`);
    }

    sheet.clearContents();
    sheet
      .getRange(1, 1, rows.length, rows[0].length)
      .setValues(rows);

    return jsonResponse({
      ok: true,
      worksheetName,
      rowCount: rows.length
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error.message || String(error)
    });
  }
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  return JSON.parse(raw);
}

function buildRows_(payload) {
  const holds = Array.isArray(payload.holds) ? payload.holds : [];
  const capturedAt = payload.capturedAt || new Date().toISOString();
  const property = payload.property || "";
  const sourceUrl = payload.sourceUrl || "";

  return [
    ["captured_at", "property", "unit", "hold_ranges", "source_url"],
    ...holds.map((hold) => [
      capturedAt,
      property,
      hold.unit || "",
      Array.isArray(hold.entries) ? hold.entries.join("; ") : "",
      sourceUrl
    ])
  ];
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
