// Mesh construction helpers shared by the city, the cars and the people: a small
// geometry builder that bakes boxes, cylinders and quads into one vertex-coloured
// buffer, plus the canvas-drawn textures (windows, neon, glow) the night look needs.



import * as THREE from '../vendor/three.min.js';

export const linear = (hex) => new THREE.Color(hex).convertSRGBToLinear();

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasTexture(canvas, { repeat = false, anisotropy = 4 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

export class GeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
  }

  get isEmpty() {
    return this.positions.length === 0;
  }

  vertex(px, py, pz, nx, ny, nz, u, v, color) {
    this.positions.push(px, py, pz);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.colors.push(color.r, color.g, color.b);
  }


  addBox(cx, cy, cz, width, height, depth, color, options = {}) {
    const {
      uvScale = 0,
      roofColor = null,
      rotation = 0,
      skipBottom = true,
      topUv = 0.002,
      uvOffset = 0,
    } = options;
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const roof = roofColor ? linear(roofColor) : color;
    const side = color;

    const put = (x, y, z, nx, ny, nz, u, v, c) => {
      const rx = x * cos + z * sin;
      const rz = -x * sin + z * cos;
      this.vertex(cx + rx, cy + y, cz + rz, nx * cos + nz * sin, ny, -nx * sin + nz * cos, u, v, c);
    };


    const quad = (a, b, c, d, normal, uMax, vMax, col, uvTop) => {
      const [nx, ny, nz] = normal;
      if (uvTop !== undefined) {
        for (const p of [a, b, c, a, c, d]) put(p[0], p[1], p[2], nx, ny, nz, uvTop, uvTop, col);
        return;
      }
      const corners = [a, b, c, a, c, d];
      const uvs = [[0, uvOffset], [uMax, uvOffset], [uMax, vMax + uvOffset], [0, uvOffset], [uMax, vMax + uvOffset], [0, vMax + uvOffset]];
      for (let i = 0; i < 6; i += 1) {
        const p = corners[i];
        put(p[0], p[1], p[2], nx, ny, nz, uvs[i][0], uvs[i][1], col);
      }
    };

    const usX = Array.isArray(uvScale) ? 1 / uvScale[0] : uvScale > 0 ? 1 / uvScale : 0;
    const usY = Array.isArray(uvScale) ? 1 / uvScale[1] : usX;
    const us = usX;

    quad([-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd], [0, 0, 1], width * usX, height * usY, side);
    quad([hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd], [0, 0, -1], width * usX, height * usY, side);

    quad([hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd], [1, 0, 0], depth * usX, height * usY, side);
    quad([-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd], [-1, 0, 0], depth * usX, height * usY, side);

    const uvTopValue = uvScale > 0 ? topUv : undefined;
    quad([-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd], [0, 1, 0], width * usX, depth * usX, roof, uvTopValue);
    if (!skipBottom) {
      quad([-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd], [0, -1, 0], width * usX, depth * usX, roof, uvTopValue);
    }
    return this;
  }

  addCylinder(cx, cy, cz, radiusTop, radiusBottom, height, segments, color, options = {}) {
    const { cap = true, uvScale = 0 } = options;
    const half = height / 2;
    const usX = Array.isArray(uvScale) ? 1 / uvScale[0] : uvScale > 0 ? 1 / uvScale : 0;
    const usY = Array.isArray(uvScale) ? 1 / uvScale[1] : usX;
    const us = usX;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = Math.cos(a0);
      const z0 = Math.sin(a0);
      const x1 = Math.cos(a1);
      const z1 = Math.sin(a1);
      const u0 = (i / segments) * Math.PI * 2 * radiusBottom * us;
      const u1 = ((i + 1) / segments) * Math.PI * 2 * radiusBottom * us;
      const vMax = height * us;

      this.vertex(cx + x0 * radiusBottom, cy - half, cz + z0 * radiusBottom, x0, 0, z0, u0, 0, color);
      this.vertex(cx + x0 * radiusTop, cy + half, cz + z0 * radiusTop, x0, 0, z0, u0, vMax, color);
      this.vertex(cx + x1 * radiusTop, cy + half, cz + z1 * radiusTop, x1, 0, z1, u1, vMax, color);
      this.vertex(cx + x0 * radiusBottom, cy - half, cz + z0 * radiusBottom, x0, 0, z0, u0, 0, color);
      this.vertex(cx + x1 * radiusTop, cy + half, cz + z1 * radiusTop, x1, 0, z1, u1, vMax, color);
      this.vertex(cx + x1 * radiusBottom, cy - half, cz + z1 * radiusBottom, x1, 0, z1, u1, 0, color);
      if (cap) {
        this.vertex(cx, cy + half, cz, 0, 1, 0, 0.002, 0.002, color);
        this.vertex(cx + x1 * radiusTop, cy + half, cz + z1 * radiusTop, 0, 1, 0, 0.002, 0.002, color);
        this.vertex(cx + x0 * radiusTop, cy + half, cz + z0 * radiusTop, 0, 1, 0, 0.002, 0.002, color);
      }
    }
    return this;
  }


  addGroundQuad(cx, cy, cz, width, depth, color, rotation = 0) {
    const hw = width / 2;
    const hd = depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const p = (x, z) => [cx + x * cos + z * sin, cy, cz - x * sin + z * cos];
    const a = p(-hw, hd);
    const b = p(hw, hd);
    const c = p(hw, -hd);
    const d = p(-hw, -hd);
    this.vertex(a[0], a[1], a[2], 0, 1, 0, 0, 0, color);
    this.vertex(b[0], b[1], b[2], 0, 1, 0, 1, 0, color);
    this.vertex(c[0], c[1], c[2], 0, 1, 0, 1, 1, color);
    this.vertex(a[0], a[1], a[2], 0, 1, 0, 0, 0, color);
    this.vertex(c[0], c[1], c[2], 0, 1, 0, 1, 1, color);
    this.vertex(d[0], d[1], d[2], 0, 1, 0, 0, 1, color);
    return this;
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export function makeFacadeTexture(rng, palette) {
  const size = 512;
  const cells = 8;
  const cell = size / cells;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.wall;
  ctx.fillRect(0, 0, size, size);


  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let row = 0; row < cells; row += 1) {
    ctx.fillRect(0, row * cell + cell - 3, size, 3);
  }

  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const x = col * cell + 9;
      const y = row * cell + 8;
      const w = cell - 18;
      const h = cell - 20;
      const lit = rng.chance(palette.litChance);
      if (lit) {
        const tone = rng.pick(palette.lights);
        const bright = rng.float(0.55, 1);
        ctx.fillStyle = tone;
        ctx.globalAlpha = bright;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 3, y + 3, w - 6, h * 0.35);
        if (rng.chance(0.25)) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(x, y, w, h * rng.float(0.2, 0.55));
        }
      } else {
        ctx.fillStyle = rng.chance(0.5) ? 'rgba(10,16,24,0.95)' : 'rgba(6,10,16,0.95)';
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
  }


  for (let i = 0; i < 26; i += 1) {
    const x = rng.float(0, size);
    const w = rng.float(1, 5);
    ctx.fillStyle = `rgba(0,0,0,${rng.float(0.04, 0.16)})`;
    ctx.fillRect(x, rng.float(0, size * 0.5), w, rng.float(40, size));
  }

  return canvasTexture(canvas, { repeat: true, anisotropy: 8 });
}

export function makeStorefrontTexture(rng) {
  const width = 512;
  const height = 128;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, width, height);
  const units = 4;
  const unit = width / units;
  const windowColours = ['#ffd9a0', '#bfe8ff', '#ffe6c0', '#9fe8c0', '#ffc0d8'];
  for (let i = 0; i < units; i += 1) {
    const x = i * unit;
    const lit = rng.chance(0.78);

    ctx.fillStyle = lit ? rng.pick(windowColours) : '#2a2f38';
    ctx.globalAlpha = lit ? 0.9 : 1;
    ctx.fillRect(x + 6, 6, unit - 12, 22);
    ctx.globalAlpha = 1;

    if (lit) {
      const g = ctx.createLinearGradient(0, 32, 0, height - 8);
      g.addColorStop(0, rng.pick(windowColours));
      g.addColorStop(1, 'rgba(255,220,170,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(x + 8, 32, unit - 16, height - 42);

      ctx.fillStyle = 'rgba(20,16,12,0.55)';
      for (let k = 0; k < 3; k += 1) {
        ctx.fillRect(x + 14 + k * 26, 44, 12, height - 62);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 10, 34, unit - 20, 3);
    } else {
      ctx.fillStyle = '#101318';
      ctx.fillRect(x + 8, 32, unit - 16, height - 42);
    }

    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(x + unit / 2 - 2, 32, 4, height - 32);
    ctx.fillRect(x + 6, 30, unit - 12, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x + unit * 0.62, 62, 26, height - 62);
  }
  return canvasTexture(canvas, { repeat: true, anisotropy: 8 });
}

export function makeSignTexture(text, color, options = {}) {
  const { font = 'bold 96px "Nimbus Sans Narrow", "Arial Narrow", sans-serif', padding = 46 } = options;
  const probe = makeCanvas(8, 8).getContext('2d');
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + padding * 2;
  const height = 168;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';


  const passes = [
    { blur: 34, alpha: 0.5, fill: color, width: 1 },
    { blur: 14, alpha: 0.85, fill: color, width: 1 },
    { blur: 4, alpha: 1, fill: color, width: 1 },
  ];
  for (const pass of passes) {
    ctx.globalAlpha = pass.alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = pass.blur;
    ctx.fillStyle = pass.fill;
    ctx.fillText(text, width / 2, height / 2);
  }

  ctx.globalAlpha = 0.18;
  ctx.shadowBlur = 2;
  ctx.fillStyle = '#ffffff';
  ctx.font = font.replace(/bold (\d+)px/, (m, size) => `bold ${Math.round(Number(size) * 0.92)}px`);
  ctx.fillText(text, width / 2, height / 2);
  ctx.globalAlpha = 1;

  const texture = canvasTexture(canvas);
  texture.userData.aspect = width / height;
  return texture;
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(canvas);
}

export function makeShadowTexture() {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(canvas);
}

export function makeShadowBlob(width, depth, opacity = 1) {
  const material = new THREE.MeshBasicMaterial({
    map: makeShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    color: 0x000000,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
}

export function makeGlowSprite(size, color, opacity = 0.85) {
  const material = new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: linear(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

export function makeStarField(count, radius, seedRng) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const theta = seedRng.float(0, Math.PI * 2);
    const phi = Math.acos(seedRng.float(0.05, 1));
    const r = radius * seedRng.float(0.85, 1);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.abs(Math.cos(phi)) * r * 0.9 + 20;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    tint.setHSL(seedRng.float(0.55, 0.62), seedRng.float(0.1, 0.5), seedRng.float(0.5, 0.95));
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Points(geometry, material);
}

export function makeSkyDome() {
  const geometry = new THREE.SphereGeometry(1400, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: linear(0x03050b) },
      midColor: { value: linear(0x0a1424) },
      horizonColor: { value: linear(0x243a4e) },
      glowColor: { value: linear(0x4a2a3a) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = normalize(world.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      varying vec3 vWorld;
      void main() {
        float h = clamp(vWorld.y, -1.0, 1.0);
        vec3 sky = mix(horizonColor, midColor, smoothstep(0.0, 0.32, h));
        sky = mix(sky, topColor, smoothstep(0.25, 0.9, h));
        // Light pollution: warm haze hugging the horizon, stronger to the north.
        float band = exp(-max(h, 0.0) * 9.0) * (0.55 + 0.45 * smoothstep(-0.6, 0.8, vWorld.z));
        sky += glowColor * band * 0.55;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}
