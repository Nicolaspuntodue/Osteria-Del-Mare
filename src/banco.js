// Background WebGL behind the whole page: a school of alici in the dark Adriatic.
// Real 3D bodies (laterally compressed, forked tail, dorsal fin, eye) with a silver, iridescent skin lit from the surface.
// Boids flocking: separation, alignment, cohesion. Scrolling stretches the school into a rippling river that
// crosses the screen; the pointer is a predator the fish flee from. Light shafts and marine snow give the water depth.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ROOM = [0x08 / 255, 0x13 / 255, 0x1f / 255]; // the page ground, sRGB

// ---------- one alice, head towards +x, length 1 ----------
function fishGeometry() {
  const prof = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28; // 0 tail → 1 head
    const r = 0.012 + 0.1 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
    prof.push(new THREE.Vector2(r, t - 0.5));
  }
  const body = new THREE.LatheGeometry(prof, 18);
  body.rotateZ(-Math.PI / 2); // lathe axis y → x
  body.scale(1, 1, 0.42); // an alice is narrow seen from above
  body.deleteAttribute('uv');

  const fin = (pts) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(s, 1);
    g.deleteAttribute('uv');
    return g;
  };
  const tail = fin([[-0.47, 0], [-0.62, 0.16], [-0.6, 0.02], [-0.66, -0.15], [-0.47, 0]]);
  const dorsal = fin([[-0.02, 0.085], [0.1, 0.16], [0.14, 0.09]]);
  const ventral = fin([[-0.16, -0.07], [-0.08, -0.12], [-0.04, -0.075]]);
  const mark = (g, v) => g.setAttribute('aFin', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(v), 1));
  mark(body, 0); mark(tail, 1); mark(dorsal, 1); mark(ventral, 1);
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), dorsal.toNonIndexed(), ventral.toNonIndexed()]);
}

const fishVert = /* glsl */ `
  attribute float aFin, aPhase, aSpeed, aTint;
  uniform float uTime;
  varying vec3 vN, vView;
  varying float vAlong, vH, vFin, vSide, vTint;
  void main() {
    vec3 p = position;
    float along = p.x + 0.5;                  // 0 tail … 1 head
    float amp = pow(1.0 - clamp(along, 0.0, 1.0), 1.8) * (0.09 + aSpeed * 0.08);
    float wave = sin(along * 6.0 - uTime * (9.0 + aSpeed * 16.0) + aPhase);
    p.z += wave * amp;                        // the spine bends side to side
    vAlong = along; vH = position.y; vFin = aFin; vSide = position.z; vTint = aTint;
    mat3 nm = mat3(modelViewMatrix) * mat3(instanceMatrix);
    vN = normalize(nm * normal);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const fishFrag = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uRoom, uLight;
  varying vec3 vN, vView;
  varying float vAlong, vH, vFin, vSide, vTint;
  void main() {
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(-vView);
    float h = clamp(vH / 0.11 * 0.5 + 0.5, 0.0, 1.0); // 0 belly … 1 back
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);

    vec3 belly = vec3(0.93, 0.95, 0.97), flank = vec3(0.72, 0.79, 0.85), back = vec3(0.1, 0.26, 0.34) + vTint * vec3(0.0, 0.05, 0.04);
    vec3 c = mix(belly, flank, smoothstep(0.12, 0.45, h));
    c = mix(c, back, smoothstep(0.6, 0.82, h));
    // the silver lateral band, shifting through blue and violet as it turns
    float band = smoothstep(0.09, 0.0, abs(h - 0.57));
    vec3 irid = 0.55 + 0.45 * cos(6.2832 * (fres * 1.4 + vAlong * 0.3 + vec3(0.0, 0.33, 0.67)));
    c = mix(c, mix(vec3(0.78, 0.9, 1.0), irid, 0.45), band * 0.75);

    float diff = max(dot(N, uLight), 0.0) * 0.55 + 0.5;
    vec3 R = reflect(-uLight, N);
    float spec = pow(max(dot(R, V), 0.0), 30.0) * 1.5 + pow(max(dot(R, V), 0.0), 5.0) * 0.3;
    vec3 col = c * diff + vec3(0.95, 0.98, 1.0) * spec * (1.0 - vFin) + vec3(0.45, 0.65, 0.85) * fres * 0.6;

    // the eye
    float eye = smoothstep(0.03, 0.022, distance(vec2(vAlong, vH), vec2(0.9, 0.018))) * step(0.0, abs(vSide) - 0.005) * (1.0 - vFin);
    col = mix(col, vec3(0.02), eye * 0.9);

    // fins: thin, translucent, catching only a little light
    col = mix(col, vec3(0.45, 0.56, 0.66) * diff + spec * 0.3, vFin);
    float alpha = mix(1.0, 0.55, vFin);

    // distance sinks everything into the room
    float depth = -vView.z;
    float fog = smoothstep(34.0, 12.0, depth);
    col = mix(uRoom, col, fog);
    gl_FragColor = vec4(col, alpha * uOpacity * smoothstep(38.0, 16.0, depth));
  }`;

// ---------- light shafts from the surface ----------
const raysFrag = /* glsl */ `
  uniform vec2 uRes; uniform float uTime, uOpacity, uScroll;
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float x = uv.x * uRes.x / uRes.y + (1.0 - uv.y) * 0.35;
    float r = pow(0.5 + 0.5 * sin(x * 5.0 + uTime * 0.12 + uScroll * 0.6), 7.0)
            + 0.6 * pow(0.5 + 0.5 * sin(x * 11.0 - uTime * 0.18 + 1.7), 10.0)
            + 0.4 * pow(0.5 + 0.5 * sin(x * 2.3 + uTime * 0.05 + 3.1), 5.0);
    float fall = smoothstep(0.0, 1.0, uv.y);
    gl_FragColor = vec4(vec3(0.42, 0.68, 0.86), r * fall * 0.07 * uOpacity);
  }`;

// ---------- marine snow ----------
const snowVert = /* glsl */ `
  uniform float uTime, uScroll, uPx, uH;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.05 + aSeed * 0.08) + uScroll * (0.8 + aSeed * 1.6) + uH, 2.0 * uH) - uH;
    p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.15;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = smoothstep(24.0, 6.0, -mv.z) * (0.35 + 0.65 * aSeed);
    gl_PointSize = uPx * (1.2 + aSeed * 2.4) * (10.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const snowFrag = /* glsl */ `
  uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.75, 0.86, 0.95, smoothstep(0.5, 0.0, d) * vA * 0.55 * uOpacity);
  }`;

export function initBanco(canvas) {
  const small = innerWidth <= 820;
  const N = small ? 150 : 320;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.z = 10;
  const room = new THREE.Vector3(...ROOM);

  // fish
  const geo = fishGeometry();
  const phase = new Float32Array(N), tint = new Float32Array(N), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { phase[i] = Math.random() * 6.28; tint[i] = Math.random(); }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  const aSpeed = new THREE.InstancedBufferAttribute(spd, 1);
  aSpeed.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aSpeed', aSpeed);
  const fishUni = {
    uTime: { value: 0 }, uOpacity: { value: 0 }, uRoom: { value: room },
    uLight: { value: new THREE.Vector3(0.2, 0.75, 0.65).normalize() },
  };
  const fish = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    uniforms: fishUni, vertexShader: fishVert, fragmentShader: fishFrag, transparent: true, side: THREE.DoubleSide,
  }), N);
  fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fish.frustumCulled = false;
  scene.add(fish);

  // light shafts, a full-screen layer under the fish
  const raysUni = { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uOpacity: { value: 0 }, uScroll: { value: 0 } };
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const rays = new THREE.Mesh(rayGeo, new THREE.RawShaderMaterial({
    uniforms: raysUni, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 position; void main(){ gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'precision highp float;' + raysFrag,
  }));
  const raysScene = new THREE.Scene(); raysScene.add(rays);
  const raysCam = new THREE.Camera();

  // marine snow
  const S = small ? 260 : 600, sPos = new Float32Array(S * 3), sSeed = new Float32Array(S);
  for (let i = 0; i < S; i++) { sPos[i * 3] = (Math.random() - 0.5) * 30; sPos[i * 3 + 1] = (Math.random() - 0.5) * 20; sPos[i * 3 + 2] = -Math.random() * 16 + 2; sSeed[i] = Math.random(); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
  const snowUni = { uTime: { value: 0 }, uScroll: { value: 0 }, uPx: { value: 1 }, uH: { value: 10 }, uOpacity: { value: 0 } };
  const snow = new THREE.Points(sGeo, new THREE.ShaderMaterial({ uniforms: snowUni, vertexShader: snowVert, fragmentShader: snowFrag, transparent: true, depthWrite: false }));
  snow.frustumCulled = false;
  scene.add(snow);

  // ---------- the school ----------
  const P = new Float32Array(N * 3), Vv = new Float32Array(N * 3), size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // start as a loose cloud, each fish heading its own way, so the school forms in front of you
    const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), r = Math.cbrt(Math.random()) * 3;
    P[i * 3] = r * Math.sin(b) * Math.cos(a) * 1.8; P[i * 3 + 1] = r * Math.sin(b) * Math.sin(a) * 0.8; P[i * 3 + 2] = -4.5 + r * Math.cos(b) * 0.8;
    const h = Math.random() * 6.28;
    Vv[i * 3] = Math.cos(h) * 1.2; Vv[i * 3 + 1] = (Math.random() - 0.5) * 0.6; Vv[i * 3 + 2] = Math.sin(h) * 1.2;
    size[i] = 0.62 + Math.random() * 0.3;
  }

  let W = 1, H = 1, cw = 0, ch = 0;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    H = Math.tan(THREE.MathUtils.degToRad(21)) * 14.5; W = H * camera.aspect; // half extents at the school's depth
    raysUni.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    snowUni.uPx.value = renderer.getPixelRatio(); snowUni.uH.value = H * 1.4;
  };
  resize();
  addEventListener('resize', resize);

  const ndc = { x: 9, y: 9, active: 0 };
  addEventListener('pointermove', (e) => { ndc.x = (e.clientX / innerWidth) * 2 - 1; ndc.y = -(e.clientY / innerHeight) * 2 + 1; ndc.active = 1; });
  addEventListener('pointerleave', () => { ndc.active = 0; });

  const m = new THREE.Matrix4(), f = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const prevF = new Float32Array(N * 3);
  let time = 0, last = performance.now(), raf = 0, running = false, scrollV = 0, lastY = scrollY, travel = 0, vis = 0, show = 0;

  const R_NEIGH = 1.2, R_SEP = 0.5, MAX = 2.4, MIN = 0.9;
  const step = (dt) => {
    const swirl = Math.min(1, Math.abs(scrollV) * 0.6); // 0 calm … 1 full bait ball
    const cx = Math.sin(time * 0.09) * W * 0.42, cy = Math.sin(time * 0.13) * H * 0.3, cz = -4.5 + Math.sin(time * 0.07) * 1.2;
    const px = ndc.x * W, py = ndc.y * H;
    const maxS = MAX * (1 + swirl * 1.5);
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const x = P[ix], y = P[ix + 1], z = P[ix + 2];
      let ax = 0, ay = 0, az = 0, cxs = 0, cys = 0, czs = 0, avx = 0, avy = 0, avz = 0, sx = 0, sy = 0, sz = 0, n = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const jx = j * 3, dx = P[jx] - x, dy = P[jx + 1] - y, dz = P[jx + 2] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R_NEIGH * R_NEIGH) continue;
        n++; cxs += dx; cys += dy; czs += dz; avx += Vv[jx]; avy += Vv[jx + 1]; avz += Vv[jx + 2];
        if (d2 < R_SEP * R_SEP) { const k = 1 / (d2 + 0.01); sx -= dx * k; sy -= dy * k; sz -= dz * k; }
      }
      // a calm school holds together; a scrolled one stretches out into a stream
      const hold = 1 - swirl * 0.75;
      if (n) {
        ax += (cxs / n) * 0.9 * hold + (avx / n - Vv[ix]) * 1.3;
        ay += (cys / n) * 0.9 * hold + (avy / n - Vv[ix + 1]) * 1.3;
        az += (czs / n) * 0.9 * hold + (avz / n - Vv[ix + 2]) * 1.3;
      }
      ax += sx * 0.12; ay += sy * 0.12; az += sz * 0.12;
      // drift towards the wandering centre of the school
      const ox = cx - x, oy = cy - y, oz = cz - z;
      ax += ox * 0.25 * hold; ay += oy * 0.35; az += oz * 0.3;
      // scrolling sends the school across the screen as a river of alici, rippling as it goes
      if (swirl > 0.01) {
        const dir = Math.sign(scrollV) || 1;
        ax += dir * swirl * 4.2;
        ay += Math.sin(x * 0.55 - time * 2.2) * swirl * 2.4 - oy * 0.2 * swirl;
      }
      // the pointer is a predator
      if (ndc.active) {
        const qx = x - px, qy = y - py, d = Math.hypot(qx, qy);
        if (d < 2.6) { const k = (2.6 - d) * 9 / (d + 0.2); ax += qx * k; ay += qy * k; }
      }
      // keep inside the visible water, softly
      if (swirl < 0.25) { if (x > W) ax -= (x - W) * 4; else if (x < -W) ax -= (x + W) * 4; }
      if (y > H) ay -= (y - H) * 4; else if (y < -H) ay -= (y + H) * 4;
      if (z > -1) az -= (z + 1) * 4; else if (z < -8.5) az -= (z + 8.5) * 4;

      let vx = Vv[ix] + ax * dt, vy = Vv[ix + 1] + ay * dt, vz = Vv[ix + 2] + az * dt;
      // keep them swimming level: climb and dive only gently
      const flat = Math.hypot(vx, vz);
      vy = THREE.MathUtils.clamp(vy, -0.45 * flat - 0.2, 0.45 * flat + 0.2);
      let s = Math.hypot(vx, vy, vz);
      const cl = THREE.MathUtils.clamp(s, MIN, maxS) / (s || 1);
      vx *= cl; vy *= cl; vz *= cl;
      Vv[ix] = vx; Vv[ix + 1] = vy; Vv[ix + 2] = vz;
      P[ix] = x + vx * dt; P[ix + 1] = y + vy * dt; P[ix + 2] = z + vz * dt;
      // the page can carry fish off screen; bring them back in on the far side
      if (P[ix + 1] > H + 2) P[ix + 1] = -H - 1.5; else if (P[ix + 1] < -H - 2) P[ix + 1] = H + 1.5;
      // the river leaves one side and comes back on the other
      if (P[ix] > W + 1.5) P[ix] = -W - 1; else if (P[ix] < -W - 1.5) P[ix] = W + 1;
    }
  };

  const frame = (now) => {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    time += dt;
    const y = scrollY, raw = (y - lastY) / Math.max(dt, 1e-3) / innerHeight; lastY = y;
    scrollV += (THREE.MathUtils.clamp(raw, -5, 5) - scrollV) * Math.min(1, dt * 5);
    travel += scrollV * dt;
    vis += (show - vis) * Math.min(1, dt * 2.2);
    fishUni.uTime.value = time; fishUni.uOpacity.value = vis * 0.85; // a touch under full, so text on top stays easy to read
    raysUni.uTime.value = time; raysUni.uOpacity.value = vis; raysUni.uScroll.value = travel;
    snowUni.uTime.value = time; snowUni.uScroll.value = travel * 4; snowUni.uOpacity.value = vis;

    if (vis > 0.01) {
      step(dt);
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        f.set(Vv[ix], Vv[ix + 1], Vv[ix + 2]).normalize();
        // bank into turns: compare with last frame's heading
        pv.set(prevF[ix], prevF[ix + 1], prevF[ix + 2]);
        const turn = THREE.MathUtils.clamp((f.x * pv.y - f.y * pv.x) * 40, -0.9, 0.9);
        prevF[ix] = f.x; prevF[ix + 1] = f.y; prevF[ix + 2] = f.z;
        up.set(0, 1, 0).addScaledVector(f, -f.y).normalize();
        side.crossVectors(f, up);
        up.applyAxisAngle(f, turn);
        side.crossVectors(f, up);
        m.makeBasis(f, up, side);
        q.setFromRotationMatrix(m);
        sc.setScalar(size[i]);
        m.compose(pv.set(P[ix], P[ix + 1], P[ix + 2]), q, sc);
        fish.setMatrixAt(i, m);
        spd[i] = Math.min(1, Math.hypot(Vv[ix], Vv[ix + 1], Vv[ix + 2]) / (MAX * 2));
      }
      fish.instanceMatrix.needsUpdate = true;
      aSpeed.needsUpdate = true;
    }
    renderer.clear();
    if (vis > 0.01) {
      renderer.render(raysScene, raysCam);
      renderer.render(scene, camera);
    }
  };
  const loop = (now) => { frame(now); raf = requestAnimationFrame(loop); };

  return {
    show(v) { show = v ? 1 : 0; },
    run(on) {
      if (on === running) return;
      running = on;
      if (on) { last = performance.now(); lastY = scrollY; raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    },
  };
}
