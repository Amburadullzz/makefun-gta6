[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Amburadullzz/makefun-gta6/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Amburadullzz/makefun-gta6/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Amburadullzz/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Amburadullzz/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Sable Harbor — Night Shift

An open-world crime game in a rain-dark harbour city, played in the browser: a street grid of
seven by seven blocks between the harbour wall and the bay, where you take jobs from Del, steal
cars, shoot your way out of Salt Court and lose the police in the rain. Every car, sign, voice and
note of the soundtrack is made in the game's own code.

## Play

    node serve.ts

then open <http://localhost:8080>. It is static files under `game/` with no build step and no
network request: three.js is vendored, and every other asset — signs, glow, rain, engine, sirens,
music — is generated at run time.

## Controls

| Key | Action |
| --- | --- |
| W A S D | walk, and steer while driving |
| SHIFT | sprint |
| SPACE | jump on foot, handbrake in a car |
| MOUSE | look, right button to aim |
| LMB | fire the pistol |
| E | enter or leave a car |
| R | reload |
| ESC | pause and save |

## What is in it

- The city: `city.js` builds it from a seed — roads, kerbs, lane paint and crosswalks, towers and
  warehouses, lit windows, streetlights with pools of light, neon signs, billboards, the waterfront,
  the piers and the skyline across the bay.
- The character: `player.js` — a box-built body with a walk cycle, acceleration and friction,
  sprint, jump, gravity and ground clamping; `camera.js` orbits on the mouse and pulls in when a
  building would block the view.
- Cars: `vehicles.js` has six models with headlights and a handbrake, and `traffic.js` drives
  twelve of them around the grid while pedestrians walk the pavements and run from gunfire.
- Police: `police.js` — a wanted level of one to five stars, cruisers that spawn out of sight and
  follow the street graph to you, officers who get out and shoot, and a level that falls once you
  break line of sight.
- Missions: `missions.js` — three chained jobs (Cold Open, Bad Debts, Last Ferry) with markers in
  the world and on the minimap, a payout, a fail state, and a repeatable chop-shop job afterwards.
- Combat: `combat.js` — a pistol with a raycast, muzzle flash, tracer, sparks, recoil and ammo.
- The HUD: `hud.js` draws the circular minimap from the city's own road data, with the player as an
  arrow, a north marker, money, health, wanted stars and the current objective.
- Save and sound: `state.js` keeps money, health, wanted level, mission stage and the clock in one
  place and saves them to `localStorage` behind a version field; `audio.js` synthesises the engine,
  gunshots, sirens, rain and a slow minor loop with WebAudio.
- Menus: `ui.js` owns the title screen, the pause screen, the toasts and the ending.

## Layout

| File | What it owns |
| --- | --- |
| `game/src/main.js` | renderer, scene, clock, the fixed-timestep loop and the wiring |
| `game/src/seed.js` | the seeded generator the whole city is built from |
| `game/src/state.js` | money, health, wanted level, mission stage, clock, save and load |
| `game/src/input.js` | keyboard and mouse state, pointer lock, the action map |
| `game/src/geometry.js` | the mesh builder that welds the city into a few draw calls, sign and glow textures |
| `game/src/city.js` | the city: streets, blocks, buildings, lamps, signs, water, skyline, rain, collision |
| `game/src/player.js` | Rook on foot: body, walk cycle, movement, jump, health |
| `game/src/camera.js` | third-person orbit and chase cameras, damping and occlusion |
| `game/src/vehicles.js` | the car models, the driving model, enter and exit |
| `game/src/traffic.js` | AI cars on the grid and pedestrians on the pavements |
| `game/src/police.js` | the wanted level, cruisers, officers and the escape timer |
| `game/src/combat.js` | the pistol and everything a bullet does |
| `game/src/missions.js` | the three jobs, their markers, payouts and fail states |
| `game/src/hud.js` | the minimap, money, health, stars and objective |
| `game/src/ui.js` | title, pause, ending screens and the toast line |
| `game/src/audio.js` | every sound, synthesised with WebAudio |
| `game/src/shots.js` | the deterministic scenes behind `?shot=start|play|drive|chase` |

## Screenshots

- `screenshots/1-start.jpg` — the title over the harbour, with the city's neon behind it.
- `screenshots/2-play.jpg` — Rook on the avenue on foot, pistol out, with the HUD and the first job.
- `screenshots/3-drive.jpg` — the stolen Tern GT on the Strip, headlights on, traffic ahead.
- `screenshots/4-chase.jpg` — three stars, a cruiser alongside with its lights going, Del on the radio.

## Handing it in

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the
kit's library.
