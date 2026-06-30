# Oathbound — Admin Tools

A web-based **3D Map Builder** + **Asset Builder** for [Oathbound](https://github.com/einpallux/oathbound), the solo-friendly 3D browser MMORPG. Design maps visually (true to how they'll look in-game), then export an `oathbound-map.json` the game loads at startup.

Built with **Vite + TypeScript + Three.js**. No backend — everything runs in the browser and deploys statically to **Vercel**.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build
```

## Deploy to Vercel

This repo is Vercel-ready (`vercel.json`). Import the repo in Vercel and accept the defaults:

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`

## What it does

A WYSIWYG editor that renders with Oathbound's **exact** prop geometry and terrain colours, so what you build is what you get in-game.

**Tools** (left rail):

| Tool | What it does |
|------|--------------|
| **Sculpt** | Raise / Lower / Smooth / Flatten / Set-height brushes on the terrain. |
| **Biome** | Paint biome regions (Greenmarch, Thornwood, Fen, Ember, Riven, Gravereach, Hub). Recolours the ground and tells the game what vegetation to auto-scatter there. |
| **Lake** | Press-drag to place a circular water body. Sculpt a basin first for depth. |
| **River / Road** | Click to drop polyline points, double-click or Enter to finish. Draped over the terrain. |
| **Assets** | Place props (single or scattered) from a 100-asset library — every built-in Oathbound prop, a **pre-made set** of buildings / walls / towers / bridges / town props / ruins / extra trees & nature, plus your own custom assets. Each shown as a **live 3D thumbnail**. A **Height offset** slider raises/lowers what you place (e.g. a bridge above a lake). |
| **Erase** | Drag to remove placed props within the brush. |
| **Markers** | Place enemy spawns, world bosses, Oathstone travel points, the player spawn and the town. The **player spawn shows the real player model at true 1:1 scale** — a size reference for how big to make/scale assets. |
| **NPCs** | Place friendly NPCs (villager / guard / merchant / elder) and click out a looped patrol route — or leave them idle. They walk it in-game. |
| **Critters** | Drop ambient-wildlife zones — **birds** (overhead), ground **critters** (rats/rabbits), **butterflies**, **fireflies** — with a radius + count. They wander/glow in-game. |
| **Select** | Click an asset/marker/NPC/critter zone to inspect, tweak (incl. an asset's **Height (Y)**), or delete it. |

**Resize** (top bar): change the world extent and/or grid resolution any time — the terrain & biomes are resampled and **all placed content keeps its position**.

**Import Heightmap** (top bar): load a greyscale image and the whole map is sculpted from it (white = high, black = low; resampled to the current grid, undoable).

**Asset Builder**: compose new low-poly props from primitives (box / cylinder / cone / sphere / icosahedron), each with a colour + transform, with a live spinning preview. Give it a round or box collider to make it solid. Saved assets join the library and export with the map.

**Camera**: **WASD/QE to fly** (Shift = sprint) · right-drag orbit · wheel zoom · middle-drag pan. **Brush size**: `[` / `]`. **Undo/Redo**: Ctrl+Z / Ctrl+Y.

## Maps

- **Save / Load** keep named maps in this browser's `localStorage`; the editor also autosaves your last session.
- **Export JSON** downloads `<name>.oathbound-map.json`.
- **Import** loads any exported map back in.

### Loading a map into Oathbound

1. **Export JSON** here.
2. Drop the file into the game repo at `public/maps/<name>.oathbound-map.json`.
3. Run the game with `?map=<name>` (e.g. `http://localhost:5173/?map=my-world`).

The game has a non-destructive **map loader** (`src/world/map-format.ts` + `src/world/custom-map.ts`): when a map is requested it builds the world from your JSON instead of the procedural generators; with no `?map=` it boots the default procedural world exactly as before.

## The map format

A single versioned JSON object (`src/format/map.ts`, mirrored in the game repo). Coordinates match the game: XZ ground plane, Y up, world centred on the origin. Terrain is a row-major height grid (packed as base64 Int16 centimetres on export) plus a per-cell biome grid. See `src/format/map.ts` for the full schema.
