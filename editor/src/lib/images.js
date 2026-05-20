// Image upload / fetch / delete against the GitHub content branch.
// Uses the same fine-grained PAT and target branch as the snapshot
// sync. Images for any encounter type are auto-named after the
// encounter id so the file path is fully derivable from data.

import { commitFiles, githubConfigured } from "./github.js";

const API = "https://api.github.com";

export const IMAGE_DIRS = {
  beat: "src/game/content/images/beats",
  world: "src/game/content/images/world",
  field: "src/game/content/images/field",
};

export function pathForImage(kind, id) {
  const dir = IMAGE_DIRS[kind];
  if (!dir) throw new Error(`unknown image kind '${kind}'`);
  if (!id) throw new Error("id required");
  return `${dir}/${id}.jpg`;
}

export async function uploadImage({ kind, id, blob }) {
  if (!githubConfigured()) {
    throw new Error("GitHub sync is not configured.");
  }
  const path = pathForImage(kind, id);
  const base64 = await blobToBase64(blob);
  const result = await commitFiles(
    [{ path, content: base64, encoding: "base64" }],
    {
      message: `Editor: upload ${kind} image ${id}.jpg (${formatBytes(blob.size)})`,
    },
  );
  imageDataUriCache.delete(path);
  return { ...result, path };
}

export async function deleteImage({ path }) {
  if (!githubConfigured()) {
    throw new Error("GitHub sync is not configured.");
  }
  const { token, repo, branch } = settings();

  const lookup = await fetch(
    `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) },
  );
  if (lookup.status === 404) {
    imageDataUriCache.delete(path);
    return { deleted: false };
  }
  if (!lookup.ok) {
    throw new Error(`lookup failed: ${lookup.status}`);
  }
  const meta = await lookup.json();
  const del = await fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: "DELETE",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Editor: remove image ${path}`,
      sha: meta.sha,
      branch,
    }),
  });
  if (!del.ok) {
    const text = await del.text().catch(() => "");
    throw new Error(`delete failed: ${del.status}: ${text}`);
  }
  imageDataUriCache.delete(path);
  return { deleted: true };
}

// Fetch an image from the content branch as a data URI for preview.
// Works for both public and private repos because it goes through the
// authenticated contents API.
const imageDataUriCache = new Map();

export async function loadImageDataUri(path) {
  if (!githubConfigured()) return null;
  if (imageDataUriCache.has(path)) return imageDataUriCache.get(path);

  const { token, repo, branch } = settings();
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

function settings() {
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
