import {
  createPresetFromVoice,
  normalizeStoredUserPreset,
  restoreVoiceState,
  serializePresetState,
  serializeVoiceState,
} from "./model.js";

const USER_PRESETS_KEY = "ersatz-bessel:user-presets:v1";
const SESSION_KEY = "ersatz-bessel:session:v1";
const PRESET_FILE_DB_NAME = "ersatz-bessel-file-handles";
const PRESET_FILE_STORE_NAME = "handles";
const USER_PRESET_FILE_HANDLE_KEY = "user-presets-markdown";
const USER_PRESET_FILE_NAME = "ersatz-bessel-user-presets.md";

let runtimePresetFileHandle = null;

export async function loadUserPresets() {
  const filePresets = await loadUserPresetsFromMarkdownFile();

  if (filePresets) {
    writeUserPresetCache(filePresets);
    return filePresets;
  }

  return readCachedUserPresets();
}

export async function persistUserPresets(userPresets) {
  const serializedPresets = userPresets.map((preset) => serializePresetState(preset));
  const markdown = createPresetMarkdownDocument(serializedPresets);

  if (supportsPresetFileAccess()) {
    let handle;

    try {
      handle = await ensurePresetFileHandle();
    } catch (error) {
      return { ok: false, reason: "picker-failed", error };
    }

    if (!handle) {
      return { ok: false, reason: "cancelled" };
    }

    try {
      await writePresetMarkdownFile(handle, markdown);
      writeUserPresetCache(userPresets);
      return {
        ok: true,
        mode: "file",
        fileName: handle.name ?? USER_PRESET_FILE_NAME,
      };
    } catch (error) {
      await forgetPresetFileHandle();
      return { ok: false, reason: "write-failed", error };
    }
  }

  try {
    downloadPresetMarkdown(markdown);
    writeUserPresetCache(userPresets);
    return {
      ok: true,
      mode: "download",
      fileName: USER_PRESET_FILE_NAME,
    };
  } catch (error) {
    return { ok: false, reason: "download-failed", error };
  }
}

export function createUserPresetSnapshot(voice, name, existingPreset = null) {
  const timestamp = Date.now();

  return createPresetFromVoice(voice, {
    id: existingPreset?.id ?? timestamp,
    name,
    source: "user",
    createdAt: existingPreset?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

export function loadSessionState() {
  const payload = readJson(SESSION_KEY);
  const voices = Array.isArray(payload?.voices)
    ? payload.voices.map((voice) => restoreVoiceState(voice)).filter(Boolean)
    : [];

  if (!voices.length) {
    return null;
  }

  const activeVoiceId = Number(payload?.activeVoiceId);
  const tempo = Number(payload?.tempo);

  return {
    running: false,
    tempo: Number.isFinite(tempo) ? tempo : 118,
    activeVoiceId,
    voices,
  };
}

export function persistSessionState(state) {
  writeJson(SESSION_KEY, {
    version: 1,
    tempo: state.tempo,
    activeVoiceId: state.activeVoiceId,
    voices: state.voices.map((voice) => serializeVoiceState(voice)),
  });
}

function sortUserPresets(left, right) {
  const leftUpdated = left.updatedAt ?? 0;
  const rightUpdated = right.updatedAt ?? 0;

  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }

  return left.name.localeCompare(right.name, "de", { sensitivity: "base" });
}

function readCachedUserPresets() {
  const payload = readJson(USER_PRESETS_KEY);
  const presets = Array.isArray(payload?.presets) ? payload.presets : [];

  return presets
    .map((preset) => normalizeStoredUserPreset(preset))
    .filter(Boolean)
    .sort(sortUserPresets);
}

function writeUserPresetCache(userPresets) {
  writeJson(USER_PRESETS_KEY, {
    version: 1,
    presets: userPresets.map((preset) => serializePresetState(preset)),
  });
}

async function loadUserPresetsFromMarkdownFile() {
  const handle = await getRememberedPresetFileHandle();

  if (!handle) {
    return null;
  }

  try {
    const file = await handle.getFile();
    const markdown = await file.text();
    return parsePresetMarkdownDocument(markdown);
  } catch (error) {
    console.warn("Preset-Markdown konnte nicht geladen werden.", error);
    await forgetPresetFileHandle();
    return null;
  }
}

function parsePresetMarkdownDocument(markdown) {
  if (!markdown.trim()) {
    return [];
  }

  const jsonBlockMatch = markdown.match(/```json\s*([\s\S]*?)```/i);
  const payload = JSON.parse(jsonBlockMatch?.[1] ?? markdown);
  const presets = Array.isArray(payload?.presets) ? payload.presets : [];

  return presets
    .map((preset) => normalizeStoredUserPreset(preset))
    .filter(Boolean)
    .sort(sortUserPresets);
}

function createPresetMarkdownDocument(serializedPresets) {
  const exportedAt = new Date().toISOString();
  const lines = [
    "# Ersatz Bessel User Presets",
    "",
    "Diese Datei wird von der Browser-App geschrieben und gelesen.",
    "Der JSON-Block unten enthaelt die vollstaendigen Preset-Daten fuer den Reload.",
    "",
    `- Aktualisiert: ${exportedAt}`,
    `- Anzahl: ${serializedPresets.length}`,
    "",
    "## Presets",
    "",
  ];

  if (serializedPresets.length) {
    serializedPresets.forEach((preset, index) => {
      const updatedAt = formatPresetTimestamp(preset.updatedAt ?? preset.createdAt);
      lines.push(`${index + 1}. ${preset.name}${updatedAt ? ` (${updatedAt})` : ""}`);
    });
  } else {
    lines.push("_Keine User-Presets gespeichert._");
  }

  lines.push("", "## Rohdaten", "", "```json");
  lines.push(
    JSON.stringify(
      {
        version: 1,
        exportedAt,
        presets: serializedPresets,
      },
      null,
      2,
    ),
  );
  lines.push("```", "");

  return lines.join("\n");
}

function formatPresetTimestamp(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  return new Date(numeric).toISOString();
}

function supportsPresetFileAccess() {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

async function getRememberedPresetFileHandle() {
  if (runtimePresetFileHandle) {
    return runtimePresetFileHandle;
  }

  const storedHandle = await readStoredPresetFileHandle();

  if (storedHandle) {
    runtimePresetFileHandle = storedHandle;
  }

  return storedHandle;
}

async function ensurePresetFileHandle() {
  const existingHandle = await getRememberedPresetFileHandle();

  if (existingHandle) {
    return existingHandle;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: USER_PRESET_FILE_NAME,
      types: [
        {
          description: "Markdown",
          accept: {
            "text/markdown": [".md"],
            "text/plain": [".md"],
          },
        },
      ],
    });

    runtimePresetFileHandle = handle;
    await storePresetFileHandle(handle);
    return handle;
  } catch (error) {
    if (error?.name === "AbortError") {
      return null;
    }

    throw error;
  }
}

async function readStoredPresetFileHandle() {
  if (!supportsIndexedDb()) {
    return null;
  }

  let db = null;

  try {
    db = await openPresetFileDatabase();
    const transaction = db.transaction(PRESET_FILE_STORE_NAME, "readonly");
    const handle = await requestToPromise(transaction.objectStore(PRESET_FILE_STORE_NAME).get(USER_PRESET_FILE_HANDLE_KEY));
    await transactionToPromise(transaction);
    return handle ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function storePresetFileHandle(handle) {
  if (!supportsIndexedDb()) {
    return;
  }

  let db = null;

  try {
    db = await openPresetFileDatabase();
    const transaction = db.transaction(PRESET_FILE_STORE_NAME, "readwrite");
    transaction.objectStore(PRESET_FILE_STORE_NAME).put(handle, USER_PRESET_FILE_HANDLE_KEY);
    await transactionToPromise(transaction);
  } catch {
    // Handle persistence is optional. Saving still works in the current session.
  } finally {
    db?.close();
  }
}

async function forgetPresetFileHandle() {
  runtimePresetFileHandle = null;

  if (!supportsIndexedDb()) {
    return;
  }

  let db = null;

  try {
    db = await openPresetFileDatabase();
    const transaction = db.transaction(PRESET_FILE_STORE_NAME, "readwrite");
    transaction.objectStore(PRESET_FILE_STORE_NAME).delete(USER_PRESET_FILE_HANDLE_KEY);
    await transactionToPromise(transaction);
  } catch {
    // Ignore handle cleanup failures. The next save can still recreate the handle.
  } finally {
    db?.close();
  }
}

function openPresetFileDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRESET_FILE_DB_NAME, 1);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PRESET_FILE_STORE_NAME)) {
        database.createObjectStore(PRESET_FILE_STORE_NAME);
      }
    });

    request.addEventListener("success", () => {
      resolve(request.result);
    });

    request.addEventListener("error", () => {
      reject(request.error);
    });
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => {
      resolve(request.result);
    });

    request.addEventListener("error", () => {
      reject(request.error);
    });
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => {
      resolve();
    });

    transaction.addEventListener("abort", () => {
      reject(transaction.error);
    });

    transaction.addEventListener("error", () => {
      reject(transaction.error);
    });
  });
}

async function writePresetMarkdownFile(handle, markdown) {
  const writable = await handle.createWritable();
  await writable.write(markdown);
  await writable.close();
}

function downloadPresetMarkdown(markdown) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = USER_PRESET_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function readJson(key) {
  if (!hasStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota and privacy-mode issues. The app remains usable without persistence.
  }
}

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
