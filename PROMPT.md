# THE ONE PROMPT — v2 (SKYMYST, built around Derek's supplied sprites)
Supersedes the megastore theme in PROMPT_DRAFT_v1.md. All Zack Bell mechanics from v1 are unchanged; what changed is the world, the art, and the assets — Derek supplied walk cycles, NPC sheets, airship fleets and island tilesets on 2026-11-22, and the world in his own skymap: floating islands in a Stable Atmosphere, Thick Air above, Thin Air (and water) below, Alliance ships with white sails against Rebel ships with red sails.

---

Build me a complete, fast-paced 2D action platformer as a single self-contained browser game in one index.html file — no libraries, everything drawn in code except the sprite, ship and character images I have supplied — at an internal resolution of 640x360 scaled up crisply to fill the window, running at 60fps, pixel art rendered sharp with no smoothing.

USE MY ART, IN MY STYLE: extract the figures, ships and compass rose from my supplied sheets (their flat grey backgrounds become transparent) and build the world out of them — black-silhouette floating islands, white-sailed Alliance ships and red-sailed Rebel ships, tall slender black-and-white people with red as the only accent colour, all on a charcoal sky, exactly the look of my supplied scene screenshot. The world is SKYMYST: inhabited floating islands drifting in the Stable Atmosphere, with Thick Air above them and lethal Thin Air below — falling off an island is falling out of the world. I play as a young Alliance pilot-courier, animated with my 8-frame walk cycle, carrying the last dispatch across three islands to the great white ship anchored at the end. Give each island a name, a few standing NPCs taken from my character sheets (shopkeepers, a merchant, a pilot, a bride, a skeleton — each with one line of dialogue when I walk up to them), and a clear reason the journey gets harder: the Rebels are crossing too.

ARCHITECTURE (build it this way): one global game controller (restart island with R, previous/next island with - and +, Esc back to title, island name drawn in the corner); a Solid parent class for all collision geometry and an Entity parent class for everything that moves and collides (player, enemies, moving ships), holding vx, vy and an onGround flag refreshed every frame; two helper functions used everywhere — Approach(value, target, shift), which moves a value toward a target by at most shift, for all acceleration, friction and gravity, and OnGround(), which checks one pixel below the entity.

MOVEMENT AND FEEL (use exactly this tuning as the starting point, scaled by one overall speed multiplier): ground acceleration 1.0, ground friction 1.9, air acceleration 0.75, air friction 0.1, max run speed 6.5, max fall speed 10, jump velocity 8, normal gravity 0.5 per frame, wall-slide gravity 0.25. Jumping must be variable: releasing the jump key while rising cuts upward velocity to a quarter. Let me cling to walls briefly, slide down them slowly, and wall-jump away with extra upward and outward force. Support 45-degree slopes — the islands' rock ramps — that I can run up and down without snapping.

LEVEL GEOMETRY: solid island rock built from 16x16 tiles; one-way jump-through wooden docks I can leap up through and land on; moving platforms that are AIRSHIPS — small white and red ships sailing horizontally and vertically on set routes that carry me when I stand on their decks and push me correctly when they move into me, moving with sub-pixel smoothness (accumulate fractional movement, apply whole pixels); and composite objects — anchor chains and spike hazards parented to a moving ship by a stored offset so they ride it exactly. Every placed instance carries its own setup values (patrol range, ship speed and route distance, which ship a hazard rides) instead of hard-coded class values.

HAZARDS, ENEMIES, PUZZLE: Rebel sentries — my walk-cycle figure recoloured so the white becomes Rebel red — patrol the islands with the same physics, turning at ledges and walls, and touching one sends me back to the last checkpoint; rock spikes do the same; falling into Thin Air does the same. Include one puzzle beat: a mooring switch that casts off a chained ship (or opens a harbour gate), placed so the final island combines it with a spiked ship ride and wall jumps. Collectible compass shards (my compass rose, in miniature) are optional pickups tracked on the HUD with a running timer; finishing is reaching the boarding deck of the anchored great ship.

INPUT AND POLISH: merge keyboard (arrows / A,D to move, Z / Space to jump) and gamepad (left stick, 0.3 deadzone, bottom face button to jump, press and release both tracked) into the same input variables. Procedural WebAudio music and jump/land/collect/respawn sounds, music fading in and out over about a second between islands instead of cutting, and a short black fade on every island start, respawn and island change. Add an attract/demo mode (?demo=1) where the game plays itself, for recording.

FINISH PROPERLY: playable start to finish, no console errors, no falling out of the world except into Thin Air (which respawns me), no way to get permanently stuck, every mechanic above visibly used on at least one island. When done, tell me the controls and how each mechanic was implemented.

---

## Asset inventory (supplied 2026-11-22, extracted to game/assets/)
- walking_armed.png — THE player: 8 panels of 24x48 (white border lines at every 25px, y 1-48) + one idle panel below. Black suit, white arm/face, backpack.
- walking_strip8.png — grey leg-study walk strip, 8 x 24x48, red hip-joint markers (reference / shade figures).
- walk_leg_strip9.png — legs-only strip, 9 frames.
- base.png — NPC sheet: panels of 24x48 on a 25x49 grid (starts x 9/34/59/84/109, y 14 + 49/row), ~10 rows of standing figures and outfits.
- skymyst.png — fleet + factions sheet: Alliance (white) vs Rebels (red), Militant / Merchant / Pilot rows, Shopkeepers/NPC, rowboats.
- boatz.png — full fleet sheet (duplicated halves): white and red ships 136x120, small ships 67x62, compass roses 88x88 at (147,261) and (672,299).
- bigboat.png — ships with anchor chains; hero ship 263x286 at (304,2).
- biggerboat.png — one large white-sail ship 263x232.
- newboats.png — sloop / schooner / hoy designs, old vs "new fake" red-sail designs.
- tileset.png / 16x16tiles1.png — black island silhouettes built from 16px tiles, with tiny harbour houses.
- skymap.JPG — the world diagram: THICK AIR / Stable Atmosphere (islands) / thin air / WATER.
- screenshot2.png — the target look: charcoal sky, black island silhouettes, slender figures, one red accent.
