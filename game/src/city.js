// Vesper Bay: a seeded harbour city at night. A street grid of asphalt, raised
// sidewalks, blocks of towers, sodium streetlights, neon signs, a working waterfront
// and a skyline that keeps going past the fog. Buildings, poles and paint are each
// merged into a handful of draw calls, and the city exposes its roads, blocks and
// buildings so the minimap, the traffic and the police all read the same map.



import * as THREE from '../vendor/three.min.js';
import { makeRng, makeNoise2D } from './seed.js';
import {
  GeometryBuilder, linear, makeCanvas, canvasTexture, makeFacadeTexture, makeSignTexture,
  makeGlowTexture, makeStarField, makeSkyDome, makeStorefrontTexture,
} from './geometry.js';

export const CITY_GRID = {
  spacing: 58,
  roadHalf: 8,
  sidewalk: 4.5,
  roadsX: 8,
  roadsZ: 7,
  waterZ: 185,
  quayZ: 153,
};

const DISTRICTS = [
  { name: 'SALT ROW', test: (x, z) => z > 96 },
  { name: 'KITE HILL', test: (x, z) => z < -86 },
  { name: 'LUMEN MILE', test: (x) => x > 86 },
  { name: 'FOUNDRY ROW', test: (x) => x < -86 },
  { name: 'THE NARROWS', test: () => true },
];

const SIGN_WORDS = [
  ['NOODLE BAR', '#ff5a3c'], ['24 HOUR', '#5ce9ff'], ['PAWN', '#ffc24a'],
  ['MOTEL', '#ff2f6d'], ['LIQUOR', '#8cff6a'], ['ARCADE', '#c07bff'],
  ['TATTOO', '#ff8a3c'], ['CASH', '#5ce9ff'], ['VESPER', '#ff2f6d'],
  ['DINER', '#ffd35c'], ['HOTEL', '#7ea8ff'], ['REPAIR', '#9dffc4'],
  ['CINEMA', '#ff6bd6'], ['DOCK 9', '#5ce9ff'], ['LOAN', '#ffc24a'],
  ['CLUB', '#ff2f6d'], ['PHARMACY', '#8cff6a'], ['BAIL', '#ffb347'],
];

const FACADE_PALETTES = [
  { wall: '#6e7378', litChance: 0.34, lights: ['#ffd9a0', '#ffe9c4', '#ffc98a'] },
  { wall: '#5c6068', litChance: 0.28, lights: ['#bfe8ff', '#dff3ff', '#9fd6ff'] },
  { wall: '#75645c', litChance: 0.38, lights: ['#ffcf8a', '#ffb066', '#ffe0b0'] },
  { wall: '#63606e', litChance: 0.22, lights: ['#e3c8ff', '#ffd9f0', '#c8b0ff'] },
  { wall: '#5a6a64', litChance: 0.31, lights: ['#c9ffd9', '#e8ffe8', '#a8f0c0'] },
];

const WALL_TINTS = [0x8a93a0, 0x7a6f68, 0x6b7d86, 0x7d7386, 0x6e7d72, 0x8c8278, 0x5f6a76, 0x776d7a];

export function buildCity(scene, seed = 1) {
  const rng = makeRng(seed);
  const noise = makeNoise2D(seed ^ 0x51f15e);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const { spacing, roadHalf, roadsX, roadsZ, waterZ, quayZ } = CITY_GRID;
  const halfX = ((roadsX - 1) * spacing) / 2;
  const roadX = [];
  const roadZ = [];
  for (let i = 0; i < roadsX; i += 1) roadX.push(-halfX + i * spacing);
  for (let j = 0; j < roadsZ; j += 1) roadZ.push(-halfX + j * spacing);
  const lastZ = roadZ[roadZ.length - 1];
  const bounds = { minX: roadX[0] - roadHalf - 4, maxX: roadX[roadsX - 1] + roadHalf + 4, minZ: roadZ[0] - roadHalf - 4, maxZ: waterZ - 5 };

  const buildings = [];
  const blocks = [];
  const roadRects = [];
  const sidewalkRects = [];
  const lamps = [];
  const signs = [];

  buildSky(group, rng, seed);
  buildGround(group);
  buildRoadPaint(group, roadX, roadZ, roadHalf, lastZ);
  buildBlocksAndBuildings(group, rng, noise, { roadX, roadZ, roadHalf, buildings, blocks, sidewalkRects, signs });
  buildStreetlights(group, rng, { roadX, roadZ, roadHalf, lamps, blocks });
  const neonSigns = buildNeon(group, rng, signs);
  buildHarbour(group, rng, noise, { roadX, roadZ, roadHalf, quayZ, buildings });
  buildSkyline(group, rng, { roadX, roadZ });
  buildProps(group, rng, { roadX, roadZ, roadHalf });
  const water = buildWater(group, waterZ);

  for (const x of roadX) roadRects.push({ x0: x - roadHalf, x1: x + roadHalf, z0: bounds.minZ, z1: lastZ + roadHalf, axis: 'z' });
  for (const z of roadZ) roadRects.push({ x0: bounds.minX, x1: bounds.maxX, z0: z - roadHalf, z1: z + roadHalf, axis: 'x' });

  const roadNodes = [];
  for (const x of roadX) for (const z of roadZ) roadNodes.push({ x, z });

  const city = {
    group,
    seed,
    bounds,
    roadX,
    roadZ,
    roadHalf,
    spacing,
    waterZ,
    quayZ,
    sidewalkHeight: 0.14,
    buildings,
    blocks,
    roads: roadRects,
    sidewalks: sidewalkRects,
    lamps,
    signs: neonSigns,
    roadNodes,
    water,

    districtAt(x, z) {
      for (const district of DISTRICTS) if (district.test(x, z)) return district.name;
      return 'VESPER BAY';
    },

    isRoad(x, z) {
      for (const cx of roadX) if (Math.abs(x - cx) < roadHalf) return true;
      for (const cz of roadZ) if (Math.abs(z - cz) < roadHalf) return true;
      return false;
    },

    groundHeight(x, z) {
      if (z > lastZ + roadHalf) return 0.14;
      if (city.isRoad(x, z)) return 0;
      for (const pad of sidewalkRects) {
        if (x > pad.x0 && x < pad.x1 && z > pad.z0 && z < pad.z1) return 0.14;
      }
      return 0;
    },


    resolveCollision(x, z, radius) {
      let px = x;
      let pz = z;
      for (const b of buildings) {
        const minX = b.minX - radius;
        const maxX = b.maxX + radius;
        const minZ = b.minZ - radius;
        const maxZ = b.maxZ + radius;
        if (px > minX && px < maxX && pz > minZ && pz < maxZ) {
          const left = px - minX;
          const right = maxX - px;
          const back = pz - minZ;
          const front = maxZ - pz;
          const least = Math.min(left, right, back, front);
          if (least === left) px = minX;
          else if (least === right) px = maxX;
          else if (least === back) pz = minZ;
          else pz = maxZ;
        }
      }
      if (px < bounds.minX + radius) px = bounds.minX + radius;
      if (px > bounds.maxX - radius) px = bounds.maxX - radius;
      if (pz < bounds.minZ + radius) pz = bounds.minZ + radius;
      if (pz > bounds.maxZ - radius) pz = bounds.maxZ - radius;
      return { x: px, z: pz, blocked: px !== x || pz !== z };
    },


    nearestRoad(x, z) {
      let best = { x, z, heading: 0, distance: Infinity };
      for (const cx of roadX) {
        const d = Math.abs(x - cx);
        if (d < best.distance) best = { x: cx, z, heading: z > 0 ? Math.PI : 0, distance: d };
      }
      for (const cz of roadZ) {
        const d = Math.abs(z - cz);
        if (d < best.distance) best = { x, z: cz, heading: x > 0 ? -Math.PI / 2 : Math.PI / 2, distance: d };
      }
      return best;
    },

    randomSpawn(rng2, awayFrom = null, minDistance = 0) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const node = roadNodes[Math.floor(rng2.next() * roadNodes.length)];
        const alongX = rng2.chance(0.5);
        const t = rng2.float(-1, 1) * spacing * 0.5;
        const x = node.x + (alongX ? t : rng2.sign() * (roadHalf - 3));
        const z = node.z + (alongX ? rng2.sign() * (roadHalf - 3) : t);
        if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDistance) continue;
        return { x, z, heading: alongX ? (rng2.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng2.chance(0.5) ? 0 : Math.PI) };
      }
      return { x: roadX[0], z: roadZ[0], heading: 0 };
    },

    update(dt, time) {
      water.material.uniforms.uTime.value = time;
      water.position.x = 0;
    },
  };

  return city;
}

function buildSky(group, rng, seed) {
  group.add(makeSkyDome());

  const stars = makeStarField(700, 900, rng);
  group.add(stars);

  const moonTexture = (() => {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.16, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(232,242,255,1)');
    g.addColorStop(0.22, 'rgba(210,228,255,0.92)');
    g.addColorStop(0.3, 'rgba(150,180,220,0.35)');
    g.addColorStop(1, 'rgba(90,120,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvasTexture(canvas);
  })();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture, transparent: true, depthWrite: false, fog: false }));
  moon.scale.set(150, 150, 1);
  moon.position.set(-420, 360, -700);
  group.add(moon);

  const haze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,190,150,1)', 'rgba(255,150,90,0)'),
    color: 0x3a3038,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }));
  haze.scale.set(1600, 420, 1);
  haze.position.set(0, 30, -760);
  group.add(haze);
}

function buildGround(group) {
  const asphalt = new THREE.MeshStandardMaterial({ color: linear(0x15171d), roughness: 0.48, metalness: 0.32 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), asphalt);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.02;
  plane.receiveShadow = false;
  group.add(plane);


  const concrete = new THREE.MeshStandardMaterial({ color: linear(0x1b1c20), roughness: 0.9, metalness: 0.05 });
  const quayDepth = CITY_GRID.waterZ - CITY_GRID.quayZ;
  const quay = new THREE.Mesh(new THREE.BoxGeometry(470, 0.3, quayDepth), concrete);
  quay.position.set(0, 0.02, CITY_GRID.quayZ + quayDepth / 2);
  group.add(quay);
}

function buildRoadPaint(group, roadX, roadZ, roadHalf, lastZ) {
  const paint = new GeometryBuilder();
  const dash = linear(0x8b9098);
  const edge = linear(0x6d737c);
  const cross = linear(0x9aa1aa);

  const dashed = (x0, z0, x1, z1, width, color, dashLength = 4.2, gap = 5.2) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    const step = dashLength + gap;
    for (let t = 0; t < length; t += step) {
      const cx = x0 + ux * (t + dashLength / 2);
      const cz = z0 + uz * (t + dashLength / 2);
      const alongX = Math.abs(uz) < 0.5;
      paint.addGroundQuad(cx, 0.012, cz, alongX ? dashLength : width, alongX ? width : dashLength, color);
    }
  };

  const solid = (x0, z0, x1, z1, width, color) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    paint.addGroundQuad((x0 + x1) / 2, 0.012, (z0 + z1) / 2, alongX ? Math.abs(x1 - x0) : width, alongX ? width : Math.abs(z1 - z0), color);
  };

  for (const x of roadX) {
    dashed(x, -210, x, lastZ + roadHalf, 0.16, dash);
    dashed(x - 4, -210, x - 4, lastZ + roadHalf, 0.12, edge, 3, 7);
    dashed(x + 4, -210, x + 4, lastZ + roadHalf, 0.12, edge, 3, 7);
    solid(x - roadHalf + 0.5, -210, x - roadHalf + 0.5, lastZ + roadHalf, 0.12, edge);
    solid(x + roadHalf - 0.5, -210, x + roadHalf - 0.5, lastZ + roadHalf, 0.12, edge);
  }
  for (const z of roadZ) {
    dashed(-210, z, 210, z, 0.16, dash);
    dashed(-210, z - 4, 210, z - 4, 0.12, edge, 3, 7);
    dashed(-210, z + 4, 210, z + 4, 0.12, edge, 3, 7);
    solid(-210, z - roadHalf + 0.5, 210, z - roadHalf + 0.5, 0.12, edge);
    solid(-210, z + roadHalf - 0.5, 210, z + roadHalf - 0.5, 0.12, edge);
  }


  for (const x of roadX) {
    for (const z of roadZ) {
      for (const side of [-1, 1]) {
        for (let i = -3; i <= 3; i += 1) {
          paint.addGroundQuad(x + i * 2.1, 0.014, z + side * (roadHalf + 2.2), 1.1, 3.4, cross);
          paint.addGroundQuad(x + side * (roadHalf + 2.2), 0.014, z + i * 2.1, 3.4, 1.1, cross);
        }
      }
    }
  }

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const mesh = new THREE.Mesh(paint.build(), material);
  mesh.renderOrder = 2;
  group.add(mesh);
}

function buildBlocksAndBuildings(group, rng, noise, ctx) {
  const { roadX, roadZ, roadHalf, buildings, blocks, sidewalkRects, signs } = ctx;
  const pads = new GeometryBuilder();
  const padColor = linear(0x24262b);
  const curbColor = linear(0x30333a);

  const facadeTextures = FACADE_PALETTES.map((palette) => makeFacadeTexture(rng, palette));
  const builders = facadeTextures.map(() => new GeometryBuilder());
  const shopTexture = makeStorefrontTexture(rng);
  const shopBuilder = new GeometryBuilder();
  const rooftopBuilder = new GeometryBuilder();
  const roofDark = linear(0x15171c);

  const blockInner = CITY_GRID.spacing - roadHalf * 2;

  for (let i = 0; i < roadX.length - 1; i += 1) {
    for (let j = 0; j < roadZ.length - 1; j += 1) {
      const x0 = roadX[i] + roadHalf;
      const x1 = roadX[i + 1] - roadHalf;
      const z0 = roadZ[j] + roadHalf;
      const z1 = roadZ[j + 1] - roadHalf;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const pad = { x0, x1, z0, z1, cx, cz };
      blocks.push(pad);
      sidewalkRects.push(pad);

      pads.addBox(cx, 0.07, cz, blockInner, 0.14, blockInner, padColor, { skipBottom: true });
      pads.addBox(cx, 0.145, cz, blockInner, 0.02, blockInner, curbColor, { skipBottom: true });


      const centrality = Math.max(0, 1 - Math.hypot(cx, cz + 20) / 330);
      const towerChance = 0.18 + centrality * 0.55;

      const layout = rng.next();
      let lots;
      const inset = 4.8;
      if (layout < 0.28) {
        lots = [{ x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset }];
      } else if (layout < 0.55) {
        const split = rng.float(0.4, 0.6);
        const mid = x0 + (x1 - x0) * split;
        lots = [
          { x0: x0 + inset, x1: mid - 0.7, z0: z0 + inset, z1: z1 - inset },
          { x0: mid + 0.7, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset },
        ];
      } else if (layout < 0.8) {
        const split = rng.float(0.4, 0.6);
        const mid = z0 + (z1 - z0) * split;
        lots = [
          { x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: mid - 0.7 },
          { x0: x0 + inset, x1: x1 - inset, z0: mid + 0.7, z1: z1 - inset },
        ];
      } else {
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        lots = [
          { x0: x0 + inset, x1: mx - 0.7, z0: z0 + inset, z1: mz - 0.7 },
          { x0: mx + 0.7, x1: x1 - inset, z0: z0 + inset, z1: mz - 0.7 },
          { x0: x0 + inset, x1: mx - 0.7, z0: mz + 0.7, z1: z1 - inset },
          { x0: mx + 0.7, x1: x1 - inset, z0: mz + 0.7, z1: z1 - inset },
        ];
      }

      for (const lot of lots) {
        if (rng.chance(0.07)) {
          addParkingLot(group, rng, lot);
          continue;
        }
        const w = lot.x1 - lot.x0;
        const d = lot.z1 - lot.z0;
        if (w < 6 || d < 6) continue;
        const lotCx = (lot.x0 + lot.x1) / 2;
        const lotCz = (lot.z0 + lot.z1) / 2;
        const tower = rng.chance(towerChance);
        const grain = noise(lotCx * 0.02, lotCz * 0.02);
        let height = tower
          ? 26 + centrality * 62 * rng.float(0.55, 1.25) + grain * 18
          : 9 + centrality * 16 + grain * 9 + rng.float(0, 8);
        if (rng.chance(0.06)) height = rng.float(6, 10);
        height = Math.max(6, Math.min(128, height));
        const style = rng.int(0, facadeTextures.length - 1);
        const tint = linear(WALL_TINTS[rng.int(0, WALL_TINTS.length - 1)]);
        const width = w - rng.float(0.4, 1.6);
        const depth = d - rng.float(0.4, 1.6);
        const bx = lotCx;
        const bz = lotCz;

        const builder = builders[style];
        builder.addBox(bx, 0.14 + height / 2, bz, width, height, depth, tint, {
          uvScale: 27,
          roofColor: roofDark,
          topUv: 0.003,
          uvOffset: rng.float(0, 1),
        });

        if (height > 5 && rng.chance(0.82)) {
          shopBuilder.addBox(bx, 0.14 + 1.75, bz, width + 0.14, 3.5, depth + 0.14, linear(0xcfd6e0), {
            uvScale: [12, 3.5], skipBottom: true, topUv: 0.003,
          });
        }


        if (tower && rng.chance(0.55) && height > 34) {
          const upper = height * rng.float(0.3, 0.55);
          builder.addBox(bx, 0.14 + height + upper / 2, bz, width * 0.72, upper, depth * 0.72, tint, {
            uvScale: 27, roofColor: roofDark, topUv: 0.003,
          });
          height += upper;
        }
        buildings.push({
          x: bx, z: bz, w: width, d: depth, h: height,
          minX: bx - width / 2, maxX: bx + width / 2, minZ: bz - depth / 2, maxZ: bz + depth / 2,
          style, tint,
        });


        const roofY = 0.14 + height;
        if (height > 52 && rng.chance(0.5)) {
          const word = SIGN_WORDS[rng.int(0, SIGN_WORDS.length - 1)];
          const side = rng.chance(0.5) ? 1 : -1;
          signs.push({
            text: word[0],
            color: word[1],
            x: bx,
            y: roofY + 4.2,
            z: bz + side * (depth / 2 - 0.6),
            axis: 'z',
            facing: side,
            scale: 2.6,
            rooftop: true,
          });
        }
        if (rng.chance(0.5)) {
          rooftopBuilder.addBox(bx + rng.float(-width * 0.25, width * 0.25), roofY + 1.4, bz + rng.float(-depth * 0.25, depth * 0.25), 2.2, 2.8, 2.0, linear(0x2a2d33), { skipBottom: true });
        }
        if (height > 40 && rng.chance(0.45)) {
          const mast = rng.float(6, 16);
          rooftopBuilder.addCylinder(bx, roofY + mast / 2, bz, 0.18, 0.32, mast, 5, linear(0x3a3f47), { cap: false });
          rooftopBuilder.addBox(bx, roofY + mast, bz, 0.7, 0.7, 0.7, linear(0xff3b3b), { skipBottom: true });
        }
        if (rng.chance(0.2) && height < 60) {
          rooftopBuilder.addCylinder(bx + width * 0.2, roofY + 2.4, bz - depth * 0.2, 2.1, 2.3, 4.6, 8, linear(0x3d4046), { cap: true });
        }


        if (height > 9 && rng.chance(0.55)) {
          let nearestX = roadX[0];
          for (const value of roadX) if (Math.abs(value - bx) < Math.abs(nearestX - bx)) nearestX = value;
          let nearestZ = roadZ[0];
          for (const value of roadZ) if (Math.abs(value - bz) < Math.abs(nearestZ - bz)) nearestZ = value;
          const toX = nearestX - bx;
          const toZ = nearestZ - bz;
          const faceX = Math.abs(toX) < Math.abs(toZ);
          const side = Math.sign(faceX ? toX : toZ) || 1;
          const word = SIGN_WORDS[rng.int(0, SIGN_WORDS.length - 1)];
          signs.push({
            text: word[0],
            color: word[1],
            x: faceX ? bx + side * (width / 2 + 0.35) : bx,
            y: 0.14 + rng.float(4.5, Math.min(26, height - 3)),
            z: faceX ? bz : bz + side * (depth / 2 + 0.35),
            axis: faceX ? 'x' : 'z',
            facing: side,
            scale: rng.float(1.05, 1.75),
          });
        }
      }
    }
  }

  const padMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 });
  group.add(new THREE.Mesh(pads.build(), padMaterial));

  builders.forEach((builder, index) => {
    if (builder.isEmpty) return;
    const material = new THREE.MeshStandardMaterial({
      map: facadeTextures[index],
      emissiveMap: facadeTextures[index],
      emissive: 0xffffff,
      emissiveIntensity: 1.12,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.12,
      fog: true,
    });
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.name = `buildings-${index}`;
    group.add(mesh);
  });

  if (!shopBuilder.isEmpty) {
    const shopMaterial = new THREE.MeshStandardMaterial({
      map: shopTexture,
      emissiveMap: shopTexture,
      emissive: 0xffffff,
      emissiveIntensity: 1.45,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.1,
      fog: true,
    });
    group.add(new THREE.Mesh(shopBuilder.build(), shopMaterial));
  }

  if (!rooftopBuilder.isEmpty) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1 });
    group.add(new THREE.Mesh(rooftopBuilder.build(), material));
  }
}

function addParkingLot(group, rng, lot) {
  const paint = new GeometryBuilder();
  const line = linear(0x6c7178);
  const width = lot.x1 - lot.x0;
  const depth = lot.z1 - lot.z0;
  const rows = Math.max(2, Math.floor(width / 3.2));
  for (let i = 0; i < rows; i += 1) {
    const x = lot.x0 + (i + 0.5) * (width / rows);
    paint.addGroundQuad(x, 0.152, (lot.z0 + lot.z1) / 2, 0.12, depth * 0.7, line);
  }
  const mesh = new THREE.Mesh(paint.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(mesh);
}

function buildStreetlights(group, rng, ctx) {
  const { roadX, roadZ, roadHalf, lamps, blocks } = ctx;
  const poles = new GeometryBuilder();
  const bulbs = new GeometryBuilder();
  const poleColor = linear(0x1a1d22);
  const bulbColor = linear(0xffd9a0);
  const red = linear(0xff3a3a);
  const green = linear(0x4dffa0);

  const addLamp = (x, z, angle) => {
    poles.addCylinder(x, 3.6, z, 0.11, 0.16, 7.2, 6, poleColor, { cap: false });
    const armX = Math.cos(angle) * 1.4;
    const armZ = Math.sin(angle) * 1.4;
    poles.addBox(x + armX / 2, 7.2, z + armZ / 2, Math.abs(armX) + 0.16, 0.16, Math.abs(armZ) + 0.16, poleColor, { skipBottom: true });
    bulbs.addBox(x + armX, 7.1, z + armZ, 0.7, 0.16, 0.7, bulbColor, { skipBottom: true });
    lamps.push({ x: x + armX, y: 7.0, z: z + armZ, radius: 12 });
  };

  for (const x of roadX) {
    for (let z = -200; z < 140; z += 30) {
      const side = Math.floor((z + 200) / 30) % 2 === 0 ? -1 : 1;
      addLamp(x + side * (roadHalf + 1.2), z, side > 0 ? Math.PI : 0);
    }
  }
  for (const z of roadZ) {
    for (let x = -196; x < 204; x += 30) {
      const side = Math.floor((x + 196) / 30) % 2 === 0 ? -1 : 1;
      addLamp(x, z + side * (roadHalf + 1.2), side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }


  for (let i = 0; i < roadX.length; i += 1) {
    for (let j = 0; j < roadZ.length; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      const x = roadX[i] + roadHalf + 1.6;
      const z = roadZ[j] + roadHalf + 1.6;
      poles.addCylinder(x, 2.2, z, 0.09, 0.12, 4.4, 5, poleColor, { cap: false });
      poles.addBox(x, 4.3, z, 0.5, 1.2, 0.34, poleColor, { skipBottom: true });
      bulbs.addBox(x, 4.62, z + 0.18, 0.24, 0.24, 0.06, red, { skipBottom: true });
      bulbs.addBox(x, 4.02, z + 0.18, 0.24, 0.24, 0.06, green, { skipBottom: true });
    }
  }

  const poleMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.75 });
  group.add(new THREE.Mesh(poles.build(), poleMaterial));

  const bulbMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false });
  group.add(new THREE.Mesh(bulbs.build(), bulbMaterial));


  const glowTexture = makeGlowTexture('rgba(255,214,150,1)', 'rgba(255,150,60,0)');
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: true, color: linear(0xffc070), toneMapped: false,
  });
  const quad = new THREE.PlaneGeometry(1, 1);
  const glowA = new THREE.InstancedMesh(quad, glowMaterial, lamps.length);
  const glowB = new THREE.InstancedMesh(quad, glowMaterial, lamps.length);
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: true, color: linear(0xffe2c0), toneMapped: false,
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), poolMaterial, lamps.length);
  const dummy = new THREE.Object3D();
  lamps.forEach((lamp, index) => {
    dummy.position.set(lamp.x, lamp.y, lamp.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(3.4, 3.4, 1);
    dummy.updateMatrix();
    glowA.setMatrixAt(index, dummy.matrix);
    dummy.rotation.set(0, Math.PI / 2, 0);
    dummy.updateMatrix();
    glowB.setMatrixAt(index, dummy.matrix);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.position.y = 0.18;
    dummy.scale.set(lamp.radius * 2.7, lamp.radius * 2.7, 1);
    dummy.updateMatrix();
    pools.setMatrixAt(index, dummy.matrix);
  });
  glowA.instanceMatrix.needsUpdate = true;
  glowB.instanceMatrix.needsUpdate = true;
  pools.instanceMatrix.needsUpdate = true;
  group.add(glowA, glowB, pools);
}

function buildNeon(group, rng, signs) {
  const chosen = rng.shuffle(signs).slice(0, 46);
  const glow = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const reflections = new GeometryBuilder();
  for (const sign of chosen) {
    const texture = makeSignTexture(sign.text, sign.color);
    const aspect = texture.userData.aspect ?? 3;
    const height = 2.2 * sign.scale;
    const width = height * aspect;
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      fog: true, toneMapped: false, opacity: 0.96,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(sign.x, sign.y, sign.z);
    if (sign.axis === 'z') {
      mesh.rotation.y = sign.facing > 0 ? 0 : Math.PI;
    } else {
      mesh.rotation.y = sign.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    group.add(mesh);



    if (rng.chance(0.8)) {
      const bladeGeometry = new THREE.PlaneGeometry(height * 1.75, height * 0.85);
      const bladeMaterial = material.clone();
      bladeMaterial.side = THREE.FrontSide;
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      const twin = new THREE.Mesh(bladeGeometry, bladeMaterial);
      const out = 1.9;
      if (sign.axis === 'z') {
        blade.position.set(sign.x, sign.y + height * 0.35, sign.z + sign.facing * out);
        blade.rotation.y = Math.PI / 2;
      } else {
        blade.position.set(sign.x + sign.facing * out, sign.y + height * 0.35, sign.z);
        blade.rotation.y = 0;
      }
      twin.position.copy(blade.position);
      twin.rotation.y = blade.rotation.y + Math.PI;
      group.add(blade, twin);
    }


    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: linear(sign.color), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false,
    }));
    halo.scale.set(width * 1.7, height * 3.4, 1);
    halo.position.copy(mesh.position);
    halo.position.y += height * 0.2;
    group.add(halo);


    const reflectX = sign.axis === 'z' ? sign.x : sign.x + sign.facing * 4;
    const reflectZ = sign.axis === 'z' ? sign.z + sign.facing * 4 : sign.z;
    reflections.addGroundQuad(reflectX, 0.035, reflectZ, 4.5, 13, linear(sign.color));
  }

  if (!reflections.isEmpty) {
    const material = new THREE.MeshBasicMaterial({
      map: glow, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
      vertexColors: true, depthWrite: false, fog: true, toneMapped: false,
    });
    const mesh = new THREE.Mesh(reflections.build(), material);
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  return chosen;
}

function buildHarbour(group, rng, noise, ctx) {
  const { roadX, roadZ, roadHalf, quayZ, buildings } = ctx;
  const { waterZ } = CITY_GRID;
  const props = new GeometryBuilder();
  const lights = new GeometryBuilder();
  const dark = linear(0x191b20);
  const steel = linear(0x2b3038);
  const containerColors = [0x8a3b2e, 0x2e5a6a, 0x6a5a2e, 0x3b4a3a, 0x5a2e4a, 0x2e3b6a];


  props.addBox(0, -0.7, waterZ - 0.4, 470, 1.8, 1.4, linear(0x232529), { skipBottom: true });

  for (let x = -210; x <= 210; x += 7) {
    props.addCylinder(x, 0.5, waterZ - 2.2, 0.28, 0.34, 0.9, 7, steel, { cap: true });
  }


  for (const craneX of [-150, -40, 70, 170]) {
    const baseZ = quayZ + 15;
    props.addBox(craneX, 9, baseZ, 3.4, 18, 3.4, steel, { skipBottom: true });
    props.addBox(craneX - 12, 18.4, baseZ, 30, 1.1, 1.4, steel, { skipBottom: true });
    props.addBox(craneX + 10, 17.2, baseZ, 1.0, 1.0, 1.0, dark, { skipBottom: true });
    lights.addBox(craneX - 26, 18.4, baseZ, 0.5, 0.5, 0.5, linear(0xff4040), { skipBottom: true });
    lights.addBox(craneX - 2, 22, baseZ, 0.5, 0.5, 0.5, linear(0xffd27a), { skipBottom: true });
  }


  for (let i = 0; i < 34; i += 1) {
    const x = rng.float(-205, 205);
    const z = rng.float(quayZ + 13, waterZ - 4);
    if (Math.abs(x - 70) < 14) continue;
    const colour = linear(containerColors[rng.int(0, containerColors.length - 1)]);
    const h = 2.6;
    const levels = rng.chance(0.35) ? 2 : 1;
    for (let level = 0; level < levels; level += 1) {
      props.addBox(x, 0.14 + h / 2 + level * h, z, 6.1, h, 2.5, colour, { skipBottom: true });
    }
  }


  for (const [wx, ww] of [[-190, 30], [-90, 34], [10, 26], [140, 40]]) {
    props.addBox(wx, 3.6, quayZ + 6, ww, 7, 10, linear(0x1d2026), { skipBottom: true });
    props.addBox(wx, 7.4, quayZ + 6, ww * 0.98, 0.6, 10.2, linear(0x2a2e35), { skipBottom: true });
  }


  for (const [bx, bz, len] of [[-120, waterZ + 9, 14], [30, waterZ + 12, 18], [140, waterZ + 8, 11]]) {
    props.addBox(bx, -0.2, bz, len, 1.6, 4.4, linear(0x22262c), { skipBottom: true });
    props.addBox(bx + len * 0.2, 1.4, bz, len * 0.32, 1.8, 3.2, linear(0x2c3138), { skipBottom: true });
    lights.addBox(bx + len * 0.2, 2.5, bz, 0.4, 0.4, 0.4, linear(0xffe0a0), { skipBottom: true });
  }
  for (const pierX of [-70, 100]) {
    props.addBox(pierX, 0.1, waterZ + 10, 4.5, 0.4, 20, dark, { skipBottom: true });
    for (let z = waterZ + 1; z < waterZ + 19; z += 4) {
      props.addCylinder(pierX - 2.1, -0.4, z, 0.22, 0.22, 3.2, 5, steel, { cap: false });
      props.addCylinder(pierX + 2.1, -0.4, z, 0.22, 0.22, 3.2, 5, steel, { cap: false });
    }
  }


  for (let i = 0; i < 26; i += 1) {
    const x = -210 + i * 16.4 + rng.float(-3, 3);
    const z = waterZ - 4 + rng.float(-1.2, 1.2);
    props.addCylinder(x, 1.4, z, 0.16, 0.24, 2.8, 5, linear(0x2a211c), { cap: false });
    props.addCylinder(x, 3.6, z, 0.2, 2.1, 2.2, 7, linear(0x18241c), { cap: true });
  }

  const propMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.28 });
  group.add(new THREE.Mesh(props.build(), propMaterial));
  group.add(new THREE.Mesh(lights.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));


  for (const [wx, ww] of [[-190, 30], [-90, 34], [10, 26], [140, 40]]) {
    buildings.push({
      x: wx, z: quayZ + 6, w: ww, d: 10, h: 7.6,
      minX: wx - ww / 2, maxX: wx + ww / 2, minZ: quayZ + 1, maxZ: quayZ + 11,
    });
  }
}

function buildSkyline(group, rng, ctx) {
  const { roadX, roadZ } = ctx;
  const builder = new GeometryBuilder();
  const tint = linear(0x39414c);
  const edgeX = roadX[roadX.length - 1] + 40;
  const edgeZ = roadZ[0] - 40;

  for (let i = 0; i < 90; i += 1) {
    const side = rng.int(0, 2);
    let x;
    let z;
    if (side === 0) { x = rng.float(-620, 620); z = edgeZ - rng.float(30, 380); }
    else if (side === 1) { x = -edgeX - rng.float(30, 380); z = rng.float(-500, 120); }
    else { x = edgeX + rng.float(30, 380); z = rng.float(-500, 120); }
    const w = rng.float(18, 52);
    const d = rng.float(18, 52);
    const h = rng.float(22, 130) * (rng.chance(0.2) ? 1.5 : 1);
    builder.addBox(x, h / 2, z, w, h, d, tint, { uvScale: 30, roofColor: linear(0x0d0f13), topUv: 0.003 });
  }

  const skylineFacade = makeFacadeTexture(rng, { wall: '#3a3f48', litChance: 0.2, lights: ['#ffd9a0', '#bfe8ff'] });
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: skylineFacade,
    emissiveMap: skylineFacade,
    emissive: 0xffffff,
    emissiveIntensity: 0.7,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
    fog: true,
  });
  group.add(new THREE.Mesh(builder.build(), material));


  const spire = new GeometryBuilder();
  const spireX = -60;
  const spireZ = -70;
  spire.addBox(spireX, 60, spireZ, 22, 120, 22, linear(0x4a5462), { uvScale: 24, roofColor: linear(0x12151a), topUv: 0.003 });
  spire.addBox(spireX, 128, spireZ, 14, 16, 14, linear(0x55606f), { uvScale: 24, roofColor: linear(0x12151a), topUv: 0.003 });
  spire.addCylinder(spireX, 145, spireZ, 0.4, 1.4, 18, 6, linear(0x6a7484), { cap: false });
  const spireMaterial = new THREE.MeshStandardMaterial({
    map: makeFacadeTexture(rng, { wall: '#59626e', litChance: 0.5, lights: ['#bfe8ff', '#e8f6ff', '#ffd9a0'] }),
    emissive: 0xffffff,
    emissiveIntensity: 0.95,
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.25,
  });
  spireMaterial.emissiveMap = spireMaterial.map;
  const spireMesh = new THREE.Mesh(spire.build(), spireMaterial);
  group.add(spireMesh);

  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.5, 6, 24),
    new THREE.MeshBasicMaterial({ color: linear(0x5ce9ff), fog: true }),
  );
  crown.position.set(spireX, 136, spireZ);
  crown.rotation.x = Math.PI / 2;
  group.add(crown);

  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: linear(0x5ce9ff), transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  beacon.scale.set(60, 60, 1);
  beacon.position.set(spireX, 150, spireZ);
  group.add(beacon);
}

function buildProps(group, rng, ctx) {
  const { roadX, roadZ, roadHalf } = ctx;
  const builder = new GeometryBuilder();
  const binColor = linear(0x243028);
  const hydrant = linear(0x7a2a24);
  const bench = linear(0x3a2e24);

  for (let i = 0; i < 90; i += 1) {
    const alongX = rng.chance(0.5);
    const x = alongX ? rng.float(-200, 200) : roadX[rng.int(0, roadX.length - 1)] + rng.sign() * (roadHalf + 2.4);
    const z = alongX ? roadZ[rng.int(0, roadZ.length - 1)] + rng.sign() * (roadHalf + 2.4) : rng.float(-200, 140);
    if (!alongX && Math.abs(z - roadZ[rng.int(0, roadZ.length - 1)]) < roadHalf) continue;
    const kind = rng.int(0, 3);
    if (kind === 0) builder.addBox(x, 0.5, z, 0.7, 0.9, 0.7, binColor, { skipBottom: true });
    else if (kind === 1) builder.addCylinder(x, 0.45, z, 0.22, 0.26, 0.8, 6, hydrant, { cap: true });
    else if (kind === 2) builder.addBox(x, 0.55, z, 2.2, 0.12, 0.6, bench, { skipBottom: true });
    else builder.addBox(x, 0.35, z, 1.1, 0.7, 1.1, linear(0x2a2d33), { skipBottom: true });
  }

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.2 });
  group.add(new THREE.Mesh(builder.build(), material));
}

function buildWater(group, waterZ) {
  const geometry = new THREE.PlaneGeometry(1800, 1200, 1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: linear(0x0a1220) },
      uDeep: { value: linear(0x04080e) },
      uShallow: { value: linear(0x0b1a24) },
      uGlow: { value: linear(0x2a3a4a) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uGlow;
      varying vec3 vWorld;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 p = vWorld.xz * 0.055;
        float w = noise(p + vec2(uTime * 0.06, uTime * 0.04)) * 0.6
                + noise(p * 2.7 - vec2(uTime * 0.09, 0.0)) * 0.4;
        vec3 col = mix(uDeep, uShallow, smoothstep(0.25, 0.85, w));
        float ripple = noise(p * 6.0 + vec2(0.0, uTime * 0.25));
        col += uGlow * pow(ripple, 3.0) * 0.5;
        // Moon glitter on the long axis of the bay.
        float glitter = pow(noise(p * 9.0 + vec2(uTime * 0.2, -uTime * 0.1)), 16.0);
        col += vec3(0.55, 0.7, 0.85) * glitter * 0.35;
        float distanceToCamera = distance(vWorld.xz, cameraPosition.xz);
        col = mix(col, uFogColor, smoothstep(140.0, 620.0, distanceToCamera));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const water = new THREE.Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.55, waterZ + 600);
  water.renderOrder = -1;
  group.add(water);


  const streaks = new GeometryBuilder();
  for (let i = 0; i < 16; i += 1) {
    streaks.addGroundQuad(-200 + i * 26.5, -0.5, waterZ + 13 + (i % 3) * 3, 3.2, 26, linear(0xffc890));
  }
  const streakMaterial = new THREE.MeshBasicMaterial({
    map: makeGlowTexture('rgba(255,200,140,1)', 'rgba(255,160,90,0)'),
    transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexColors: true, toneMapped: false,
  });
  group.add(new THREE.Mesh(streaks.build(), streakMaterial));

  return water;
}
