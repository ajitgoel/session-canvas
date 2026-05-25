const DRIVE_FILE_NAME = "session-canvas-vault.json";
const GOOGLE_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/spreadsheets"
];
const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_SHEETS_VALUES_URL = "https://sheets.googleapis.com/v4/spreadsheets";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function createRandomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToBase64(bytes);
}

async function sha256Base64Url(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return arrayBufferToBase64(digest);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error_description || data?.error?.message || "Google request failed";
    throw new Error(message);
  }
  return data;
}

function buildAuthUrl(clientId, codeChallenge) {
  const redirectUri = chrome.identity.getRedirectURL("oauth2");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_AUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

async function exchangeCodeForTokens({ clientId, code, codeVerifier }) {
  const redirectUri = chrome.identity.getRedirectURL("oauth2");
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  return parseJsonResponse(response);
}

export function getGoogleDriveRedirectUri() {
  return chrome.identity.getRedirectURL("oauth2");
}

export async function connectGoogleDrive(clientId) {
  if (!clientId?.trim()) {
    throw new Error("Enter your Google OAuth client ID first");
  }

  const codeVerifier = createRandomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const authUrl = buildAuthUrl(clientId.trim(), codeChallenge);
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  const redirect = new URL(redirectUrl);
  const authCode = redirect.searchParams.get("code");
  const authError = redirect.searchParams.get("error");

  if (authError) {
    throw new Error(authError);
  }
  if (!authCode) {
    throw new Error("Google did not return an authorization code");
  }

  const tokens = await exchangeCodeForTokens({
    clientId: clientId.trim(),
    code: authCode,
    codeVerifier
  });

  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Reconnect and approve consent.");
  }

  return {
    refreshToken: tokens.refresh_token
  };
}

export async function refreshGoogleAccessToken({ clientId, refreshToken }) {
  if (!clientId || !refreshToken) {
    throw new Error("Google Drive is not connected");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const tokens = await parseJsonResponse(response);
  if (!tokens.access_token) {
    throw new Error("Could not refresh Google access token");
  }

  return tokens.access_token;
}

async function driveRequest(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    }
  });

  return parseJsonResponse(response);
}

export async function findDriveBackupFile(accessToken) {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const url = `${GOOGLE_DRIVE_FILES_URL}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
  const data = await driveRequest(url, accessToken);
  return data.files?.[0] || null;
}

export async function downloadDriveBackup(accessToken, fileId) {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return parseJsonResponse(response);
}

export async function uploadDriveBackup(accessToken, backup, fileId = "") {
  const metadata = fileId
    ? { name: DRIVE_FILE_NAME }
    : { name: DRIVE_FILE_NAME, parents: ["appDataFolder"] };
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append(
    "file",
    new Blob([JSON.stringify(backup)], { type: "application/json" })
  );

  const baseUrl = fileId ? `${GOOGLE_DRIVE_UPLOAD_URL}/${fileId}` : GOOGLE_DRIVE_UPLOAD_URL;
  const method = fileId ? "PATCH" : "POST";
  const response = await fetch(`${baseUrl}?uploadType=multipart&fields=id,modifiedTime`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  return parseJsonResponse(response);
}

export async function clearGoogleSheetRange(accessToken, spreadsheetId, range) {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `${GOOGLE_SHEETS_VALUES_URL}/${spreadsheetId}/values/${encodedRange}:clear`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  return parseJsonResponse(response);
}

export async function updateGoogleSheetValues(accessToken, spreadsheetId, range, values) {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `${GOOGLE_SHEETS_VALUES_URL}/${spreadsheetId}/values/${encodedRange}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        range,
        majorDimension: "ROWS",
        values
      })
    }
  );

  return parseJsonResponse(response);
}
