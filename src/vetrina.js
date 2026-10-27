// Hero WebGL: the osteria's own photographs hung in a dark room like the frollatura vitrine.
// Scroll drives the camera through them on a critically damped spring, so it never jumps or stops dead.
import * as THREE from 'three';

const PHOTOS = [
  // [file, x, y, z, height] — alternating sides so the centre stays free for the words
  ['tonno-trancio', -3.0, 0.7, -5, 2.7],
  ['spaghetto-scamponi', 3.1, -0.3, -8, 3.0],
  ['chitarra-asparagi', -2.8, -0.9, -11, 2.4],
  ['gambero-crudo', 2.9, 1.0, -14, 2.3],
  ['spaghetto-gamberi-rossi', -3.1, 0.4, -17, 2.4],
  ['fichi-bottarga', 2.7, -0.8, -20, 2.6],
  ['guazzetto', -2.6, 0.9, -23, 2.4],
  ['pomodoro-forno', 2.8, 0.2, -26, 2.6],
  ['gnocchetto-seppioline', -2.9, -0.6, -29, 2.5],
  ['mazzolina-brace', 0.0, 0.15, -34, 3.3],
];

const vert = /* glsl */ `
  varying vec2 vUv; varying float vDepth;
  uniform float uTime, uSeed;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(uv.y * 3.0 + uTime * 0.5 + uSeed) * 0.03;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const frag = /* glsl */ `
  varying vec2 vUv; varying float vDepth;
  uniform sampler2D uMap; uniform vec2 uCover, uSize; uniform float uReveal;
  uniform vec3 uRoom;
  float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    // rounded corners, sized in world units so every picture has the same radius
    vec2 p = (vUv - 0.5) * uSize;
    float edge = box(p, uSize * 0.5, 0.09);
    if (edge > 0.0) discard;
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    vec3 c = texture2D(uMap, uv).rgb;
    // a soft pool of light on each picture
    float lit = 0.72 + 0.28 * smoothstep(0.9, 0.2, distance(vUv, vec2(0.5, 0.58)));
    c *= lit;
    // pictures come out of the dark as you approach and fade once they pass the camera
    float fog = smoothstep(24.0, 7.0, vDepth) * smoothstep(0.4, 2.2, vDepth);
    c = mix(uRoom, c, fog * uReveal);
    gl_FragColor = vec4(c, 1.0);
  }`;

export function initVetrina(canvas) {
  const small = innerWidth <= 820;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.setClearColor(0x08131f);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  const loader = new THREE.TextureLoader();
  const planes = [];
  const START = 6, TRAVEL = 36;

  PHOTOS.forEach(([file, x, y, z, h], i) => {
    const w = h * 0.8;
    const uni = {
      uMap: { value: null }, uCover: { value: new THREE.Vector2(1, 1) }, uSize: { value: new THREE.Vector2(w, h) },
      uReveal: { value: 0 }, uTime: { value: 0 }, uSeed: { value: i * 1.7 },
      uRoom: { value: new THREE.Vector3(0x08 / 255, 0x13 / 255, 0x1f / 255) }, // sRGB, written straight out like the clear colour
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 24), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vert, fragmentShader: frag }));
    mesh.position.set(x, y, z);
    mesh.userData = { x, y, z };
    scene.add(mesh);
    planes.push(mesh);
    loader.load(`/img/${file}.jpg`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const ia = tex.image.width / tex.image.height, pa = w / h;
      uni.uCover.value.set(ia > pa ? pa / ia : 1, ia > pa ? 1 : ia / pa);
      uni.uMap.value = tex;
      // fade each picture in once its texture arrives instead of popping
      const t0 = performance.now();
      const fade = () => { uni.uReveal.value = Math.min(1, (performance.now() - t0) / 600); if (uni.uReveal.value < 1) requestAnimationFrame(fade); };
      fade();
    });
  });

  let spread = 1, cw = 0, ch = 0;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === cw && h === ch) return; // the stage is 100svh, so the address bar changes nothing here
    cw = w; ch = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // narrow screens pull the pictures towards the centre column
    spread = Math.min(1, Math.max(0.5, camera.aspect / 1.6));
  };
  resize();
  addEventListener('resize', resize);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; });

  // Critically damped spring (damping 1.0, response 0.55 s): follows the scroll, settles without overshoot.
  const omega = (2 * Math.PI) / 0.55;
  let target = 0, pos = 0, vel = 0, time = 0, last = performance.now(), raf = 0, running = false, still = false;

  const frame = (now) => {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    if (!still) time += dt;
    if (still) { pos = target; vel = 0; } else {
      vel += (-omega * omega * (pos - target) - 2 * omega * vel) * dt;
      pos += vel * dt;
    }
    pointer.x += (pointer.tx - pointer.x) * 0.06; pointer.y += (pointer.ty - pointer.y) * 0.06;
    const cz = START - pos * TRAVEL;
    camera.position.set(pointer.x * 0.5, -pointer.y * 0.3, cz);
    camera.lookAt(pointer.x * 0.15, 0, cz - 10);
    // speed lends a touch of forward lean, like walking into the room
    camera.rotation.z = THREE.MathUtils.clamp(vel * 0.004, -0.02, 0.02);
    planes.forEach((m) => {
      const { x, y, z } = m.userData;
      const ahead = z - cz; // negative: in front of the camera
      // as a picture nears, it turns a little to face you and drifts up
      const near = THREE.MathUtils.smoothstep(-ahead, 2, 14);
      m.position.set(x * spread, y + (1 - near) * 0.25, z);
      m.rotation.y = -Math.sign(x) * (0.32 * (1 - near) + 0.06);
      m.material.uniforms.uTime.value = time;
    });
    renderer.render(scene, camera);
  };
  const loop = (now) => { frame(now); raf = requestAnimationFrame(loop); };
  frame(last);

  return {
    set(v) { target = v; if (!running) { pos = v; vel = 0; frame(performance.now()); } },
    still(v) { still = v; },
    run(on) {
      if (on === running) return;
      running = on;
      if (on) { last = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    },
  };
}
