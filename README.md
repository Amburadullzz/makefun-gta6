[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Amburadullzz/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Amburadullzz/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vesper Bay — Night Shift

Vesper Bay — Night Shift is an open-world crime game set in a rain-dark harbour city at night, played in the browser. You take jobs from a dispatcher, steal cars to reach them, and lose the police when the wanted level climbs. It is a procedural city, three chained missions and a pistol.

## Play

```
node serve.ts
```

Then open `http://localhost:8080`. The game is static files under `game/`: no build step, no bundler, and no network request at runtime.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| SHIFT | Sprint |
| SPACE | Jump on foot, handbrake in a car |
| MOUSE | Look |
| LMB | Fire |
| E | Enter or leave a car |
| ESC | Pause |

## What is in it

- The procedural city: `city.js` builds a seeded grid of asphalt, raised sidewalks, tower blocks, sodium streetlights, neon signs and a waterfront, merged into a few draw calls.
- The character and third-person camera: `player.js` walks, sprints and jumps Mara Voss through the streets; `camera.js` orbits her with the mouse and pulls in when a building would block the lens.
- Cars and traffic: `vehicles.js` holds six car types and the arcade driving model; `traffic.js` drives AI cars along the grid and walks pedestrians around their blocks.
- Police and the wanted level: `police.js` raises the level from crimes, spawns cruisers out of sight, sends officers out on foot, and cools the level down once you have broken away.
- Three missions: `missions.js` chains DEAD DROP, SHAKE THE TAIL and THE LONG NIGHT, each with a marker in the world, staged objectives, a payoff and a way to fail.
- The pistol: `combat.js` fires a ray through the crosshair at people, officers, cars and walls, with a muzzle flash, tracer, impact spark, ammo and reloading.
- The minimap and HUD: `hud.js` draws the circular minimap from the same road and block rectangles the city was built from, alongside money, health, stamina, wanted stars, objective line and speed.
- The save: `state.js` keeps money, health, wanted level, mission stage, clock and statistics, writes them to `localStorage` and autosaves every 30 seconds.
- The sound: `audio.js` synthesises the engine, gunshots, siren, footsteps and a slow synth loop with WebAudio, with no audio files.

## Layout

| File | Job |
| --- | --- |
| `game/src/main.js` | Renderer, scene lights, fixed-timestep loop, update order |
| `game/src/city.js` | The seeded city: roads, blocks, buildings, lights, waterfront |
| `game/src/geometry.js` | Mesh builder and the canvas-drawn facade, sign and glow textures |
| `game/src/seed.js` | Seeded random numbers and 2D noise |
| `game/src/player.js` | The walking body: movement, sprint, jump, gravity, collision |
| `game/src/camera.js` | Third-person orbit, follow damping, aim shoulder, pull-in |
| `game/src/vehicles.js` | Car models, driving model, entering and leaving |
| `game/src/traffic.js` | AI cars on the grid, pedestrians on the sidewalks |
| `game/src/police.js` | Crimes, wanted level, cruiser pursuit, officers on foot |
| `game/src/combat.js` | The pistol: raycast hits, tracer, muzzle flash, ammo |
| `game/src/missions.js` | The three jobs: markers, stages, rewards, failure |
| `game/src/hud.js` | Money, health, stars, objective line, speed, minimap |
| `game/src/ui.js` | Title, pause and game-over screens |
| `game/src/state.js` | The run's numbers, the event bus and the save file |
| `game/src/audio.js` | All sound, synthesised at runtime |
| `game/src/input.js` | Key and mouse mapping to named actions |
| `game/src/postfx.js` | Bloom pass, vignette and colour lift |
| `game/src/shots.js` | Camera and world presets for the `?shot=` screenshots |

## Screenshots

- `screenshots/1-start.jpg` — the title over the skyline, with the control legend and CLICK TO START.
- `screenshots/2-play.jpg` — on foot in the Narrows on JOB 01, with the E prompt on a parked car and the minimap running.
- `screenshots/3-drive.jpg` — driving a stolen car at 96 km/h toward the Salt Row quay with one wanted star.
- `screenshots/4-chase.jpg` — three wanted stars on SHAKE THE TAIL, a cruiser behind the car and another ahead.
