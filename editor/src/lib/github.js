// Minimal GitHub Git Data API client for the content export pipeline.
// Commits all generated files in a single commit on the configured
// content branch, creating the branch from the base branch if needed.

const API = "https://api.github.com";

function config() {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  const repo = import.meta.env.VITE_GITHUB_REPO; // "owner/name"
  const branch =
    import.meta.env.VITE_GITHUB_CONTENT_BRANCH || "content/auto-snapshot";
  const baseBranch = import.meta.env.VITE_GITHUB_BASE_BRANCH || "main";
  return { token, repo, branch, baseBranch };
}

export function githubConfigured() {
  const { token, repo } = config();
  return Boolean(token && repo);
}

export function githubSettings() {
  const { repo, branch, baseBranch } = config();
  return { repo, branch, baseBranch };
}

async function gh(path, { method = "GET", body, token, expectStatuses } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (expectStatuses && expectStatuses.includes(res.status)) {
    return { status: res.status, data: res.status === 204 ? null : await res.json() };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text}`);
  }
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}

// Commit a set of files atomically. Each file is { path, content }.
// Returns { commitSha, branch, created } where `created` is true if
// the content branch was created from baseBranch this call.
export async function commitFiles(files, { message }) {
  const { token, repo, branch, baseBranch } = config();
  if (!token || !repo) {
    throw new Error(
      "GitHub not configured — set VITE_GITHUB_TOKEN and VITE_GITHUB_REPO",
    );
  }

  // 1. Resolve branch — create from baseBranch if missing.
  const branchInfo = await ensureBranch({
    repo,
    branch,
    baseBranch,
    token,
  });
  const parentCommitSha = branchInfo.commitSha;

  // 2. Read the parent commit's tree.
  const parentCommit = await gh(
    `/repos/${repo}/git/commits/${parentCommitSha}`,
    { token },
  );
  const baseTreeSha = parentCommit.data.tree.sha;

  // 3. Blob each file. Base64-encode content for binary safety, though
  //    all our files are UTF-8 text.
  const blobs = await Promise.all(
    files.map((f) =>
      gh(`/repos/${repo}/git/blobs`, {
        method: "POST",
        token,
        body: { content: utf8ToBase64(f.content), encoding: "base64" },
      }).then((r) => ({ path: f.path, sha: r.data.sha })),
    ),
  );

  // 4. Build a new tree off the parent's tree.
  const tree = await gh(`/repos/${repo}/git/trees`, {
    method: "POST",
    token,
    body: {
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    },
  });

  // 5. Create a commit pointing at the new tree.
  const commit = await gh(`/repos/${repo}/git/commits`, {
    method: "POST",
    token,
    body: {
      message,
      tree: tree.data.sha,
      parents: [parentCommitSha],
    },
  });

  // 6. Fast-forward the branch ref to the new commit.
  await gh(`/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    token,
    body: { sha: commit.data.sha, force: false },
  });

  return {
    commitSha: commit.data.sha,
    branch,
    created: branchInfo.created,
  };
}

async function ensureBranch({ repo, branch, baseBranch, token }) {
  // Try to read the branch ref.
  const existing = await gh(`/repos/${repo}/git/refs/heads/${branch}`, {
    token,
    expectStatuses: [200, 404, 409],
  });
  if (existing.status === 200) {
    return { commitSha: existing.data.object.sha, created: false };
  }

  // Doesn't exist — branch from baseBranch.
  const base = await gh(`/repos/${repo}/git/refs/heads/${baseBranch}`, {
    token,
  });
  const baseSha = base.data.object.sha;
  await gh(`/repos/${repo}/git/refs`, {
    method: "POST",
    token,
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });
  return { commitSha: baseSha, created: true };
}

function utf8ToBase64(text) {
  // btoa expects latin-1; encode to UTF-8 bytes first.
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
