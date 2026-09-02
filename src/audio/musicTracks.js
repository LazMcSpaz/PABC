/**
 * musicTracks.js — the soundtrack manifest.
 *
 * The four score cuts live in public/assets/audio/music/ as MP3 (MP3 because
 * it is the one lossy format every browser we care about decodes natively —
 * no per-browser <source> juggling). They were trimmed of head/tail digital
 * silence and loudness-matched to −16 LUFS integrated, so nothing jumps in
 * level when the playlist rolls over. See the README next to the files for
 * the encode recipe and the source-file mapping.
 *
 * `durationSec` is the real encoded length, recorded here only so UI can show
 * a length before the file has loaded — playback never relies on it.
 */

const A = import.meta.env?.BASE_URL ?? "/";
const DIR = `${A}assets/audio/music`;

/**
 * The title theme. Plays on the title / setup / lore screens *every* time —
 * it is never shuffled into that slot, it is pinned there. It does also take
 * its turn in the in-game rotation below.
 */
export const TITLE_TRACK_ID = "main-theme";

export const MUSIC_TRACKS = [
  { id: "main-theme", title: "Main Theme",   src: `${DIR}/main-theme.mp3`, durationSec: 117.2 },
  { id: "track-02",   title: "Remnant II",   src: `${DIR}/track-02.mp3`,   durationSec: 116.1 },
  { id: "track-03",   title: "Remnant III",  src: `${DIR}/track-03.mp3`,   durationSec: 118.8 },
  { id: "track-04",   title: "Remnant IV",   src: `${DIR}/track-04.mp3`,   durationSec: 119.8 },
];

export const TRACKS_BY_ID = Object.fromEntries(MUSIC_TRACKS.map((t) => [t.id, t]));

export const TITLE_TRACK = TRACKS_BY_ID[TITLE_TRACK_ID];

export function trackById(id) {
  return TRACKS_BY_ID[id] || null;
}
