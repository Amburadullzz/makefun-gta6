// Post effects: a cheap two-pass bloom for every window, neon sign and headlight, then
// a composite with a vignette and a small colour lift. One extra full-screen pass at
// half resolution and two small blurs — the night look lives or dies on this.



import * as THREE from '../vendor/three.min.js';

const QUAD_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAGMENT = `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uSoft;
  varying vec2 vUv;
  void main() {
    vec3 colour = texture2D(tDiffuse, vUv).rgb;
    float luma = max(colour.r, max(colour.g, colour.b));
    float contribution = smoothstep(uThreshold, uThreshold + uSoft, luma);
    gl_FragColor = vec4(colour * contribution, 1.0);
  }
`;

const BLUR_FRAGMENT = `
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    sum += texture2D(tDiffuse, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tDiffuse, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tDiffuse, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
    sum += texture2D(tDiffuse, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAGMENT = `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform float uVignette;
  varying vec2 vUv;
  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 colour = scene + bloom * uBloom;
    // A gentle S-curve keeps the blacks deep but stops the highlights clipping flat.
    colour = mix(colour, colour * colour * (3.0 - 2.0 * colour), 0.22);
    float d = distance(vUv, vec2(0.5));
    colour *= 1.0 - smoothstep(0.42, 0.86, d) * uVignette;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export function createPostFx(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();

  const makeTarget = (width, height, depth = false) => {
    const target = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(width)), Math.max(2, Math.floor(height)), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: depth,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  };

  let sceneTarget = makeTarget(size.x * pixelRatio, size.y * pixelRatio, true);
  let halfTarget = makeTarget((size.x * pixelRatio) / 2, (size.y * pixelRatio) / 2);
  let blurTarget = makeTarget((size.x * pixelRatio) / 2, (size.y * pixelRatio) / 2);

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const bright = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.62 }, uSoft: { value: 0.34 } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: BRIGHT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const blur = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDirection: { value: new THREE.Vector2(0, 0) } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const composite = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0.85 },
      uVignette: { value: 0.55 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const drawQuad = (material, target) => {
    quadMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(quadScene, quadCamera);
  };

  const api = {
    enabled: true,
    setSize(width, height) {
      const ratio = renderer.getPixelRatio();
      const w = width * ratio;
      const h = height * ratio;
      sceneTarget.setSize(w, h);
      halfTarget.setSize(w / 2, h / 2);
      blurTarget.setSize(w / 2, h / 2);
    },

    render() {
      if (!api.enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(sceneTarget);
      renderer.clear();
      renderer.render(scene, camera);

      bright.uniforms.tDiffuse.value = sceneTarget.texture;
      drawQuad(bright, halfTarget);

      blur.uniforms.tDiffuse.value = halfTarget.texture;
      blur.uniforms.uDirection.value.set(1.4 / (halfTarget.width || 1), 0);
      drawQuad(blur, blurTarget);

      blur.uniforms.tDiffuse.value = blurTarget.texture;
      blur.uniforms.uDirection.value.set(0, 1.4 / (halfTarget.height || 1));
      drawQuad(blur, halfTarget);

      composite.uniforms.tScene.value = sceneTarget.texture;
      composite.uniforms.tBloom.value = halfTarget.texture;
      drawQuad(composite, null);
    },
  };
  return api;
}
