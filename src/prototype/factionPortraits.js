// Diplomacy portraits — the painted envoy scenes for the four majors.
// Shared by the herald banners and the envoy audience modal. `pos` is the
// object-position that keeps each envoy's face inside a tight crop.
const A = import.meta.env.BASE_URL;

export const DIPLO_PORTRAITS = {
  versari:   { src: `${A}assets/portraits/factions/versari/versari_diplomacy_1.webp`, pos: "50% 25%" },
  lakers:    { src: `${A}assets/portraits/factions/lakers/lakers_diplomacy_1.webp`, pos: "50% 22%" },
  goldgrass: { src: `${A}assets/portraits/factions/goldgrass/goldgrass_diplomacy_1.webp`, pos: "66% 22%" },
  plainers:  { src: `${A}assets/portraits/factions/plainers/plainers_diplomacy_1.webp`, pos: "72% 22%" },
};

export function portraitFor(fid) {
  return DIPLO_PORTRAITS[fid] || null;
}
