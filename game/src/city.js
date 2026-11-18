// Sable Harbor itself: a seeded street grid of seven by seven blocks between the harbour wall and
// the water, with towers downtown, warehouses on the docks, neon on the corners, lamps along every
// kerb and the far skyline across the bay. The rest of the game reads this module's data: the road
// rectangles and block bounds for the minimap, the intersection graph for the police, the collision
// boxes for the player and the cars, and the named spots the missions send you to.
import * as THREE from '../vendor/three.min.js';
import { MeshBuilder, makeGlowTexture, makeSignTexture } from './geometry.js';

export const GRID = 7;
export const PITCH = 56;
export const ROAD_WIDTH = 16;
export const BLOCK_INSET = 8;
export const PROMENADE_X = 400;
export const WATER_X = 436;

const SIDEWALK_HEIGHT = 0.22;
const PIER_HEIGHT = 0.5;

const FACADE_COLOURS = [0x2b3440, 0x3a3230, 0x2e3a38, 0x3b3b46, 0x4a3a44, 0x243040, 0x4a4238, 0x30343c];
const WINDOW_COLOURS = [0xffd8a0, 0xffc27a, 0xbfe4ff, 0x9fd0ff, 0xe8f2ff, 0xff9fc0, 0xa8ffd0, 0xfff0c8];

/** Named places the missions and the HUD talk about, in world coordinates. */
const SPOT_LAYOUT = {
  bar: { x: 118, z: 242, label: 'The Drowned Lamp' },
  garage: { x: 46, z: 358, label: 'Marrow Motors' },
  warehouse: { x: 286, z: 52, label: 'Salt Court' },
  pier: { x: 452, z: 170, label: 'Pier 9' },
  marina: { x: 470, z: 344, label: 'Ferry Terminal' },
  diner: { x: 228, z: 336, label: 'Night Owl Diner' },
  plaza: { x: 196, z: 196, label: 'Kestrel Plaza' },
};

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.roads = [];
    this.blocks = [];
    this.buildings = [];
    this.sidewalks = [];
    this.piers = [];
    this.spawnPoints = [];
    this.signs = [];
    this.spots = SPOT_LAYOUT;
    this.bounds = { x0: -14, x1: 522, z0: -14, z1: 404 };
    this.buildingIndex = new Map();
    this.elapsed = 0;

    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);

    this.buildSky();
    this.buildRoadGrid();
    this.buildBlocks();
    this.buildStreetlights();
    this.buildWaterfront();
    this.buildWater();
    this.buildSkylineAcrossTheBay();
    this.buildSigns();
    this.buildBillboards();
    this.buildGraph();
    this.buildRain();
  }

  // ---------------------------------------------------------------- sky and light

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x0b1a36) },
          horizon: { value: new THREE.Color(0x3a6a96) },
          glow: { value: new THREE.Color(0x9a6a5e) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDirection;
          void main() {
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 horizon;
          uniform vec3 glow;
          varying vec3 vDirection;
          void main() {
            float height = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 colour = mix(horizon, top, pow(height, 0.75));
            float haze = pow(1.0 - abs(vDirection.y), 6.0);
            colour += glow * haze * 0.9;
            gl_FragColor = vec4(colour, 1.0);
          }`,
      }),
    );
    sky.frustumCulled = false;
    this.group.add(sky);

    // Stars, sparse and dim: the city's own light drowns most of them.
    const starPositions = [];
    for (let i = 0; i < 420; i += 1) {
      const theta = this.rng.range(0, Math.PI * 2);
      const phi = Math.acos(this.rng.range(0.05, 0.95));
      const radius = 1200;
      starPositions.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.group.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({ color: 0x9fb4d6, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.55 }),
      ),
    );

    // Three lights and a fill. The night is still a night: the sky is the key, a cold moon throws
    // the long shadows, and a warm bounce off the wet street lifts every facade out of the black so
    // that a building, a road and a car stay three different values when the frame is shrunk.
    const hemisphere = new THREE.HemisphereLight(0xa6c4ea, 0x2c3a4c, 2.9);
    this.scene.add(hemisphere);
    const moon = new THREE.DirectionalLight(0xc2d6f4, 2.1);
    moon.position.set(-160, 220, 120);
    this.scene.add(moon);
    // A low warm key from the harbour end of the street: the sodium glow of a city that never
    // switches off, catching the faces the moon leaves dark.
    const sodium = new THREE.DirectionalLight(0xffb478, 1.35);
    sodium.position.set(210, 46, -180);
    this.scene.add(sodium);
    this.scene.add(new THREE.AmbientLight(0x6b7f9e, 2.2));
    this.moonlight = moon;
    this.sodiumLight = sodium;
  }

  // ---------------------------------------------------------------- roads

  buildRoadGrid() {
    const asphalt = new MeshBuilder();
    const markings = new MeshBuilder();
    const kerbs = new MeshBuilder();
    const far = PROMENADE_X;

    // A dark base under everything, so gaps between geometry never show the void.
    asphalt.addGround(-600, -600, 1600, 1600, -0.4, 0x0a0d12);

    for (let k = 0; k <= GRID; k += 1) {
      const centre = k * PITCH;
      // East-west avenue at z = centre.
      this.roads.push({ axis: 'x', centre, from: -12, to: far, width: ROAD_WIDTH });
      asphalt.addGround(-12, centre - ROAD_WIDTH / 2, far, centre + ROAD_WIDTH / 2, 0, k % 2 === 0 ? 0x2d3541 : 0x283039);
      // North-south street at x = centre.
      this.roads.push({ axis: 'z', centre, from: -12, to: far, width: ROAD_WIDTH });
      asphalt.addGround(centre - ROAD_WIDTH / 2, -12, centre + ROAD_WIDTH / 2, far, 0, k % 2 === 0 ? 0x2d3541 : 0x283039);
    }

    // Kerb stones and lane paint along every road.
    for (let k = 0; k <= GRID; k += 1) {
      const centre = k * PITCH;
      for (let along = -8; along < far; along += 8) {
        const start = Math.max(along, -12);
        const end = Math.min(along + 4, far);
        if (end <= start) continue;
        // Centre dashes on the east-west avenue.
        markings.addGround(start, centre - 0.24, end, centre + 0.24, 0.03, 0xffe9b4);
        // Edge lines just inside the kerb.
        markings.addGround(start, centre - ROAD_WIDTH / 2 + 0.6, end, centre - ROAD_WIDTH / 2 + 0.95, 0.03, 0xa9b8c6);
        markings.addGround(start, centre + ROAD_WIDTH / 2 - 0.95, end, centre + ROAD_WIDTH / 2 - 0.6, 0.03, 0xa9b8c6);
        // The same for the north-south street.
        markings.addGround(centre - 0.24, start, centre + 0.24, end, 0.03, 0xffe9b4);
        markings.addGround(centre - ROAD_WIDTH / 2 + 0.6, start, centre - ROAD_WIDTH / 2 + 0.95, end, 0.03, 0xa9b8c6);
        markings.addGround(centre + ROAD_WIDTH / 2 - 0.95, start, centre + ROAD_WIDTH / 2 - 0.6, end, 0.03, 0xa9b8c6);
      }
      // Kerb lips where the slab meets the asphalt.
      for (let j = 0; j < GRID; j += 1) {
        const z0 = j * PITCH + BLOCK_INSET;
        const z1 = (j + 1) * PITCH - BLOCK_INSET;
        kerbs.addBox(centre + ROAD_WIDTH / 2 + 0.12, SIDEWALK_HEIGHT / 2, (z0 + z1) / 2, 0.24, SIDEWALK_HEIGHT, z1 - z0, 0x6d7783);
        kerbs.addBox(centre - ROAD_WIDTH / 2 - 0.12, SIDEWALK_HEIGHT / 2, (z0 + z1) / 2, 0.24, SIDEWALK_HEIGHT, z1 - z0, 0x6d7783);
        const x0 = j * PITCH + BLOCK_INSET;
        const x1 = (j + 1) * PITCH - BLOCK_INSET;
        kerbs.addBox((x0 + x1) / 2, SIDEWALK_HEIGHT / 2, centre + ROAD_WIDTH / 2 + 0.12, x1 - x0, SIDEWALK_HEIGHT, 0.24, 0x6d7783);
        kerbs.addBox((x0 + x1) / 2, SIDEWALK_HEIGHT / 2, centre - ROAD_WIDTH / 2 - 0.12, x1 - x0, SIDEWALK_HEIGHT, 0.24, 0x6d7783);
      }
    }

    // Crosswalks on the four sides of every intersection.
    for (let ix = 0; ix <= GRID; ix += 1) {
      for (let iz = 0; iz <= GRID; iz += 1) {
        const cx = ix * PITCH;
        const cz = iz * PITCH;
        for (let stripe = -6; stripe <= 6; stripe += 1.6) {
          markings.addGround(cx - ROAD_WIDTH / 2 + 1.2, cz + stripe, cx - ROAD_WIDTH / 2 + 2.4, cz + stripe + 0.8, 0.035, 0xf0f6f8);
          markings.addGround(cx + ROAD_WIDTH / 2 - 2.4, cz + stripe, cx + ROAD_WIDTH / 2 - 1.2, cz + stripe + 0.8, 0.035, 0xf0f6f8);
          markings.addGround(cx + stripe, cz - ROAD_WIDTH / 2 + 1.2, cx + stripe + 0.8, cz - ROAD_WIDTH / 2 + 2.4, 0.035, 0xf0f6f8);
          markings.addGround(cx + stripe, cz + ROAD_WIDTH / 2 - 2.4, cx + stripe + 0.8, cz + ROAD_WIDTH / 2 - 1.2, 0.035, 0xf0f6f8);
        }
      }
    }

    // The wet asphalt carries a little of the sky, so the road is a surface with a value of its
    // own instead of a hole between the buildings.
    this.group.add(
      new THREE.Mesh(
        asphalt.build(),
        new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a2634, emissiveIntensity: 1 }),
      ),
    );
    this.group.add(new THREE.Mesh(markings.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
    this.group.add(
      new THREE.Mesh(
        kerbs.build(),
        new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x121a24 }),
      ),
    );
  }

  // ---------------------------------------------------------------- blocks

  buildBlocks() {
    const slabs = new MeshBuilder();
    const bodies = new MeshBuilder();
    const windows = new MeshBuilder();
    const details = new MeshBuilder();
    const trees = new MeshBuilder();
    const lotPaint = new MeshBuilder();
    const rooftopLights = [];

    for (let i = 0; i < GRID; i += 1) {
      for (let j = 0; j < GRID; j += 1) {
        const x0 = i * PITCH + BLOCK_INSET;
        const x1 = (i + 1) * PITCH - BLOCK_INSET;
        const z0 = j * PITCH + BLOCK_INSET;
        const z1 = (j + 1) * PITCH - BLOCK_INSET;
        this.blocks.push({ x0, x1, z0, z1, i, j });
        this.sidewalks.push({ x0, x1, z0, z1 });
        slabs.addBox((x0 + x1) / 2, SIDEWALK_HEIGHT / 2, (z0 + z1) / 2, x1 - x0, SIDEWALK_HEIGHT, z1 - z0, 0x717b87);

        const district = this.districtOf(i, j);
        const special = this.specialBuildingAt(i, j);
        if (special) {
          this.addBuilding(bodies, windows, details, rooftopLights, special);
          continue;
        }

        if (district === 'lot' || district === 'park') {
          this.paintLot(slabs, lotPaint, trees, district, x0, x1, z0, z1);
          continue;
        }

        const lots = this.splitBlock(i, j, district);
        for (const lot of lots) {
          this.addBuilding(bodies, windows, details, rooftopLights, lot);
        }
      }
    }

    this.group.add(
      new THREE.Mesh(slabs.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x151d27 })),
    );
    this.group.add(new THREE.Mesh(lotPaint.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
    this.group.add(
      new THREE.Mesh(bodies.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x161f2c })),
    );
    this.group.add(
      new THREE.Mesh(details.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x121922 })),
    );
    this.group.add(
      new THREE.Mesh(
        windows.build(),
        new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false }),
      ),
    );
    this.group.add(new THREE.Mesh(trees.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));

    if (rooftopLights.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(rooftopLights, 3));
      this.beaconMaterial = new THREE.PointsMaterial({
        color: 0xff3b30,
        size: 3.2,
        map: makeGlowTexture('rgba(255,90,70,1)', 'rgba(255,40,20,0)'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      this.beacons = new THREE.Points(geometry, this.beaconMaterial);
      this.group.add(this.beacons);
    }

    this.buildCollisionIndex();
  }

  districtOf(i, j) {
    if (i === GRID - 1) return 'warehouse';
    const distance = Math.hypot(i - 3.2, j - 3.4);
    if (distance < 1.9) return 'tower';
    if (this.rng.chance(0.1)) return 'lot';
    if (this.rng.chance(0.06)) return 'park';
    return 'midrise';
  }

  /** The four blocks the story uses get a building drawn by hand, so the signs line up. */
  specialBuildingAt(i, j) {
    if (i === 2 && j === 4) {
      return { x0: 126, x1: 150, z0: 230, z1: 252, height: 13, colour: 0x3a2b30, district: 'bar', name: 'The Drowned Lamp' };
    }
    if (i === 5 && j === 1) {
      return { x0: 288, x1: 330, z0: 62, z1: 96, height: 15, colour: 0x33383a, district: 'warehouse', name: 'Salt Court' };
    }
    if (i === 0 && j === 6) {
      return { x0: 14, x1: 42, z0: 346, z1: 374, height: 9, colour: 0x3d3a34, district: 'garage', name: 'Marrow Motors' };
    }
    if (i === 4 && j === 6) {
      return { x0: 232, x1: 252, z0: 344, z1: 362, height: 7.5, colour: 0x40323a, district: 'diner', name: 'Night Owl Diner' };
    }
    if (i === 3 && j === 2) {
      return { x0: 178, x1: 206, z0: 122, z1: 150, height: 96, colour: 0x232c38, district: 'tower', name: 'Sable FM' };
    }
    if (i === 3 && j === 3) {
      return { x0: 176, x1: 208, z0: 178, z1: 208, height: 58, colour: 0x2a2f3c, district: 'tower', name: 'Meridian Hotel' };
    }
    return null;
  }

  /** Break a block into two or four building lots with a little air between them. */
  splitBlock(i, j, district) {
    const x0 = i * PITCH + BLOCK_INSET + 2;
    const x1 = (i + 1) * PITCH - BLOCK_INSET - 2;
    const z0 = j * PITCH + BLOCK_INSET + 2;
    const z1 = (j + 1) * PITCH - BLOCK_INSET - 2;
    const lots = [];
    const make = (ax0, ax1, az0, az1) => {
      const tall = district === 'tower';
      const height = tall ? this.rng.range(54, 132) : district === 'warehouse' ? this.rng.range(8, 16) : this.rng.range(15, 42);
      lots.push({
        x0: ax0,
        x1: ax1,
        z0: az0,
        z1: az1,
        height,
        colour: this.rng.pick(FACADE_COLOURS),
        district,
      });
    };

    if (district === 'tower') {
      make(x0 + 1, x1 - 1, z0 + 1, z1 - 1);
      return lots;
    }
    if (district === 'warehouse') {
      make(x0, x1, z0, z1 - 6);
      return lots;
    }
    if (this.rng.chance(0.45)) {
      // Two lots split across the block.
      const split = this.rng.range(0.4, 0.6);
      const middle = x0 + (x1 - x0) * split;
      make(x0, middle - 2, z0, z1);
      make(middle + 2, x1, z0, z1);
    } else {
      // Four lots in a two-by-two.
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      make(x0, mx - 2, z0, mz - 2);
      make(mx + 2, x1, z0, mz - 2);
      make(x0, mx - 2, mz + 2, z1);
      make(mx + 2, x1, mz + 2, z1);
    }
    return lots;
  }

  /** A building body, its lit windows, and the clutter on its roof. */
  addBuilding(bodies, windows, details, rooftopLights, spec) {
    const { x0, x1, z0, z1, height, colour } = spec;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const width = x1 - x0;
    const depth = z1 - z0;
    const base = SIDEWALK_HEIGHT;

    bodies.addBox(cx, base + height / 2, cz, width, height, depth, colour);
    // A darker plinth and a lighter parapet give the box a readable silhouette.
    bodies.addBox(cx, base + 0.6, cz, width + 0.5, 1.2, depth + 0.5, shade(colour, 0.55));
    bodies.addBox(cx, base + height + 0.35, cz, width + 0.4, 0.7, depth + 0.4, shade(colour, 1.25));

    this.buildings.push({ x0, x1, z0, z1, height: base + height, colour, name: spec.name ?? null });
    this.buildWindows(windows, spec, base);
    if (spec.district !== 'warehouse') this.buildShopfronts(windows, spec);

    // Rooftop clutter: tanks, vents, aerials.
    const vents = Math.max(1, Math.round((width * depth) / 160));
    for (let v = 0; v < vents; v += 1) {
      const vx = this.rng.range(x0 + 2, x1 - 2);
      const vz = this.rng.range(z0 + 2, z1 - 2);
      const vh = this.rng.range(1, 3.2);
      details.addBox(vx, base + height + vh / 2, vz, this.rng.range(1.4, 3), vh, this.rng.range(1.4, 3), 0x2a2f36);
    }
    if (height > 40) {
      details.addBox(cx, base + height + 4, cz, 0.25, 8, 0.25, 0x54595f);
      rooftopLights.push(cx, base + height + 8.4, cz);
    }
    if (height > 18 && this.rng.chance(0.3)) {
      const tankX = this.rng.range(x0 + 3, x1 - 3);
      const tankZ = this.rng.range(z0 + 3, z1 - 3);
      details.addBox(tankX, base + height + 1.8, tankZ, 3.4, 3.6, 3.4, 0x2b2b2f);
      details.addBox(tankX, base + height + 3.8, tankZ, 3.8, 0.4, 3.8, 0x1e1e22);
    }
    // Neon trim on a few downtown towers.
    if (height > 45 && this.rng.chance(0.55)) {
      const trimColour = this.rng.pick([0x38d6ff, 0xff4f8b, 0xffc24a, 0x7dff9e]);
      const side = this.rng.int(0, 3);
      const trimHeight = height * this.rng.range(0.5, 0.95);
      if (side < 2) {
        const edgeX = side === 0 ? x0 + 0.15 : x1 - 0.15;
        windows.addBox(edgeX, base + trimHeight / 2, cz, 0.12, trimHeight, depth * 0.86, trimColour);
      } else {
        const edgeZ = side === 2 ? z0 + 0.15 : z1 - 0.15;
        windows.addBox(cx, base + trimHeight / 2, edgeZ, width * 0.86, trimHeight, 0.12, trimColour);
      }
    }
  }

  /** A grid of small lit quads on all four faces; unlit cells are simply left out. */
  buildWindows(windows, spec, base) {
    const { x0, x1, z0, z1, height } = spec;
    const litChance = spec.district === 'warehouse' ? 0.38 : spec.district === 'tower' ? 0.7 : 0.56;
    const stepX = 3.4;
    const stepY = 3.6;
    const windowW = 2.0;
    const windowH = 2.4;

    const faces = [
      { axis: 'z', at: z0 - 0.06, from: x0 + 1.4, to: x1 - 1.4, facing: -1 },
      { axis: 'z', at: z1 + 0.06, from: x0 + 1.4, to: x1 - 1.4, facing: 1 },
      { axis: 'x', at: x0 - 0.06, from: z0 + 1.4, to: z1 - 1.4, facing: -1 },
      { axis: 'x', at: x1 + 0.06, from: z0 + 1.4, to: z1 - 1.4, facing: 1 },
    ];

    for (const face of faces) {
      for (let y = base + 3; y < base + height - 1.4; y += stepY) {
        for (let along = face.from; along < face.to - windowW; along += stepX) {
          if (!this.rng.chance(litChance)) continue;
          const colour = this.rng.pick(WINDOW_COLOURS);
          const dim = this.rng.range(0.55, 1);
          const shaded = shade(colour, dim);
          if (face.axis === 'z') {
            const z = face.at;
            windows.addFace(
              [along + windowW / 2, y + windowH / 2, z],
              [windowW / 2, 0, 0],
              [0, windowH / 2, 0],
              [0, 0, face.facing],
              shaded,
            );
          } else {
            const x = face.at;
            windows.addFace(
              [x, y + windowH / 2, along + windowW / 2],
              [0, 0, (windowW / 2) * -face.facing],
              [0, windowH / 2, 0],
              [face.facing, 0, 0],
              shaded,
            );
          }
        }
      }
    }
  }

  /** Lit shop windows at street level, so the pavement has something to walk past. */
  buildShopfronts(windows, spec) {
    const { x0, x1, z0, z1 } = spec;
    const base = SIDEWALK_HEIGHT;
    const faces = [
      { axis: 'z', at: z0 - 0.06, from: x0 + 1, to: x1 - 1, facing: -1 },
      { axis: 'z', at: z1 + 0.06, from: x0 + 1, to: x1 - 1, facing: 1 },
      { axis: 'x', at: x0 - 0.06, from: z0 + 1, to: z1 - 1, facing: -1 },
      { axis: 'x', at: x1 + 0.06, from: z0 + 1, to: z1 - 1, facing: 1 },
    ];
    const shopColours = [0xffd9a0, 0xffc27a, 0xfff0c8, 0x9fe8ff, 0xffb0c8];
    for (const face of faces) {
      for (let along = face.from; along < face.to - 2.4; along += 3.6) {
        if (!this.rng.chance(0.62)) continue;
        const colour = shade(this.rng.pick(shopColours), this.rng.range(0.72, 1));
        const height = 2.3;
        const width = 3.0;
        if (face.axis === 'z') {
          windows.addFace(
            [along + width / 2, base + 1.35, face.at],
            [width / 2, 0, 0],
            [0, height / 2, 0],
            [0, 0, face.facing],
            colour,
          );
        } else {
          windows.addFace(
            [face.at, base + 1.35, along + width / 2],
            [0, 0, (width / 2) * -face.facing],
            [0, height / 2, 0],
            [face.facing, 0, 0],
            colour,
          );
        }
      }
    }
  }

  /** Parking lots get painted stalls; parks get trees, benches and a path. */
  paintLot(slabs, markings, trees, district, x0, x1, z0, z1) {
    if (district === 'park') {
      slabs.addBox((x0 + x1) / 2, 0.06, (z0 + z1) / 2, x1 - x0 - 2, 0.12, z1 - z0 - 2, 0x1c2a22);
      for (let n = 0; n < 9; n += 1) {
        const tx = this.rng.range(x0 + 4, x1 - 4);
        const tz = this.rng.range(z0 + 4, z1 - 4);
        const h = this.rng.range(3, 5.4);
        trees.addBox(tx, SIDEWALK_HEIGHT + h / 2, tz, 0.5, h, 0.5, 0x2a2119);
        trees.addBox(tx, SIDEWALK_HEIGHT + h + 1.4, tz, 3.6, 3.2, 3.6, 0x1d3524);
        trees.addBox(tx, SIDEWALK_HEIGHT + h + 3.1, tz, 2.2, 2, 2.2, 0x24402b);
      }
      for (let n = 0; n < 3; n += 1) {
        const bx = this.rng.range(x0 + 5, x1 - 5);
        const bz = this.rng.range(z0 + 5, z1 - 5);
        trees.addBox(bx, SIDEWALK_HEIGHT + 0.4, bz, 2.6, 0.25, 0.8, 0x3a2e24);
      }
      return;
    }
    // A parking lot: darker tarmac and white stall lines.
    slabs.addBox((x0 + x1) / 2, 0.04, (z0 + z1) / 2, x1 - x0 - 2, 0.1, z1 - z0 - 2, 0x191c20);
    for (let lane = z0 + 5; lane < z1 - 4; lane += 6) {
      markings.addGround(x0 + 4, lane, x1 - 4, lane + 0.18, SIDEWALK_HEIGHT + 0.06, 0x8a9298);
    }
    markings.addGround(x0 + 4, (z0 + z1) / 2 - 0.12, x1 - 4, (z0 + z1) / 2 + 0.12, SIDEWALK_HEIGHT + 0.06, 0x8a9298);
  }

  // ---------------------------------------------------------------- lamps

  buildStreetlights() {
    const poleGeometry = new THREE.BoxGeometry(0.2, 7.4, 0.2);
    const headGeometry = new THREE.BoxGeometry(1.5, 0.24, 0.42);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x1b1f26 });
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffdca8, toneMapped: false });

    const placements = [];
    for (let k = 0; k <= GRID; k += 1) {
      const centre = k * PITCH;
      for (let along = 12; along < PROMENADE_X - 6; along += 30) {
        placements.push({ x: along, z: centre + ROAD_WIDTH / 2 + 2.2, rot: Math.PI });
        placements.push({ x: along, z: centre - ROAD_WIDTH / 2 - 2.2, rot: 0 });
        placements.push({ x: centre + ROAD_WIDTH / 2 + 2.2, z: along, rot: -Math.PI / 2 });
        placements.push({ x: centre - ROAD_WIDTH / 2 - 2.2, z: along, rot: Math.PI / 2 });
      }
    }

    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, placements.length);
    const heads = new THREE.InstancedMesh(headGeometry, headMaterial, placements.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const glowPositions = [];

    placements.forEach((lamp, index) => {
      position.set(lamp.x, 3.7, lamp.z);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), lamp.rot);
      matrix.compose(position, quaternion, scale);
      poles.setMatrixAt(index, matrix);
      position.set(lamp.x + Math.sin(lamp.rot) * 0.6, 7.2, lamp.z + Math.cos(lamp.rot) * 0.6);
      matrix.compose(position, quaternion, scale);
      heads.setMatrixAt(index, matrix);
      glowPositions.push(position.x, 7.1, position.z);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.group.add(poles, heads);

    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
    this.group.add(
      new THREE.Points(
        glowGeometry,
        new THREE.PointsMaterial({
          color: 0xffc98a,
          size: 9,
          sizeAttenuation: false,
          map: makeGlowTexture('rgba(255,224,175,0.95)', 'rgba(255,180,100,0)'),
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );

    // A warm pool of light on the pavement under every lamp: one instanced quad, additive.
    const poolGeometry = new THREE.PlaneGeometry(7, 7);
    poolGeometry.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(
      poolGeometry,
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('rgba(255,196,130,0.75)', 'rgba(255,150,70,0)'),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      placements.length,
    );
    placements.forEach((lamp, index) => {
      position.set(lamp.x + Math.sin(lamp.rot) * 1.4, 0.06, lamp.z + Math.cos(lamp.rot) * 1.4);
      quaternion.identity();
      matrix.compose(position, quaternion, scale);
      pools.setMatrixAt(index, matrix);
    });
    pools.instanceMatrix.needsUpdate = true;
    this.group.add(pools);

    // A handful of real lights near the action, moved with the player each frame.
    this.poolLights = [];
    for (let i = 0; i < 2; i += 1) {
      const light = new THREE.PointLight(0xffb86b, 34, 42, 2);
      light.position.set(0, 7, 0);
      this.scene.add(light);
      this.poolLights.push(light);
    }
    this.lampPositions = placements.map((lamp) => ({ x: lamp.x, z: lamp.z }));
  }

  // ---------------------------------------------------------------- waterfront

  buildWaterfront() {
    const promenade = new MeshBuilder();
    const rail = new MeshBuilder();
    promenade.addGround(PROMENADE_X, -14, WATER_X, 404, 0.4, 0x3c4249);
    for (let z = -10; z < 404; z += 4) {
      rail.addBox(WATER_X - 1.4, 0.9, z, 0.16, 1.8, 0.16, 0x1d2228);
    }
    rail.addBox(WATER_X - 1.4, 1.75, 196, 0.12, 0.12, 410, 0x2b3138);
    rail.addBox(WATER_X - 1.4, 1.1, 196, 0.1, 0.1, 410, 0x2b3138);

    // Two piers reaching into the bay.
    this.piers.push({ x0: WATER_X, x1: 520, z0: 158, z1: 184 });
    this.piers.push({ x0: WATER_X, x1: 540, z0: 330, z1: 360 });
    for (const pier of this.piers) {
      promenade.addBox((pier.x0 + pier.x1) / 2, PIER_HEIGHT / 2, (pier.z0 + pier.z1) / 2, pier.x1 - pier.x0, PIER_HEIGHT, pier.z1 - pier.z0, 0x33302a);
      for (let x = pier.x0 + 2; x < pier.x1; x += 6) {
        promenade.addBox(x, 0.1, pier.z0 + 0.6, 0.5, 0.6, 0.5, 0x22201c);
        promenade.addBox(x, 0.1, pier.z1 - 0.6, 0.5, 0.6, 0.5, 0x22201c);
      }
      // Bollard lights along the pier edge.
      for (let x = pier.x0 + 4; x < pier.x1 - 2; x += 12) {
        promenade.addBox(x, PIER_HEIGHT + 0.7, pier.z1 - 1, 0.18, 1.4, 0.18, 0x1d2228);
        promenade.addBox(x, PIER_HEIGHT + 1.5, pier.z1 - 1, 0.4, 0.3, 0.4, 0xffdca8);
      }
    }
    // A line of lamps along the harbour walk, the brightest thing on the waterfront.
    const lampHeads = new MeshBuilder();
    for (let z = 4; z < 400; z += 26) {
      promenade.addBox(425, 3.4, z, 0.22, 6.8, 0.22, 0x232830);
      promenade.addBox(424.2, 6.9, z, 1.8, 0.16, 0.3, 0x2b3138);
      lampHeads.addBox(423.4, 6.8, z, 0.7, 0.2, 0.36, 0xffe6b8);
    }
    this.group.add(new THREE.Mesh(promenade.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(rail.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(lampHeads.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }

  buildWater() {
    const geometry = new THREE.PlaneGeometry(1800, 1800, 24, 24);
    geometry.rotateX(-Math.PI / 2);
    this.waterMaterial = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          time: { value: 0 },
          deep: { value: new THREE.Color(0x04090f) },
          shallow: { value: new THREE.Color(0x0d2233) },
          glint: { value: new THREE.Color(0x6fa8c8) },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float time;
        varying vec3 vWorld;
        varying float vWave;
        void main() {
          vec3 transformed = position;
          float wave = sin(position.x * 0.08 + time * 0.9) * 0.35
                     + sin(position.z * 0.11 - time * 0.7) * 0.28
                     + sin((position.x + position.z) * 0.03 + time * 0.4) * 0.4;
          transformed.y += wave;
          vec4 world = modelMatrix * vec4(transformed, 1.0);
          vWorld = world.xyz;
          vWave = wave;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float time;
        uniform vec3 deep;
        uniform vec3 shallow;
        uniform vec3 glint;
        varying vec3 vWorld;
        varying float vWave;
        void main() {
          float distanceOut = clamp((vWorld.x - ${WATER_X.toFixed(1)}) / 260.0, 0.0, 1.0);
          vec3 colour = mix(shallow, deep, distanceOut);
          float shimmer = sin(vWorld.x * 0.5 + time * 1.7) * sin(vWorld.z * 0.7 - time * 1.1);
          colour += glint * smoothstep(0.72, 1.0, shimmer) * (0.35 - distanceOut * 0.2);
          colour += glint * smoothstep(0.4, 1.0, vWave) * 0.05;
          // Warm smear where the far skyline's lights reach the water.
          colour += vec3(0.16, 0.12, 0.09) * smoothstep(0.55, 1.0, distanceOut);
          gl_FragColor = vec4(colour, 1.0);
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(geometry, this.waterMaterial);
    water.position.set(WATER_X + 1100, -0.4, 200);
    this.group.add(water);
  }

  /** The far shore: a wall of towers across the bay that the cover shot looks at. */
  buildSkylineAcrossTheBay() {
    const bodies = new MeshBuilder();
    const lights = new MeshBuilder();
    for (let i = 0; i < 46; i += 1) {
      const x = this.rng.range(700, 980);
      const z = this.rng.range(-260, 700);
      const width = this.rng.range(18, 46);
      const depth = this.rng.range(18, 46);
      const height = this.rng.range(30, 190) * (x < 820 ? 1.15 : 0.8);
      bodies.addBox(x, height / 2, z, width, height, depth, 0x0d1420);
      // A few lit floors on each far tower.
      for (let y = 5; y < height - 4; y += 5) {
        for (let w = 0; w < 4; w += 1) {
          if (!this.rng.chance(0.34)) continue;
          const lx = x - width / 2 + 2.5 + w * (width / 4.4);
          lights.addBox(lx, y, z - depth / 2 - 0.1, 2.2, 1.7, 0.2, this.rng.pick(WINDOW_COLOURS));
        }
      }
    }
    // Light pollution: a warm haze hanging over the far shore.
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 220),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('rgba(255,180,120,0.5)', 'rgba(255,140,80,0)'),
        color: 0xff9a5a,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );
    haze.position.set(880, 46, 220);
    haze.rotation.y = -Math.PI / 2;
    this.group.add(haze);

    // Two harbour cranes on the far quay, and a couple of ships with deck lights.
    for (let c = 0; c < 3; c += 1) {
      const cx = this.rng.range(700, 760);
      const cz = this.rng.range(420, 620);
      bodies.addBox(cx, 22, cz, 1.6, 44, 1.6, 0x141a22);
      bodies.addBox(cx + 12, 42, cz, 26, 1.4, 1.4, 0x141a22);
      lights.addBox(cx + 24, 42, cz, 0.8, 0.8, 0.8, 0xff5a3c);
    }
    this.group.add(new THREE.Mesh(bodies.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(lights.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })));

    // Ships at anchor: dark hulls with a handful of working lights.
    for (let s = 0; s < 4; s += 1) {
      const sx = this.rng.range(540, 660);
      const sz = this.rng.range(-100, 380);
      const hull = new THREE.Group();
      const hullMesh = new THREE.Mesh(
        new THREE.BoxGeometry(this.rng.range(40, 70), 6, 12),
        new THREE.MeshLambertMaterial({ color: 0x0b1018 }),
      );
      hull.add(hullMesh);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 8), new THREE.MeshLambertMaterial({ color: 0x141c26 }));
      cabin.position.set(0, 7, 0);
      hull.add(cabin);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd48a, toneMapped: false }),
      );
      lamp.position.set(0, 12, 0);
      hull.add(lamp);
      hull.position.set(sx, 1.5, sz);
      hull.rotation.y = this.rng.range(0, Math.PI);
      this.group.add(hull);
    }
  }

  // ---------------------------------------------------------------- signs

  buildSigns() {
    const glowTexture = makeGlowTexture('rgba(255,140,190,0.9)', 'rgba(255,60,140,0)');
    const add = (x, y, z, facing, lines, colour, glowColour, width) => {
      const sign = makeSignTexture(lines, { color: colour, glow: glowColour });
      const height = width / sign.aspect;
      const material = new THREE.MeshBasicMaterial({
        map: sign.texture,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = facing === 'x-' ? -Math.PI / 2 : facing === 'x+' ? Math.PI / 2 : facing === 'z+' ? 0 : Math.PI;
      this.group.add(mesh);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: new THREE.Color(colour),
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.set(width * 1.7, height * 2.4, 1);
      halo.position.copy(mesh.position);
      this.group.add(halo);
      // A wet smear of the sign's colour on the road below it.
      const reflection = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.5, 12),
        new THREE.MeshBasicMaterial({
          map: makeGlowTexture('rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'),
          color: new THREE.Color(colour),
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      reflection.rotation.x = -Math.PI / 2;
      const towardsStreet = facing === 'x-' ? -1 : facing === 'x+' ? 1 : facing === 'z-' ? -1 : 1;
      const outX = facing.startsWith('x') ? towardsStreet * 6 : 0;
      const outZ = facing.startsWith('z') ? towardsStreet * 6 : 0;
      reflection.position.set(x + outX, 0.05, z + outZ);
      this.group.add(reflection);
      this.signs.push({ x, z, colour });
    };

    add(124.6, 6.4, 241, 'x-', ['THE DROWNED', 'LAMP'], '#ff5b8f', 'rgba(255,80,140,0.6)', 10);
    add(138, 9.2, 229.4, 'z-', ['DROWNED', 'LAMP'], '#ff5b8f', 'rgba(255,80,140,0.6)', 8);
    add(307, 11, 60.6, 'z-', ['SALT', 'COURT'], '#63e6ff', 'rgba(90,220,255,0.6)', 11);
    add(43.4, 7.4, 360, 'x+', ['MARROW', 'MOTORS'], '#ffc44d', 'rgba(255,190,70,0.6)', 8);
    add(230.4, 6.6, 353, 'x-', ['NIGHT OWL', 'DINER'], '#8effc0', 'rgba(120,255,190,0.55)', 7);
    add(192, 74, 121.4, 'z-', ['SABLE', 'FM 88.4'], '#ff8ad8', 'rgba(255,120,210,0.6)', 13);
    add(177.4, 46, 193, 'x-', ['MERIDIAN', 'HOTEL'], '#9fc4ff', 'rgba(150,190,255,0.5)', 9);
    add(452, 9, 157.4, 'z-', ['PIER 9'], '#ffe07a', 'rgba(255,220,120,0.55)', 8);
    add(468, 10, 329.4, 'z-', ['FERRY'], '#7ce0ff', 'rgba(120,220,255,0.55)', 7);
    add(96, 16, 172.4, 'z-', ['HARBOR', 'PAWN'], '#ffa04a', 'rgba(255,160,70,0.5)', 7);
    add(260, 22, 232.4, 'z-', ['LAUNDRY', '24H'], '#b48cff', 'rgba(180,140,255,0.5)', 6);
    add(340, 30, 288.4, 'z-', ['COLD', 'STORAGE'], '#6ef0ff', 'rgba(110,240,255,0.45)', 8);
    add(64, 12, 100.4, 'z-', ['TIDELINE', 'FISH'], '#ffd166', 'rgba(255,210,100,0.5)', 7);
    add(300, 18, 344.4, 'z-', ['KESTREL', 'ARCADE'], '#ff7ac0', 'rgba(255,120,190,0.55)', 8);
    add(140, 14, 288.4, 'z-', ['BOTTLES', '& ICE'], '#9dff7a', 'rgba(150,255,120,0.45)', 6);
  }

  /**
   * Standing billboards on the avenues: a lit panel on two poles, which is where the city says
   * things in letters big enough to read from a car.
   */
  buildBillboards() {
    const frames = new MeshBuilder();
    const boards = [
      { x: 196, z: 214.5, y: 22, facing: 'z+', width: 22, lines: ['SABLE FM', '88.4'], colour: '#ff8ad8' },
      { x: 112, z: 246.5, y: 19, facing: 'z+', width: 18, lines: ['KRAKEN', 'LAGER'], colour: '#6ef0ff' },
      { x: 300, z: 270.5, y: 24, facing: 'z+', width: 20, lines: ['VANE PAWN', 'CASH FOR ANYTHING'], colour: '#ffc44d' },
      { x: 62, z: 102.5, y: 17, facing: 'z+', width: 16, lines: ['TIDELINE', 'FISH CO'], colour: '#9dff7a' },
      { x: 128, z: 96.5, y: 27, facing: 'z+', width: 20, lines: ['SABLE', 'HARBOR'], colour: '#ff5b8f' },
      { x: 262, z: 140.5, y: 33, facing: 'z+', width: 18, lines: ['KRAKEN', 'LAGER'], colour: '#63e6ff' },
      { x: 214, z: 382.5, y: 22, facing: 'z+', width: 24, lines: ['SABLE', 'HARBOR'], colour: '#ff5b8f' },
      { x: 330, z: 382.5, y: 26, facing: 'z+', width: 22, lines: ['KRAKEN', 'LAGER'], colour: '#63e6ff' },
    ];
    for (const board of boards) {
      const sign = makeSignTexture(board.lines, {
        color: board.colour,
        glow: `${board.colour}88`,
        background: 'rgba(8,10,16,0.96)',
      });
      const height = board.width / sign.aspect;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(board.width, height),
        new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true, toneMapped: false, side: THREE.DoubleSide }),
      );
      const facing = board.facing === 'z-' ? Math.PI : 0;
      mesh.position.set(board.x, board.y, board.z);
      mesh.rotation.y = facing;
      this.group.add(mesh);

      // Poles and a backing frame, so the panel stands on the ground rather than floating.
      const bottom = board.y - height / 2;
      frames.addBox(board.x - board.width * 0.3, bottom / 2, board.z, 0.35, bottom, 0.35, 0x1c2128);
      frames.addBox(board.x + board.width * 0.3, bottom / 2, board.z, 0.35, bottom, 0.35, 0x1c2128);
      frames.addBox(board.x, board.y, board.z - Math.cos(facing) * 0.25, board.width + 0.6, height + 0.6, 0.3, 0x141920);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeGlowTexture('rgba(255,255,255,0.7)', 'rgba(255,255,255,0)'),
          color: new THREE.Color(board.colour),
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.set(board.width * 1.5, height * 2.6, 1);
      halo.position.set(board.x, board.y, board.z + (facing === 0 ? 0.5 : -0.5));
      this.group.add(halo);
    }
    this.group.add(new THREE.Mesh(frames.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // ---------------------------------------------------------------- rain

  buildRain() {
    const drops = 620;
    const positions = new Float32Array(drops * 6);
    const speeds = new Float32Array(drops);
    for (let i = 0; i < drops; i += 1) {
      const x = this.rng.range(-40, 40);
      const y = this.rng.range(0, 40);
      const z = this.rng.range(-40, 40);
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x + 0.1;
      positions[i * 6 + 4] = y - 0.9;
      positions[i * 6 + 5] = z;
      speeds[i] = this.rng.range(22, 34);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainSpeeds = speeds;
    this.rain = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x9db8d0, transparent: true, opacity: 0.22, fog: true }),
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  // ---------------------------------------------------------------- data

  buildCollisionIndex() {
    this.buildingIndex.clear();
    this.buildings.forEach((building, index) => {
      const ix0 = Math.floor(building.x0 / PITCH);
      const ix1 = Math.floor(building.x1 / PITCH);
      const iz0 = Math.floor(building.z0 / PITCH);
      const iz1 = Math.floor(building.z1 / PITCH);
      for (let ix = ix0; ix <= ix1; ix += 1) {
        for (let iz = iz0; iz <= iz1; iz += 1) {
          const key = `${ix},${iz}`;
          if (!this.buildingIndex.has(key)) this.buildingIndex.set(key, []);
          this.buildingIndex.get(key).push(index);
        }
      }
    });
  }

  nearbyBuildings(x, z, radius = 12) {
    const found = [];
    const ix0 = Math.floor((x - radius) / PITCH);
    const ix1 = Math.floor((x + radius) / PITCH);
    const iz0 = Math.floor((z - radius) / PITCH);
    const iz1 = Math.floor((z + radius) / PITCH);
    for (let ix = ix0; ix <= ix1; ix += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        const list = this.buildingIndex.get(`${ix},${iz}`);
        if (!list) continue;
        for (const index of list) if (!found.includes(index)) found.push(index);
      }
    }
    return found.map((index) => this.buildings[index]);
  }

  buildGraph() {
    this.nodes = [];
    for (let ix = 0; ix <= GRID; ix += 1) {
      this.nodes[ix] = [];
      for (let iz = 0; iz <= GRID; iz += 1) {
        const node = { ix, iz, x: ix * PITCH, z: iz * PITCH, links: [] };
        this.nodes[ix][iz] = node;
        this.spawnPoints.push({ x: node.x, z: node.z });
      }
    }
    for (let ix = 0; ix <= GRID; ix += 1) {
      for (let iz = 0; iz <= GRID; iz += 1) {
        const node = this.nodes[ix][iz];
        if (ix > 0) node.links.push(this.nodes[ix - 1][iz]);
        if (ix < GRID) node.links.push(this.nodes[ix + 1][iz]);
        if (iz > 0) node.links.push(this.nodes[ix][iz - 1]);
        if (iz < GRID) node.links.push(this.nodes[ix][iz + 1]);
      }
    }
  }

  nodeAt(ix, iz) {
    const cx = Math.max(0, Math.min(GRID, ix));
    const cz = Math.max(0, Math.min(GRID, iz));
    return this.nodes[cx][cz];
  }

  nearestNode(x, z) {
    return this.nodeAt(Math.round(x / PITCH), Math.round(z / PITCH));
  }

  /** Shortest route along the street grid, as a list of intersections (breadth first, tiny graph). */
  pathBetween(start, goal) {
    if (!start || !goal) return [];
    if (start === goal) return [start];
    const queue = [start];
    const cameFrom = new Map([[start, null]]);
    while (queue.length > 0) {
      const node = queue.shift();
      if (node === goal) break;
      for (const link of node.links) {
        if (cameFrom.has(link)) continue;
        cameFrom.set(link, node);
        queue.push(link);
      }
    }
    if (!cameFrom.has(goal)) return [];
    const path = [];
    let node = goal;
    while (node) {
      path.unshift(node);
      node = cameFrom.get(node);
    }
    return path;
  }

  /** Ground height at a point: road, raised sidewalk or pier deck. */
  groundAt(x, z) {
    for (const pier of this.piers) {
      if (x >= pier.x0 && x <= pier.x1 && z >= pier.z0 && z <= pier.z1) return PIER_HEIGHT;
    }
    if (x > PROMENADE_X) return 0.4;
    for (const block of this.blocks) {
      if (x > block.x0 && x < block.x1 && z > block.z0 && z < block.z1) return SIDEWALK_HEIGHT;
    }
    return 0;
  }

  isWater(x, z) {
    if (x <= WATER_X) return false;
    for (const pier of this.piers) {
      if (x <= pier.x1 + 2 && z >= pier.z0 - 1 && z <= pier.z1 + 1) return false;
    }
    return true;
  }

  isInsideBuilding(x, z) {
    for (const index of this.nearbyBuildingIndices(x, z, 2)) {
      const building = this.buildings[index];
      if (x > building.x0 && x < building.x1 && z > building.z0 && z < building.z1) return true;
    }
    return false;
  }

  nearbyBuildingIndices(x, z, radius) {
    const found = [];
    const ix0 = Math.floor((x - radius) / PITCH);
    const ix1 = Math.floor((x + radius) / PITCH);
    const iz0 = Math.floor((z - radius) / PITCH);
    const iz1 = Math.floor((z + radius) / PITCH);
    for (let ix = ix0; ix <= ix1; ix += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        const list = this.buildingIndex.get(`${ix},${iz}`);
        if (!list) continue;
        for (const index of list) if (!found.includes(index)) found.push(index);
      }
    }
    return found;
  }

  /**
   * Push a circle out of any building it overlaps. The player, the cars and the pedestrians all
   * call this, so nothing in the city walks through a wall.
   */
  resolveCircle(position, radius) {
    const indices = this.nearbyBuildingIndices(position.x, position.z, radius + 4);
    for (const index of indices) {
      const building = this.buildings[index];
      const closestX = Math.max(building.x0, Math.min(position.x, building.x1));
      const closestZ = Math.max(building.z0, Math.min(position.z, building.z1));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > radius * radius) continue;
      if (distanceSq > 1e-6) {
        const distance = Math.sqrt(distanceSq);
        position.x += (dx / distance) * (radius - distance);
        position.z += (dz / distance) * (radius - distance);
      } else {
        // Dead centre: shove out along the shortest way to a face.
        const toLeft = position.x - building.x0;
        const toRight = building.x1 - position.x;
        const toBack = position.z - building.z0;
        const toFront = building.z1 - position.z;
        const smallest = Math.min(toLeft, toRight, toBack, toFront);
        if (smallest === toLeft) position.x = building.x0 - radius;
        else if (smallest === toRight) position.x = building.x1 + radius;
        else if (smallest === toBack) position.z = building.z0 - radius;
        else position.z = building.z1 + radius;
      }
    }
    // The harbour wall and the city edges.
    if (this.isWater(position.x, position.z)) position.x = Math.min(position.x, WATER_X - 1);
    position.x = Math.max(this.bounds.x0, Math.min(this.bounds.x1, position.x));
    position.z = Math.max(this.bounds.z0, Math.min(this.bounds.z1, position.z));
  }

  /**
   * The push that takes a point out of the nearest building wall, with that wall's outward
   * normal. A car tests its four corners with this: a corner that has crossed a wall comes back
   * with the shortest way out and the direction of the face it crossed.
   */
  wallContact(x, z, radius = 0) {
    let best = null;
    for (const index of this.nearbyBuildingIndices(x, z, radius + 4)) {
      const building = this.buildings[index];
      const closestX = Math.max(building.x0, Math.min(x, building.x1));
      const closestZ = Math.max(building.z0, Math.min(z, building.z1));
      const dx = x - closestX;
      const dz = z - closestZ;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > radius * radius) continue;

      let nx;
      let nz;
      let depth;
      if (distanceSq > 1e-6) {
        const distance = Math.sqrt(distanceSq);
        nx = dx / distance;
        nz = dz / distance;
        depth = radius - distance;
      } else {
        // Inside the rectangle: leave by the nearest face.
        const toLeft = x - building.x0;
        const toRight = building.x1 - x;
        const toBack = z - building.z0;
        const toFront = building.z1 - z;
        const smallest = Math.min(toLeft, toRight, toBack, toFront);
        if (smallest === toLeft) {
          nx = -1;
          nz = 0;
          depth = toLeft + radius;
        } else if (smallest === toRight) {
          nx = 1;
          nz = 0;
          depth = toRight + radius;
        } else if (smallest === toBack) {
          nx = 0;
          nz = -1;
          depth = toBack + radius;
        } else {
          nx = 0;
          nz = 1;
          depth = toFront + radius;
        }
      }
      if (!best || depth > best.depth) best = { nx, nz, depth };
    }
    return best;
  }

  /** How far along a segment the view is still clear of buildings (0 blocked, 1 clear). */
  cameraClearT(from, to) {
    const steps = 14;
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (y < 0.4) return Math.max(0.12, t - 0.1);
      for (const index of this.nearbyBuildingIndices(x, z, 1)) {
        const building = this.buildings[index];
        if (x > building.x0 - 0.3 && x < building.x1 + 0.3 && z > building.z0 - 0.3 && z < building.z1 + 0.3) {
          if (y < building.height + 0.4) return Math.max(0.12, t - 0.08);
        }
      }
    }
    return 1;
  }

  /** A random point in a traffic lane, for spawning cars and police out of sight. */
  randomRoadPoint(rng, nearX = 196, nearZ = 196, minDistance = 0, maxDistance = 400) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const horizontal = rng.chance(0.5);
      const line = rng.int(0, GRID);
      const along = rng.range(10, PROMENADE_X - 10);
      const lane = rng.chance(0.5) ? 4 : -4;
      const x = horizontal ? along : line * PITCH + lane;
      const z = horizontal ? line * PITCH + lane : along;
      const distance = Math.hypot(x - nearX, z - nearZ);
      if (distance < minDistance || distance > maxDistance) continue;
      return { x, z, horizontal };
    }
    return { x: 196, z: 196, horizontal: true };
  }

  update(dt, focus) {
    this.elapsed += dt;
    if (this.waterMaterial) this.waterMaterial.uniforms.time.value = this.elapsed;

    // Rain follows the camera in a moving box and falls.
    if (this.rain) {
      const positions = this.rain.geometry.attributes.position.array;
      const speeds = this.rainSpeeds;
      const drops = speeds.length;
      for (let i = 0; i < drops; i += 1) {
        const fall = speeds[i] * dt;
        positions[i * 6 + 1] -= fall;
        positions[i * 6 + 4] -= fall;
        if (positions[i * 6 + 4] < -1) {
          const x = focus.x + (Math.random() - 0.5) * 70;
          const z = focus.z + (Math.random() - 0.5) * 70;
          positions[i * 6] = x;
          positions[i * 6 + 1] = 34 + Math.random() * 8;
          positions[i * 6 + 2] = z;
          positions[i * 6 + 3] = x + 0.12;
          positions[i * 6 + 4] = positions[i * 6 + 1] - 0.9;
          positions[i * 6 + 5] = z;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    if (this.beaconMaterial) {
      this.beaconMaterial.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.elapsed * 3.4));
      this.beaconMaterial.transparent = true;
    }

    // Move the three working point lights to the nearest lamps around the player.
    if (this.poolLights) {
      const nearest = [];
      for (const lamp of this.lampPositions) {
        const d = (lamp.x - focus.x) ** 2 + (lamp.z - focus.z) ** 2;
        if (nearest.length < 2) {
          nearest.push({ lamp, d });
          nearest.sort((a, b) => a.d - b.d);
        } else if (d < nearest[1].d) {
          nearest[1] = { lamp, d };
          nearest.sort((a, b) => a.d - b.d);
        }
      }
      nearest.forEach((entry, index) => {
        const light = this.poolLights[index];
        light.position.set(entry.lamp.x, 6.6, entry.lamp.z);
        light.intensity = entry.d < 900 ? 38 : 0;
      });
    }
  }
}

/** Darken (factor < 1) or lighten (factor > 1) a hex colour, staying inside the byte range. */
export function shade(colour, factor) {
  const r = Math.min(255, Math.round(((colour >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((colour >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((colour & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}
