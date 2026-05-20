// Orchestrates the post-save export → GitHub push.

import { loadSnapshot } from "./snapshot.js";
import { renderFiles } from "./exporter.js";
import { commitFiles, githubConfigured, githubSettings } from "./github.js";

export { githubConfigured, githubSettings };

export async function pushContentSnapshot({ reason = "save" } = {}) {
  if (!githubConfigured()) {
    throw new Error("GitHub sync is not configured.");
  }
  const snapshot = await loadSnapshot();
  const counts =
    `${snapshot.worldEncounters.length} world / ` +
    `${snapshot.fieldEncounters.length} field / ` +
    `${snapshot.quests.length} quests`;
  const generatedAt = new Date();
  const files = renderFiles(snapshot, { generatedAt });
  const message = `Editor content snapshot (${reason}) — ${counts}\n\n${generatedAt.toISOString()}`;
  const result = await commitFiles(files, { message });
  return { ...result, counts, files: files.map((f) => f.path) };
}
