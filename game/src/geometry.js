// Geometry helpers the city is built from: one mesh builder that welds hundreds of boxes and
// quads into a single buffer (so a whole block of buildings is one draw call), plus the small
// canvas textures used for lamp glow and painted signs.
import * as THREE from '../vendor/three.min.js';

/** Accumulates coloured, lit triangles and hands back one BufferGeometry. */
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.color = new THREE.Color();
  }

  get triangleCount() {
    return this.positions.length / 9;
  }

  /** One quad, given its centre, two half-axis vectors and the outward normal. */
  addFace(center, u, v, normal, color) {
    this.color.set(color);
    const { r, g, b } = this.color;
    // Wind the quad so its front face points along the normal, whichever order the axes came in.
    const cross = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const facing = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2];
    const [a, c] = facing < 0 ? [v, u] : [u, v];
    const corners = [
      [center[0] - a[0] - c[0], center[1] - a[1] - c[1], center[2] - a[2] - c[2]],
      [center[0] + a[0] - c[0], center[1] + a[1] - c[1], center[2] + a[2] - c[2]],
      [center[0] + a[0] + c[0], center[1] + a[1] + c[1], center[2] + a[2] + c[2]],
      [center[0] - a[0] + c[0], center[1] - a[1] + c[1], center[2] - a[2] + c[2]],
    ];
    const order = [0, 1, 2, 0, 2, 3];
    for (const index of order) {
      const point = corners[index];
      this.positions.push(point[0], point[1], point[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(r, g, b);
    }
  }

  /** An axis-aligned (optionally Y-rotated) box. */
  addBox(cx, cy, cz, width, height, depth, color, rotation = 0) {
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const spin = (x, z) => [x * cos + z * sin, -x * sin + z * cos];
    const face = (offset, u, v, normal) => {
      const [ox, oz] = spin(offset[0], offset[2]);
      const [ux, uz] = spin(u[0], u[2]);
      const [vx, vz] = spin(v[0], v[2]);
      const [nx, nz] = spin(normal[0], normal[2]);
      this.addFace(
        [cx + ox, cy + offset[1], cz + oz],
        [ux, u[1], uz],
        [vx, v[1], vz],
        [nx, normal[1], nz],
        color,
      );
    };
    face([hx, 0, 0], [0, 0, -hz], [0, hy, 0], [1, 0, 0]);
    face([-hx, 0, 0], [0, 0, hz], [0, hy, 0], [-1, 0, 0]);
    face([0, 0, hz], [hx, 0, 0], [0, hy, 0], [0, 0, 1]);
    face([0, 0, -hz], [-hx, 0, 0], [0, hy, 0], [0, 0, -1]);
    face([0, hy, 0], [hx, 0, 0], [0, 0, -hz], [0, 1, 0]);
    face([0, -hy, 0], [hx, 0, 0], [0, 0, hz], [0, -1, 0]);
  }

  /** A horizontal rectangle at height y, facing up: roads, markings, painted lots. */
  addGround(x0, z0, x1, z1, y, color) {
    this.addFace([(x0 + x1) / 2, y, (z0 + z1) / 2], [(x1 - x0) / 2, 0, 0], [0, 0, (z1 - z0) / 2], [0, 1, 0], color);
  }

  /** A vertical rectangle on the plane x = const (a sign or a billboard facing along X). */
  addWallX(x, y0, z0, z1, y1, color, facing = 1) {
    const half = (z1 - z0) / 2;
    this.addFace(
      [x, (y0 + y1) / 2, (z0 + z1) / 2],
      [0, 0, half * facing],
      [0, (y1 - y0) / 2, 0],
      [facing, 0, 0],
      color,
    );
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** A soft round halo, drawn once on a canvas and reused by every glow in the city. */
export function makeGlowTexture(inner = 'rgba(255,235,190,1)', outer = 'rgba(255,190,110,0)') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Painted lettering for a neon sign or a shopfront: returns a texture with the words in the
 * given colour on a dark backing, sized to the text so the plane does not stretch it.
 */
export function makeSignTexture(lines, options = {}) {
  const {
    color = '#ff4f8b',
    glow = 'rgba(255,79,139,0.55)',
    background = 'rgba(6,8,14,0.92)',
    font = 700,
    family = 'Helvetica, Arial, sans-serif',
    border = true,
  } = options;
  const rows = Array.isArray(lines) ? lines : [lines];
  const width = 512;
  const rowHeight = 128;
  const height = Math.max(128, rows.length * rowHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  if (border) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  rows.forEach((row, index) => {
    const size = rows.length > 1 ? 68 : 84;
    ctx.font = `${font} ${size}px ${family}`;
    ctx.fillText(row, width / 2, (index + 0.5) * (height / rows.length));
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: width / height };
}
