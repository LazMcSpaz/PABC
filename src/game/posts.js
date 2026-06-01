// §17.7 Listening Post (Intelligence A2 — Vision) — a unit-built static
// structure that grants its owner a small sight footprint deep in territory
// it does not control, and survives by STEALTH, not toughness. The covert
// eye in the field.
//
// This module owns the listening-post STATE + LIFECYCLE (find / build /
// destroy / reveal / upkeep). The rest of the subsystem integrates at its
// natural sites: Vision + Detection-reveal in visibility.js, Contact-reveal
// + the Build action in actions.js, Destruction in contest.js, and the
// Upkeep tick in turn.js. Pure helpers — imports only config + events — so
// any consumer can use it without circular-import pain.
import { CONFIG } from "./config.js";
import { emit } from "./events.js";

// The post on `hex`, or null. A hex carries at most one post (§17.7).
export function postAt(state, hex) {
  return state.world?.listeningPosts?.[hex] || null;
}

// Every post `pid` owns.
export function ownedPosts(state, pid) {
  const out = [];
  const posts = state.world?.listeningPosts || {};
  for (const hex in posts) if (posts[hex].owner === pid) out.push(posts[hex]);
  return out;
}

// §17.7 Build — spawn a post on `hex` for `owner`. Strength 5, paid, and
// CONCEALED at spawn (revealedTo empty). The caller (actions.js) validates
// the A2 assignment, the friendly unit on the hex, the non-Location hex, and
// the scrap/Action cost; this just creates the state + emits.
export function buildPost(state, owner, hex) {
  state.world.listeningPosts = state.world.listeningPosts || {};
  const post = {
    owner,
    hex,
    strength: CONFIG.posts.defense,
    paid: true,
    revealedTo: [],
  };
  state.world.listeningPosts[hex] = post;
  emit(state, "post_built", { owner, hex });
  return post;
}

// §17.7 Destruction — remove a post from play (it lost a contest). The post
// takes no Strength damage; it just dies.
export function destroyPost(state, hex, by) {
  const post = state.world?.listeningPosts?.[hex];
  if (!post) return null;
  delete state.world.listeningPosts[hex];
  emit(state, "post_destroyed", { owner: post.owner, hex, by: by || null });
  return post;
}

// §17.7 Reveal — surface a post to faction `fid` (PERMANENT). Triggered by
// contact (an fid unit enters the hex) or detection (an fid Detection source
// in range). No-op if fid owns it or already sees it.
export function revealPost(state, post, fid, cause) {
  if (!post || post.owner === fid) return false;
  post.revealedTo = post.revealedTo || [];
  if (post.revealedTo.includes(fid)) return false;
  post.revealedTo.push(fid);
  emit(state, "post_revealed", { faction: fid, hex: post.hex, owner: post.owner, cause: cause || null });
  return true;
}

// §17.7/§19.5 Concealment — may `fid` see this post? The owner always; any
// other faction only once the post has been revealed to it. Used by the
// renderer and the contest/destruction path.
export function isPostVisibleTo(state, fid, post) {
  if (!post) return false;
  if (post.owner === fid) return true;
  return !!post.revealedTo?.includes(fid);
}

// §17.7 Upkeep — charge 1 scrap per post `pid` owns, alongside §20.9 chip
// upkeep. Unaffordable → DORMANT (paid=false: contributes no Vision until
// repaid). Emits post_dormant / post_paid only on transitions. Dormancy does
// NOT reveal the post (it stays concealed under the same reveal rules).
export function chargePostUpkeep(state, pid) {
  const player = state.players[pid];
  for (const post of ownedPosts(state, pid)) {
    const was = post.paid;
    if (player.resource >= CONFIG.posts.upkeep) {
      player.resource -= CONFIG.posts.upkeep;
      emit(state, "resource_spent", {
        player: pid, resource: "Resource", amount: -CONFIG.posts.upkeep, source: "post-upkeep",
      });
      post.paid = true;
      if (!was) emit(state, "post_paid", { owner: pid, hex: post.hex });
    } else {
      post.paid = false;
      if (was) emit(state, "post_dormant", { owner: pid, hex: post.hex });
    }
  }
}
