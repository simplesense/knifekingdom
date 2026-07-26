# Changelog

All notable changes to Knife Kingdom are documented here. Versions follow a
semver-ish scheme (`MAJOR.MINOR.PATCH`): PATCH for bug fixes, MINOR for new
features/content, MAJOR for breaking changes (e.g. a save-format change).
The current version is shown in-game at the bottom of the main menu.

## [1.0.0] — 2026-07-26

Baseline release — everything the game had accumulated up to this point,
with a version number attached for the first time.

### Added
- Mobile/touch support: joystick movement + aim, fire button (hold to
  auto-fire), tap-to-throw, follow-camera zoom, safe-area layout.
- Difficulty scaling, pseudo-3D camera + shadows, progressive explosions.
- BE THE SHERIFF mode, knife shop, unlockable maps, easter eggs.
- Redesigned character icons (outfit variety, directional facing), buildings
  (per-building materials/rooftops/signage), weapons/bullets/explosions
  (shared blade renderer, spark/shockwave effects), and sound effects
  (layered synth voices with real attack/decay envelopes).

### Fixed
- iPhone/iPad canvas sizing bug (`VisualViewport` vs. `window.visualViewport`).
- Menu content (logo, credit box, footer) getting clipped with no scroll
  fallback on short or landscape mobile viewports.
- Mobile follow-camera leaving a dead zone of empty background below the
  game world on tall/narrow phone screens.
