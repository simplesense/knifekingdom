# 🔪 KNIFE KINGDOM

**Current version: v1.0.0** — see [CHANGELOG.md](CHANGELOG.md) for release history.
The version is also shown in-game at the bottom of the main menu.

A top-down, browser-based **Murder Mystery 2**-style game. You are the Murderer:
sneak around neon arenas, throw knives at innocent bots, and avoid the Sheriff's
vision cone. Earn coins, collect knife skins, unlock maps.

## How to play
- **WASD / arrows** — move
- **Mouse** — aim (your knife flies toward the cursor)
- **Click / Space** — throw a knife
- **P** — pause · **M** — mute

Win by eliminating every innocent before the timer runs out. Don't let the gold
Sheriff spot you — he shoots on sight.

## Features
- Pure vanilla JS + Canvas. **No build step, no dependencies.**
- Knife-skin shop (Crimson, Void, Neon, Golden, Galaxy, Diamond, Lava, Emerald)
- Unlockable maps (Neon Arena, Crate Plaza, Void Vault, Sunset Yard)
- Coins + unlocks persist in `localStorage`
- Synth audio, particles, screen shake, floating coin popups

## Run it locally
Just open `index.html` in a browser, or serve the folder:

    python3 -m http.server 8080

Then visit http://localhost:8080

A single self-contained `knifekingdom.html` (CSS+JS inlined) is also included —
double-click it, no server required.

Made for an MM2-loving daughter. 💜
