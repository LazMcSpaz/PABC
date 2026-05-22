// Interactive salvage (v0.2 §16.4). When a contest kills a chip-carrying
// unit, the winner distributes the recovered chips — plus may rearrange
// the killer's own bay — across four zones by drag-and-drop:
//   · Salvaged  — staging tray; chips left here are scrapped on confirm
//   · Unit Slots — installed on the killer (capped at its bay slots)
//   · Resell    — pays ceil(cost/2) scrap, lands on the resale market row
//   · Destroy   — removed from the game
import { useMemo, useState } from "react";
import { theme } from "./data.js";
import { Btn, Coin } from "./kit.jsx";
import Chip from "./Chip.jsx";

const zonesFor = (isLoot) => [
  {
    id: "salvaged",
    title: isLoot ? "On the Hex" : "Salvaged",
    hint: isLoot ? "Chips left here stay on the hex" : "Recovered chips · left here = scrapped",
    color: theme.borderLit,
  },
  { id: "unitSlots", title: "Unit Slots", hint: "Install on the unit", color: theme.accent2 },
  { id: "resell", title: "Resell", hint: "½ value → resale row", color: theme.accent },
  { id: "destroy", title: "Destroy", hint: "Removed from the game", color: theme.bad || "#a33" },
];

export default function SalvageModal({ prompt, onConfirm }) {
  const isLoot = prompt.kind === "loot";
  const ZONES = useMemo(() => zonesFor(isLoot), [isLoot]);
  const byUid = useMemo(() => {
    const m = {};
    for (const c of [...prompt.unitChips, ...prompt.salvagedChips]) m[c.uid] = c;
    return m;
  }, [prompt]);

  const [place, setPlace] = useState(() => {
    const p = {};
    for (const c of prompt.unitChips) p[c.uid] = "unitSlots";
    for (const c of prompt.salvagedChips) p[c.uid] = "salvaged";
    return p;
  });
  const [dragId, setDragId] = useState(null);
  const [overZone, setOverZone] = useState(null);

  const inZone = (zone) => Object.keys(place).filter((uid) => place[uid] === zone);
  const slotsUsed = (zone) => inZone(zone).reduce((n, uid) => n + (byUid[uid]?.slots || 1), 0);
  const unitSlotsUsed = slotsUsed("unitSlots");
  const resaleTotal = inZone("resell").reduce((n, uid) => n + (byUid[uid]?.resale || 0), 0);

  function moveTo(uid, zone) {
    if (zone === "unitSlots") {
      const cur = place[uid] === "unitSlots" ? 0 : byUid[uid]?.slots || 1;
      if (unitSlotsUsed + cur > prompt.baySlots) return; // bay full — reject
    }
    setPlace((p) => ({ ...p, [uid]: zone }));
  }

  function confirm() {
    onConfirm({
      unitSlots: inZone("unitSlots"),
      resell: inZone("resell"),
      destroy: inZone("destroy"),
    });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 720, maxWidth: "96vw", maxHeight: "92vh", overflow: "auto",
          background: theme.plate, border: `1px solid ${theme.borderLit}`,
          borderRadius: 12, boxShadow: theme.shadowDeep, padding: "20px 24px 22px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <span
            style={{
              fontFamily: theme.fontDisplay, fontSize: 12, letterSpacing: 3,
              textTransform: "uppercase", color: theme.textFaint, fontWeight: 700,
            }}
          >
            {isLoot ? "Salvage Pile" : "Salvage"}
          </span>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: theme.textDim, marginBottom: 16 }}>
          <span style={{ color: prompt.killerColor || theme.text, fontWeight: 700 }}>
            {prompt.killerName}
          </span>{" "}
          {isLoot ? "found" : "recovered"} {prompt.salvagedChips.length} chip
          {prompt.salvagedChips.length === 1 ? "" : "s"}
          {isLoot ? " on this hex" : ""}. Drag to assign.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {ZONES.map((z) => {
            const chips = inZone(z.id);
            const isUnit = z.id === "unitSlots";
            const over = overZone === z.id;
            return (
              <div
                key={z.id}
                onDragOver={(e) => { e.preventDefault(); setOverZone(z.id); }}
                onDragLeave={() => setOverZone((cur) => (cur === z.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) moveTo(dragId, z.id);
                  setDragId(null); setOverZone(null);
                }}
                style={{
                  minHeight: 118,
                  background: over ? `${z.color}22` : "rgba(0,0,0,0.22)",
                  border: `1.5px ${over ? "solid" : "dashed"} ${z.color}`,
                  borderRadius: 9, padding: "8px 10px 10px",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontFamily: theme.fontDisplay, fontSize: 12, fontWeight: 700, color: z.color }}>
                    {z.title}
                    {isUnit && (
                      <span style={{ color: theme.textFaint, fontWeight: 600 }}>
                        {" "}· {unitSlotsUsed}/{prompt.baySlots}
                      </span>
                    )}
                  </span>
                  {z.id === "resell" && resaleTotal > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, color: theme.textFaint }}>+</span>
                      <Coin n={resaleTotal} size={12} />
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: theme.textFaint, marginBottom: 8 }}>{z.hint}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, minHeight: 60 }}>
                  {chips.map((uid) => (
                    <div
                      key={uid}
                      draggable
                      onDragStart={() => setDragId(uid)}
                      onDragEnd={() => { setDragId(null); setOverZone(null); }}
                      style={{ cursor: "grab", position: "relative" }}
                      title={
                        z.id === "resell"
                          ? `Resell for +${byUid[uid]?.resale} scrap`
                          : byUid[uid]?.name
                      }
                    >
                      <Chip chipId={byUid[uid]?.uiChipId} width={62} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 10 }}>
          <Btn variant="primary" onClick={confirm}>
            Confirm{resaleTotal > 0 ? ` · +${resaleTotal} scrap` : ""}
          </Btn>
          {isLoot && (
            <Btn
              onClick={() =>
                onConfirm({
                  unitSlots: prompt.unitChips.map((c) => c.uid),
                  resell: [],
                  destroy: [],
                })
              }
            >
              Leave it
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
