// Image upload / fetch / delete against the GitHub content branch.
// Uses the same fine-grained PAT and target branch as the snapshot
// sync. Beat images live at src/game/content/images/beats/<id>.jpg —
// auto-named after the beat id so the file path is fully derivable
// from data.

import { commitFiles, githubConfigured } from "./github.js";

const API = "https://api.github.com";

export const BEAT_IMAGE_DIR = "src/game/content/images/beats";

export function pathForBeatImage(beatId) {
  if (!beatId) throw new Error("beatId required");
  return `${BEAT_IMAGE_DIR}/${beatId}.jpg`;
}

export async function uploadBeatImage({ beatId, blob }) {
  if (!githubConfigured()) {
    throw new Error("GitHub sync is not configured.");
  }
  const path = pathForBeatImage(beatId);
  const base64 = await blobToBase64(blob);
  const result = await commitFiles(
    [{ path, content: base64, encoding: "base64" }],
    {
      message: `Editor: upload beat image ${beatId}.jpg (${formatBytes(blob.size)})`,
    },
  );
  // Bust the preview cache for this path.
  imageDataUriCache.delete(path);
  return { ...result, path };
}

export async function deleteBeatImage({ beatId, path }) {
  if (!githubConfigured()) {
    throw new Error("GitHub sync is not configured.");
  }
  const filePath = path || pathForBeatImage(beatId);
  const { token, repo, branch } = githubSettings();

  // Look up sha on the content branch — Contents API needs it to delete.
  const lookup = await fetch(
    `${API}/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) },
  );
  if (lookup.status === 404) {
    // Nothing to delete; treat as success.
    imageDataUriCache.delete(filePath);
    return { deleted: false };
  }
  if (!lookup.ok) {
    throw new Error(`lookup failed: ${lookup.status}`);
  }
  const meta = await lookup.json();
  const del = await fetch(`${API}/repos/${repo}/contents/${filePath}`, {
    method: "DELETE",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Editor: remove beat image ${filePath}`,
      sha: meta.sha,
      branch,
    }),
  });
  if (!del.ok) {
    const text = await del.text().catch(() => "");
    throw new Error(`delete failed: ${del.status}: ${text}`);
  }
  imageDataUriCache.delete(filePath);
  return { deleted: true };
}

// Fetch an image from the content branch as a data URI for preview.
// Works for both public and private repos because it goes through the
// authenticated contents API.
const imageDataUriCache = new Map();

export async function loadImageDataUri(path) {
  if (!githubConfigured()) return null;
  if (imageDataUriCache.has(path)) return imageDataUriCache.get(path);

  const { token, repo, branch } = githubSettings();
  const res = await fetch(
    `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) },
  );
  if (res.status === 404) {
    imageDataUriCache.set(path, null);
    return null;
  }
  if (!res.ok) {
    throw new Error(`image fetch failed: ${res.status}`);
  }
  const meta = await res.json();
  // meta.content is base64 with embedded newlines; data URI is fine
  // with those, but strip them for cleanliness.
  const base64 = (meta.content || "").replace(/\n/g, "");
  const mime = guessMimeFromPath(path);
  const dataUri = `data:${mime};base64,${base64}`;
  imageDataUriCache.set(path, dataUri);
  return dataUri;
}

function guessMimeFromPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Inlined to avoid an import cycle; same settings shape as github.js.
function githubSettings() {
  return {
    token: import.meta.env.VITE_GITHUB_TOKEN,
    repo: import.meta.env.VITE_GITHUB_REPO,
    branch:
      import.meta.env.VITE_GITHUB_CONTENT_BRANCH || "content/auto-snapshot",
  };
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
