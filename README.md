# SKYMYST — Thin Air

A one-prompt browser platformer built by an AI agent from Derek Boe's own
sky-world sprites: floating islands in the Stable Atmosphere, white-sailed
Alliance ships, red-sailed Rebel ships, Thin Air below.

Play: open `index.html` (or the GitHub Pages site for this repo).
Move: Arrows / A,D · Jump: Z / Space (hold = higher, tap walls to climb) ·
R restarts an isle · - / + hop isles · Esc = title. Gamepad supported.
`?demo=1` plays itself (attract mode).

Built on the architecture of Zack Bell's "Creating a Platformer" devlog
series (Approach/OnGround helpers, his tuning numbers, variable jumps,
wall cling/slide/jump, jump-through platforms, sub-pixel moving platforms,
composite objects), translated from GameMaker to a single HTML file.
Sprite assets are inlined into index.html as data URLs by game/build.py
in the project archive; src/game.js is the readable source.

MIT licensed. Art © Derek Boe.
