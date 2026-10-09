/**
 * Breakout Frame 3D — Main Scene
 *
 * Three.js + GSAP + Lenis — Immersive Parallax Experience
 *
 * Para correrlo:
 *   npm install
 *   npm run dev
 *
 * Abrí http://localhost:5173 en el navegador.
 */

import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import "./style.css";

// ============================================================
// SETUP
// ============================================================
gsap.registerPlugin(ScrollTrigger);

const CONFIG = {
  cameraFov: 50,
  cameraZ: 15,
  fogColor: 0x0a0a0a,
  fogNear: 12,
  fogFar: 30,
};

// ============================================================
// 1. LENIS — Smooth Scroll
// ============================================================
const lenis = new Lenis({
  duration: 1.2,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: "vertical",
  smoothWheel: true,
});

function raf(time: number) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ============================================================
// 2. THREE.JS — 3D Scene
// ============================================================
const container = document.getElementById("three-canvas")!;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  CONFIG.cameraFov,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, CONFIG.cameraZ);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
container.appendChild(renderer.domElement);

// ============================================================
// 3. LIGHTS
// ============================================================
scene.add(new THREE.AmbientLight(0x404060, 0.5));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const backLight = new THREE.DirectionalLight(0x4466ff, 0.8);
backLight.position.set(-5, 0, -5);
scene.add(backLight);

// ============================================================
// 4. 3D OBJECTS — Parallax Layers
// ============================================================

/**
 * Parallax Layer: cada capa tiene un mesh y una velocidad.
 * Velocidad más alta = el objeto se mueve más rápido con el scroll
 * = parece estar más cerca = efecto "breakout" (sale de la pantalla)
 */
interface Layer {
  mesh: THREE.Object3D;
  speed: number;
}

const layers: Layer[] = [];

// --- CAPA 1: Fondo — wireframe icosaedro (MUY lento) ---
const bgMesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(4, 1),
  new THREE.MeshStandardMaterial({
    color: 0x2233aa,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  })
);
bgMesh.position.z = -15;
scene.add(bgMesh);
layers.push({ mesh: bgMesh, speed: 0.05 });

// --- CAPA 2: Anillos flotantes (velocidad media) ---
for (let i = 0; i < 8; i++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1 + i * 0.4, 0.05, 16, 32),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(i * 0.12, 0.8, 0.6),
      transparent: true,
      opacity: 0.3 + i * 0.05,
    })
  );
  ring.position.set(
    Math.cos(i * 0.8) * 6,
    Math.sin(i * 0.8) * 6 - 2,
    -5 + i * 0.3
  );
  ring.rotation.x = Math.PI * 0.3;
  ring.rotation.z = i * 0.5;
  scene.add(ring);
  layers.push({ mesh: ring, speed: 0.15 });
}

// --- CAPA 3: Cubo central BREAKOUT (velocidad ALTA = sale de la pantalla) ---
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({
    color: 0xff4477,
    metalness: 0.8,
    roughness: 0.2,
    emissive: 0xff2244,
    emissiveIntensity: 0.2,
  })
);
box.position.set(0, 0, 3); // ← Z positivo = más cerca de la cámara
scene.add(box);
layers.push({ mesh: box, speed: 0.25 });

// --- Satélites orbitando el cubo ---
for (let i = 0; i < 6; i++) {
  const sat = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0x66ddff,
      emissive: 0x4488ff,
      emissiveIntensity: 0.5,
    })
  );
  sat.userData = { angle: (i / 6) * Math.PI * 2, radius: 2 };
  sat.position.z = 3;
  scene.add(sat);
  layers.push({ mesh: sat, speed: 0.25 });
}

// --- CAPA 4: Partículas (velocidad MUY ALTA = breakout extremo) ---
const particleCount = 300;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) {
  positions[i] = (Math.random() - 0.5) * 30;
}
const particles = new THREE.Points(
  new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  ),
  new THREE.PointsMaterial({
    color: 0x88aaff,
    size: 0.08,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })
);
particles.position.z = 3;
scene.add(particles);
layers.push({ mesh: particles, speed: 0.35 });

console.log(`🎯 ${layers.length} parallax layers created`);

// ============================================================
// 5. SCROLL CONNECT — Parallax via Lenis
// ============================================================
lenis.on("scroll", (e: any) => {
  const y = e.animatedScroll ?? e.targetScroll ?? 0;

  // Mover cada capa a su velocidad
  layers.forEach(({ mesh, speed }) => {
    mesh.position.y = -y * speed;
  });

  // Efectos extra
  bgMesh.rotation.y = y * 0.002;

  // Satélites: orbitan mientras scrolleás
  for (const child of scene.children) {
    if (child.userData?.angle !== undefined) {
      const sat = child as THREE.Mesh;
      const newAngle = sat.userData.angle + y * 0.003;
      sat.position.x = Math.cos(newAngle) * sat.userData.radius;
      sat.position.y = Math.sin(newAngle) * sat.userData.radius - y * 0.25;
    }
  }
});

// ============================================================
// 6. GSAP SCROLLTRIGGER — Animación 3D adicional
// ============================================================
gsap.to(box.rotation, {
  y: Math.PI * 4,
  x: Math.PI * 2,
  scrollTrigger: {
    trigger: "body",
    start: "top top",
    end: "bottom bottom",
    scrub: 1.5,
  },
});

gsap.to(box.scale, {
  x: 1.5,
  y: 1.5,
  z: 1.5,
  scrollTrigger: {
    trigger: "body",
    start: "top top",
    end: "bottom bottom",
    scrub: 1.5,
  },
});

// ============================================================
// 7. ANIMATION LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);

  const time = Date.now() * 0.001;

  // Auto-rotación de anillos
  scene.children.forEach((child) => {
    if (child.type === "Mesh" && child !== box && child !== bgMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry.type === "TorusGeometry") {
        mesh.rotation.y += 0.005;
      }
    }
  });

  // Pulsación suave del cubo
  // NOTA: Si GSAP está animando el scale via ScrollTrigger,
  // esta pulsación se suma suavemente al efecto.
  const pulse = 1 + Math.sin(time * 3) * 0.04;
  box.scale.x = pulse;
  box.scale.y = pulse;
  box.scale.z = pulse;

  renderer.render(scene, camera);
}
animate();

// ============================================================
// 8. RESIZE
// ============================================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

console.log("🚀 Breakout Frame 3D corriendo!");
console.log("📦 Stack: Three.js + GSAP ScrollTrigger + Lenis");
