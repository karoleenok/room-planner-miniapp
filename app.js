import * as THREE from "three";
import { OrbitControls } from "./lib/OrbitControls.js";
import { RoomEnvironment } from "./lib/RoomEnvironment.js";
import { RoundedBoxGeometry } from "./lib/RoundedBoxGeometry.js";

const $ = s => document.querySelector(s);

/* Без WebGL три.js не поднимет сцену, и раньше приложение просто висело на спиннере
   без единого слова. Такое бывает в Chrome с выключенным аппаратным ускорением
   и на старых телефонах, поэтому говорим прямо, а не крутим колесо вечно. */
(function () {
  let ok = false;
  try { const c = document.createElement("canvas"); ok = !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (_) { ok = false; }
  if (ok) return;
  const box = document.querySelector("#loading");
  if (box) box.innerHTML = `<div style="max-width:300px;text-align:center;font-family:'Geist',system-ui,sans-serif">
    <div style="font-size:17px;line-height:23px;font-weight:600;color:#111114">Не получается показать комнату</div>
    <div style="font-size:14px;line-height:20px;color:#6B6E76;margin-top:8px">В этом браузере отключён WebGL — без него трёхмерную сцену не нарисовать.<br><br>В Chrome: Настройки → Система → «Использовать аппаратное ускорение». Проверить можно на странице chrome://gpu.</div></div>`;
  throw new Error("WebGL unavailable");
})();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => (Math.round(n * 100) / 100).toString().replace(".", ",");
const rub = n => n.toLocaleString("ru-RU") + " ₽";
let uidN = 1; const nid = () => "i" + (uidN++) + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* ================= материалы и текстуры ================= */
const texCache = {};
function canvasTex(key, size, draw, rep) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (rep) t.repeat.set(rep, rep); texCache[key] = t; return t;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return "#" + c.getHexString(); }
const FLOORS = [
  { id: "oak", n: "Дуб", base: "#C49A6C", kind: "planks" },
  { id: "light", n: "Светлый дуб", base: "#DDBF98", kind: "planks" },
  { id: "walnut", n: "Орех", base: "#8A5F3E", kind: "planks" },
  { id: "tile", n: "Плитка", base: "#D9D6CF", kind: "tile" },
  { id: "concrete", n: "Микроцемент", base: "#B8B4AC", kind: "noise" }
];
function floorTex(f) {
  return canvasTex("floor-" + f.id, 1024, (g, s) => {
    const r = rnd(7); const base = new THREE.Color(f.base);
    if (f.kind === "planks") {
      const rows = 12, h = s / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * s * .6;
        while (x < s) {
          const len = s * (.45 + r() * .35); const k = .88 + r() * .2;
          g.fillStyle = "#" + base.clone().multiplyScalar(k).getHexString(); g.fillRect(x, i * h, len, h);
          g.globalAlpha = .08; for (let j = 0; j < 7; j++) { g.fillStyle = r() > .5 ? "#000" : "#fff"; g.fillRect(x, i * h + r() * h, len, 1 + r() * 1.5); } g.globalAlpha = 1;
          g.fillStyle = "rgba(40,25,10,.35)"; g.fillRect(x, i * h, 2, h); x += len;
        }
        g.fillStyle = "rgba(40,25,10,.35)"; g.fillRect(0, i * h, s, 2);
      }
    } else if (f.kind === "tile") {
      const n = 4, h = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = "#" + base.clone().multiplyScalar(.95 + r() * .08).getHexString(); g.fillRect(i * h, j * h, h, h); }
      g.fillStyle = "rgba(90,85,80,.55)"; for (let i = 0; i <= n; i++) { g.fillRect(i * h - 2, 0, 4, s); g.fillRect(0, i * h - 2, s, 4); }
    } else {
      g.fillStyle = f.base; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) { g.fillStyle = r() > .5 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.06)"; const z = 1 + r() * 4; g.fillRect(r() * s, r() * s, z, z); }
    }
  });
}
function fluffTex(color) {
  return canvasTex("fluff-" + color, 512, (g, s) => {
    const r = rnd(3); g.fillStyle = color; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14000; i++) { g.strokeStyle = r() > .5 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.10)"; const x = r() * s, y = r() * s, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke(); }
  }, 2);
}
function artTex(seed) {
  return canvasTex("art-" + seed, 512, (g, s) => {
    const r = rnd(seed * 13 + 5); const pal = [["#E9D8C4", "#C9785A", "#3E5A6B", "#E7B9A6"], ["#F2EDE4", "#7E9C8A", "#D8B26E", "#2B2D33"], ["#EDE6DA", "#B9C7D6", "#C4262E", "#111114"]][seed % 3];
    g.fillStyle = pal[0]; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { g.fillStyle = pal[1 + (i % 3)]; g.globalAlpha = .9; g.beginPath(); if (r() > .5) g.arc(r() * s, r() * s, 40 + r() * 120, 0, 6.28); else g.rect(r() * s * .7, r() * s * .7, 60 + r() * 180, 60 + r() * 180); g.fill(); }
    g.globalAlpha = 1;
  });
}
const matCache = {};
function M(color, rough = .8, metal = 0, extra = {}) {
  const k = color + rough + metal + JSON.stringify(extra);
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra));
  return matCache[k];
}
const hiMat = col => new THREE.MeshStandardMaterial({ color: col, roughness: .4, emissive: "#3D8BFF", emissiveIntensity: .5 });
const glow = (c, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: .6 });

/* ================= конструкторы предметов ================= */
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
const RB = (w, h, d, r = .03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001));
const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CY = (rt, rb, h, s = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
function legs(g, w, d, h, mat, inset = .05, r = .018) { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(CY(r, r * .8, h, 12), mat, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset))); }
function lampLight(g, y, power = 6, dist = 5) { const L = new THREE.PointLight("#FFC27A", 0, dist, 1.6); L.position.set(0, y, 0); L.userData.power = power; g.add(L); g.userData.lights = (g.userData.lights || []).concat(L); }

/* ---- контейнеры: шкаф, тумба, стеллаж, подоконник ---- */
const cPlinth = p => (p.cont && p.cont.plinth) || 0;
const cShelves = p => (p.cont && p.cont.shelves) || [];
const isOpen = it => !!(it && it.open);
const isCont = p => !!(p && p.cont);
/* уровни, на которые можно что-то поставить: дно + полки */
function contLevels(p) { const T = .018; return [cPlinth(p) + T, ...cShelves(p)].map(y => y + .008); }
function doorLeaves(g, p, v, h, open, glass) {
  const n = (p.cont && p.cont.doors) || 0; if (!n) return; const w = p.w, d = p.d, pl = cPlinth(p), dw = w / n, dh = h - pl - .012;
  for (let i = 0; i < n; i++) {
    const left = i < n / 2, sign = left ? 1 : -1, hx = -w / 2 + dw * i + (left ? 0 : dw);
    const lf = new THREE.Group(); lf.position.set(hx, 0, d / 2 - .005);
    lf.add(mesh(RB(dw - .006, dh, .018, .005), M(v, glass ? .45 : .55), sign * (dw / 2), pl + dh / 2, 0));
    if (glass) { const gl = new THREE.Mesh(BX(dw - .12, dh - .22, .006), new THREE.MeshPhysicalMaterial({ color: "#D6E6F2", roughness: .06, metalness: 0, transparent: true, opacity: .22 })); gl.position.set(sign * (dw / 2), pl + dh / 2, .012); lf.add(gl); }
    if (p.cont.handle) lf.add(mesh(CY(.008, .008, .09, 8), M("#2B2D33", .35, .7), sign * (dw - .07), pl + dh * .52, .022).rotateX(Math.PI / 2));
    lf.rotation.y = open ? -sign * 1.9 : 0; lf.userData.door = 1; g.add(lf);
  }
}
/* ставим вещи внутрь контейнера: по полкам и на заднюю стенку */
function buildInside(g, p, it, room) {
  const list = (it && it.in) || []; if (!list.length) return; const w = p.w, d = p.d, h = p.h || 2.2, T = .018;
  const lv = contLevels(p); const by = {}; for (const o of list) (by[o.s] = by[o.s] || []).push(o);
  const bb = new THREE.Box3(), sz = new THREE.Vector3();
  for (const k in by) {
    const arr = by[k];
    arr.forEach((o, i) => {
      const sp = PROD[o.p]; if (!sp) return; const col = o.col || sp.vars[o.v || 0][0];
      let sub; try { sub = BUILD[sp.b](sp, col, room); } catch (_) { return; }
      bb.setFromObject(sub); bb.getSize(sz); if (!(sz.x > 0)) return;
      const slotW = (w - .1) / arr.length;
      if (k === "back") { // постер на внутреннюю стенку
        const sc = Math.min(slotW / sz.x, (h - cPlinth(p) - .14) / sz.y, 1);
        sub.scale.setScalar(sc); sub.position.set(-w / 2 + slotW * (i + .5) + .05, (h + cPlinth(p)) / 2 - (bb.min.y + sz.y / 2) * sc, -d / 2 + .018);
        sub.rotation.y = 0; g.add(sub); return;
      }
      const y = lv[+k]; if (y === undefined) return;
      const nx = (lv[+k + 1] !== undefined ? lv[+k + 1] : h - T) - y - .02; // высота ниши
      const sc = Math.min(slotW / sz.x, nx / sz.y, (d - .07) / sz.z, 1);
      sub.scale.setScalar(sc); sub.position.set(-w / 2 + slotW * (i + .5) + .05, y - bb.min.y * sc, 0);
      g.add(sub);
    });
  }
}
const BUILD = {
  bed(p, v) { const g = new THREE.Group(); const w = p.w, d = p.d; const wood = M(p.wood || "#B08A63", .65);
    g.add(mesh(RB(w + .08, .28, d + .05, .04), wood, 0, .14, 0));
    g.add(mesh(RB(w, .22, d - .04, .08, 4), M("#F4F1EC", .95), 0, .39, .02));
    g.add(mesh(RB(w + .1, .1, d * .62, .05, 4), M(v, .95), 0, .52, d * .17));
    g.add(mesh(RB(w + .06, .02, .25, .01), M(v, .95), 0, .47, d * .5 - .02).rotateX(-.4));
    const pw = w > 1.2 ? (w - .2) / 2 : w - .2; const n = w > 1.2 ? 2 : 1;
    for (let i = 0; i < n; i++) g.add(mesh(RB(pw - .05, .14, .42, .07, 4), M("#FFFFFF", .95), n === 1 ? 0 : (i ? 1 : -1) * (pw / 2 + .02), .57, -d / 2 + .32));
    g.add(mesh(RB(w + .12, p.head || .95, .1, .045, 4), M(p.headc || v, .92), 0, (p.head || .95) / 2 + .05, -d / 2 - .03));
    return g; },
  night(p, v) { const g = new THREE.Group(); const w = p.w, d = p.d, h = .5; g.add(mesh(RB(w, h - .08, d, .02), M(v, .6), 0, .08 + (h - .08) / 2, 0));
    g.add(mesh(BX(w - .04, .006, .004), M("#2B2D33", .5), 0, .3, d / 2 + .001)); g.add(mesh(CY(.012, .012, .03, 10), M("#C9A86A", .3, .8), 0, .38, d / 2 + .015).rotateX(Math.PI / 2));
    legs(g, w, d, .08, M("#3A2E25", .5), .04, .012); return g; },
  wardrobe(p, v, room, it) { const g = new THREE.Group(); const w = p.w, d = p.d, h = p.h || 2.2; const m = M(v, .7), T = .018, pl = cPlinth(p);
    g.add(mesh(BX(w - .04, pl, d - .04), M("#2B2D33", .8), 0, pl / 2, 0));
    g.add(mesh(BX(w, T, d), m, 0, pl + T / 2, 0)); g.add(mesh(BX(w, T, d), m, 0, h - T / 2, 0));
    for (const s of [-1, 1]) g.add(mesh(BX(T, h - pl, d), m, s * (w / 2 - T / 2), pl + (h - pl) / 2, 0));
    g.add(mesh(BX(w - T * 2, h - pl - T, .008), M(shadeHex(v, .93), .85), 0, pl + (h - pl) / 2, -d / 2 + .005));
    for (const y of cShelves(p)) g.add(mesh(BX(w - T * 2, .016, d - .03), m, 0, y, 0));
    if (p.cont && p.cont.rail) g.add(mesh(CY(.014, .014, w - T * 2, 10), M("#C8C8C8", .3, .8), 0, p.cont.rail, 0).rotateZ(Math.PI / 2));
    doorLeaves(g, p, p.front || v, h, isOpen(it), false); return g; },
  cabinet(p, v, room, it) { const g = new THREE.Group(); const w = p.w, d = p.d, h = p.h || 1; const m = M(v, .62), T = .016, pl = cPlinth(p);
    g.add(mesh(BX(w - .06, pl, d - .06), M("#8A8D96", .55, .4), 0, pl / 2, 0));
    g.add(mesh(BX(w, T, d), m, 0, pl + T / 2, 0)); g.add(mesh(BX(w, T, d), m, 0, h - T / 2, 0));
    for (const s of [-1, 1]) g.add(mesh(BX(T, h - pl, d), m, s * (w / 2 - T / 2), pl + (h - pl) / 2, 0));
    g.add(mesh(BX(w - T * 2, h - pl - T, .008), M(shadeHex(v, .95), .85), 0, pl + (h - pl) / 2, -d / 2 + .005));
    for (const y of cShelves(p)) g.add(mesh(BX(w - T * 2, .014, d - .03), m, 0, y, 0));
    doorLeaves(g, p, p.front || v, h, isOpen(it), true); return g; },
  dresser(p, v) { const g = new THREE.Group(); const w = p.w, d = p.d, h = .82; g.add(mesh(RB(w, h - .1, d, .015), M(v, .6), 0, .1 + (h - .1) / 2, 0));
    for (let i = 1; i < 3; i++) g.add(mesh(BX(w - .04, .006, .004), M("#2B2D33", .6), 0, .1 + i * (h - .1) / 3, d / 2 + .001));
    for (let i = 0; i < 3; i++) g.add(mesh(BX(.12, .015, .02), M("#C9A86A", .3, .8), 0, .1 + (i + .5) * (h - .1) / 3, d / 2 + .01));
    legs(g, w, d, .1, M("#3A2E25", .5), .06, .015); return g; },
  shelf(p, v, room, it) { const g = new THREE.Group(); const w = p.w, d = p.d, h = p.h || 1.85; const m = M(v, .65);
    const mine = it && it.in && it.in.length; // свои вещи вместо демо-книг
    for (const s of [-1, 1]) g.add(mesh(BX(.025, h, d), m, s * (w / 2 - .0125), h / 2, 0));
    g.add(mesh(BX(w, h, .01), m, 0, h / 2, -d / 2 + .005));
    const r = rnd(11); const bc = ["#C4262E", "#3E5A6B", "#E9D8C4", "#7E9C8A", "#D8B26E", "#2B2D33", "#E7B9A6"];
    for (let i = 0; i < 5; i++) { const y = .02 + i * h / 4.6; g.add(mesh(BX(w - .05, .025, d - .01), m, 0, y, 0)); if (i < 4 && !mine) { let x = -w / 2 + .05; while (x < w / 2 - .12 && r() > .12) { const bw = .025 + r() * .03, bh = .2 + r() * .1; g.add(mesh(BX(bw, bh, d * .75), M(bc[(r() * bc.length) | 0], .8), x + bw / 2, y + .013 + bh / 2, .01)); x += bw + .003; } } }
    return g; },
  sofa(p, v) { const g = new THREE.Group(); const w = p.w, d = p.d; const f = M(v, .97); const f2 = M(shadeHex(v, .9), .97);
    g.add(mesh(RB(w, .22, d, .05, 4), f2, 0, .17, 0));
    const n = Math.max(2, Math.round((w - .4) / .7)); const cw = (w - .36) / n;
    for (let i = 0; i < n; i++) { g.add(mesh(RB(cw - .02, .16, d - .25, .07, 4), f, -w / 2 + .18 + cw * (i + .5), .35, .08)); g.add(mesh(RB(cw - .03, .42, .2, .08, 4), f, -w / 2 + .18 + cw * (i + .5), .58, -d / 2 + .17).rotateX(-.12)); }
    for (const s of [-1, 1]) g.add(mesh(RB(.18, .42, d, .08, 4), f2, s * (w / 2 - .09), .4, 0));
    g.add(mesh(RB(w, .48, .14, .05, 4), f2, 0, .5, -d / 2 + .07));
    legs(g, w, d, .06, M("#3A2E25", .5), .08, .02); return g; },
  armchair(p, v) { const g = new THREE.Group(); const w = p.w, d = p.d; const f = M(v, .97);
    g.add(mesh(RB(w, .26, d, .08, 4), f, 0, .3, 0)); g.add(mesh(RB(w, .5, .16, .08, 4), f, 0, .62, -d / 2 + .08));
    for (const s of [-1, 1]) g.add(mesh(RB(.14, .28, d - .1, .06, 4), f, s * (w / 2 - .07), .55, .05));
    legs(g, w, d, .17, M("#B08A63", .5), .08, .018); return g; },
  pouf(p, v) { const g = new THREE.Group(); const m = mesh(new THREE.SphereGeometry(.24, 32, 16), M(v, .98, 0, { map: fluffTex(v) }), 0, .2, 0); m.scale.set(1, .85, 1); g.add(m); return g; },
  desk(p, v) { const g = new THREE.Group(); const w = p.w, d = p.d; g.add(mesh(RB(w, .03, d, .008), M(v, .55), 0, .74, 0));
    const metal = M("#C8C8C8", .35, .8); for (const s of [-1, 1]) { g.add(mesh(BX(.03, .72, .03), metal, s * (w / 2 - .05), .36, -d / 2 + .05)); g.add(mesh(BX(.03, .72, .03), metal, s * (w / 2 - .05), .36, d / 2 - .05)); g.add(mesh(BX(.03, .03, d - .08), metal, s * (w / 2 - .05), .1, 0)); }
    g.add(mesh(RB(.32, .012, .11, .004), M("#F4F4F2", .5), 0, .762, .05)); return g; },
  chair(p, v) { const g = new THREE.Group(); const f = M(v, .9); g.add(mesh(RB(.46, .06, .44, .03, 3), f, 0, .47, 0)); g.add(mesh(RB(.42, .48, .05, .04, 3), f, 0, .78, -.2).rotateX(-.1));
    g.add(mesh(CY(.02, .02, .4, 12), M("#C8C8C8", .3, .8), 0, .25, 0));
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; const l = mesh(BX(.28, .025, .03), M("#C8C8C8", .3, .8), Math.cos(a) * .14, .05, Math.sin(a) * .14); l.rotation.y = -a; g.add(l); g.add(mesh(new THREE.SphereGeometry(.022, 10, 8), M("#2B2D33", .5), Math.cos(a) * .27, .022, Math.sin(a) * .27)); }
    return g; },
  coffee(p, v) { const g = new THREE.Group(); g.add(mesh(CY(p.w / 2, p.w / 2, .03, 40), M(v, .45), 0, .42, 0)); g.add(mesh(CY(.06, .1, .4, 20), M("#2B2D33", .5), 0, .2, 0)); g.add(mesh(CY(.12, .12, .02, 24), M("#2B2D33", .5), 0, .01, 0));
    g.add(mesh(CY(.04, .035, .12, 16), M("#E9D8C4", .4), .12, .5, .05)); return g; },
  floorlamp(p, v) { const g = new THREE.Group(); const m = M("#2B2D33", .4, .5); g.add(mesh(CY(.14, .15, .03, 24), m, 0, .015, 0)); g.add(mesh(CY(.012, .012, 1.35, 10), m, 0, .7, 0));
    const sh = mesh(CY(.13, .2, .3, 32, true), glow(v, .0)); sh.position.y = 1.45; sh.material.side = THREE.DoubleSide; sh.userData.shade = 1; g.add(sh); lampLight(g, 1.4, 5, 5); return g; },
  pendant(p, v, room) { const g = new THREE.Group(); const H = room ? room.H : 2.7; g.add(mesh(CY(.004, .004, .7, 6), M("#1B1C20", .5), 0, H - .35, 0));
    const sh = mesh(new THREE.SphereGeometry(.2, 32, 16, 0, 6.28, 0, 1.6), glow(v, 0)); sh.position.y = H - .78; sh.material.side = THREE.DoubleSide; sh.userData.shade = 1; g.add(sh); lampLight(g, H - .9, 7, 6); return g; },
  sconce(p, v) { const g = new THREE.Group(); g.add(mesh(CY(.05, .05, .02, 20), M("#C9A86A", .3, .8), 0, 1.6, .01).rotateX(Math.PI / 2)); const sh = mesh(new THREE.SphereGeometry(.09, 24, 16), glow(v, 0), 0, 1.6, .1); sh.userData.shade = 1; g.add(sh); lampLight(g, 1.6, 3, 3.5); g.children[g.children.length - 1].position.z = .2; return g; },
  garland(p, v) { const g = new THREE.Group(); const w = p.w; const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector3(-w / 2 + w * t, 2.45 - Math.sin(t * Math.PI) * .35 - Math.abs(Math.sin(t * Math.PI * 2)) * .05, .06)); }
    const cur = new THREE.CatmullRomCurve3(pts); g.add(mesh(new THREE.TubeGeometry(cur, 64, .004, 6), M("#1B1C20", .6)));
    const bm = glow(v, 0); bm.userData = {}; for (let i = 1; i < 12; i++) { const pt = cur.getPoint(i / 12); const b = mesh(new THREE.SphereGeometry(.025, 12, 8), bm, pt.x, pt.y - .03, pt.z); b.castShadow = false; b.userData.shade = 1; g.add(b); }
    for (const t of [.25, .75]) { const L = new THREE.PointLight("#FFC27A", 0, 3.5, 1.8); const pt = cur.getPoint(t); L.position.set(pt.x, pt.y - .1, .25); L.userData.power = 2.2; g.add(L); g.userData.lights = (g.userData.lights || []).concat(L); }
    return g; },
  mirror(p, v) { const g = new THREE.Group(); g.add(mesh(RB(.6, 1.6, .04, .015), M(v, .5), 0, .82, .1)); g.add(mesh(BX(.52, 1.52, .005), M("#DDE6EC", .02, 1), 0, .82, .123)); g.children.forEach(c => c.rotation.x = -.08); return g; },
  art(p, v, room, it) { const g = new THREE.Group(); const w = p.w; const ph = it && it.img && photoTex(it.img); const tex = ph || artTex(p.seed || 1);
    const ar = ph && ph.image ? ph.image.height / ph.image.width : 1.25; const hh = Math.min(w * Math.max(.6, Math.min(2, ar)), 1.4);
    g.add(mesh(BX(w, hh, .03), M(v, .5), 0, 1.5, .02)); g.add(mesh(BX(w - .06, hh - .06, .005), M("#FFFFFF", .8, 0, { map: tex }), 0, 1.5, .038)); return g; },
  wallshelf(p, v) { const g = new THREE.Group(); const w = p.w; g.add(mesh(BX(w, .025, .2), M(v, .6), 0, 1.35, .1)); const bc = ["#C4262E", "#3E5A6B", "#E9D8C4", "#7E9C8A"]; for (let i = 0; i < 6; i++) g.add(mesh(BX(.03, .18 + (i % 3) * .03, .14), M(bc[i % 4], .8), -w / 2 + .1 + i * .035, 1.36 + .1, .1)); g.add(mesh(CY(.05, .04, .1, 16), M("#E9D8C4", .4), w / 2 - .12, 1.41, .1)); return g; },
  plant(p, v) { const g = new THREE.Group(); g.add(mesh(CY(.13, .1, .28, 24), M(v, .7), 0, .14, 0)); g.add(mesh(CY(.12, .12, .01, 24), M("#3A2E25", 1), 0, .28, 0));
    const r = rnd(p.seed || 5); const leaf = M("#4E7D4A", .7); const leaf2 = M("#6E9A6B", .7);
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, h = .45 + r() * .55, t = .15 + r() * .25; const l = mesh(new THREE.SphereGeometry(.11, 12, 8), i % 2 ? leaf : leaf2, Math.cos(a) * t, .28 + h, Math.sin(a) * t); l.scale.set(.45, .18, 1.2); l.rotation.set(r() - .5, a, .6); g.add(l); g.add(mesh(CY(.005, .005, h, 5), leaf, Math.cos(a) * t / 2, .28 + h / 2, Math.sin(a) * t / 2)); }
    return g; },
  vase(p, v) { const g = new THREE.Group(); const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(.06 + Math.sin(t * Math.PI) * .07, t * .35)); }
    g.add(mesh(new THREE.LatheGeometry(pts, 32), M(v, .35), 0, 0, 0)); const br = M("#5A4636", .8); const r = rnd(9);
    for (let i = 0; i < 5; i++) { const s = mesh(CY(.004, .006, .6, 5), br, (r() - .5) * .1, .62, (r() - .5) * .1); s.rotation.set((r() - .5) * .5, 0, (r() - .5) * .5); g.add(s); for (let j = 0; j < 3; j++) g.add(mesh(new THREE.SphereGeometry(.03, 10, 8), M("#FFFFFF", 1), s.position.x + (r() - .5) * .2, .7 + r() * .3, s.position.z + (r() - .5) * .2)); }
    return g; },
  rug(p, v) { const g = new THREE.Group(); const th = p.th || .015; let m;
    if (p.smooth) m = mesh(RB(p.w, th, p.d, .02), M(v, .55), 0, th / 2, 0); // коврик: гладкий, без ворса
    else { const t = fluffTex(v); const mt = M("#ffffff", 1, 0, { map: t });
      m = p.round ? mesh(CY(p.w / 2, p.w / 2, th, 64), mt, 0, th / 2, 0) : mesh(RB(p.w, th, p.d, .006), mt, 0, th / 2, 0); }
    m.castShadow = false; g.add(m); return g; },
  curtain(p, v, room) { const g = new THREE.Group(); const w = p.w; const H = room ? room.H : 2.7;
    const rodY = Math.min(H - .16, 2.9), ph = rodY - .06, bo = !!p.blackout, pw = bo ? w / 2 - .02 : .55;
    g.add(mesh(CY(bo ? .016 : .012, bo ? .016 : .012, w + .2, 10), M("#2B2D33", .4, .6), 0, rodY, .12).rotateZ(Math.PI / 2));
    for (const s of [-1, 1]) { const geo = new THREE.PlaneGeometry(pw, ph, 24, 1); const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * (bo ? 18 : 32)) * (bo ? .05 : .035)); geo.computeVertexNormals();
      const c = mesh(geo, M(v, bo ? .99 : .95, 0, { side: THREE.DoubleSide }), s * (w / 2 - pw / 2), ph / 2 + .03, .12); g.add(c); }
    return g; },
  vine(p, v, room) { const g = new THREE.Group(); const w = p.w; const H = room ? room.H : 2.7; const top = Math.min(H - .12, 2.95);
    g.add(mesh(BX(w, .05, .14), M(p.pot || "#C9B49F", .8), 0, top, .08));
    const r = rnd(p.seed || 7); const lf = M(v, .72), lf2 = M(shadeHex(v, .82), .72);
    for (let i = 0; i < 7; i++) { const x = -w / 2 + w * (i + .5) / 7, len = .5 + r() * (top - .9);
      const pts = []; for (let k = 0; k <= 8; k++) { const tt = k / 8; pts.push(new THREE.Vector3(x + Math.sin(tt * 3 + i) * .05, top - .04 - len * tt, .08 + Math.sin(tt * 2) * .03)); }
      const cur = new THREE.CatmullRomCurve3(pts); g.add(mesh(new THREE.TubeGeometry(cur, 20, .006, 5), lf2));
      for (let k = 1; k <= 7; k++) { const pt = cur.getPoint(k / 7.5); const l = mesh(new THREE.SphereGeometry(.045, 10, 8), k % 2 ? lf : lf2, pt.x + (r() - .5) * .05, pt.y, pt.z + .02);
        l.scale.set(1, .35, .8); l.rotation.set(r() - .5, r() * 3, r() - .5); l.castShadow = false; g.add(l); } }
    return g; },
  tv(p, v, room) { const g = new THREE.Group(); const w = p.w, h = w * .58; const y = p.ony ? h / 2 + .06 : 1.25;
    g.add(mesh(RB(w, h, .035, .006), M("#1B1C20", .45), 0, y, .035));
    g.add(mesh(BX(w - .03, h - .03, .006), M(v, .25, .1, { emissive: v, emissiveIntensity: .12 }), 0, y, .056));
    if (p.ony) { g.add(mesh(BX(w * .3, .018, .14), M("#2B2D33", .5), 0, .012, .03)); g.add(mesh(BX(.05, .06, .1), M("#2B2D33", .5), 0, .04, .03)); }
    return g; },
  monitor(p, v) { const g = new THREE.Group(); const w = p.w, h = w * .6;
    g.add(mesh(CY(.08, .09, .012, 20), M("#2B2D33", .4, .5), 0, .006, 0)); g.add(mesh(BX(.035, .18, .035), M("#2B2D33", .4, .5), 0, .09, 0));
    g.add(mesh(RB(w, h, .022, .005), M("#1B1C20", .45), 0, .19 + h / 2, .012));
    g.add(mesh(BX(w - .02, h - .02, .005), M(v, .22, .1, { emissive: v, emissiveIntensity: .14 }), 0, .19 + h / 2, .028)); return g; },
  basket(p, v) { const g = new THREE.Group(); const h = p.h || .26, R = p.w / 2; const m = M(v, .92, 0, { side: THREE.DoubleSide });
    g.add(mesh(CY(R, R * .84, h, 28, true), m, 0, h / 2, 0)); g.add(mesh(CY(R * .84, R * .84, .012, 28), M(v, .92), 0, .006, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(CY(R * (1 - i * .025) + .004, R * (1 - i * .025) + .004, .012, 28, true), M(shadeHex(v, .88), .9, 0, { side: THREE.DoubleSide }), 0, h * (.22 + i * .3), 0)); return g; },
  books(p, v) { const g = new THREE.Group(); const r = rnd(p.seed || 3); const bc = ["#C4262E", "#3E5A6B", "#E9D8C4", "#7E9C8A", "#D8B26E", "#2B2D33"];
    let x = -p.w / 2; while (x < p.w / 2 - .04) { const bw = .022 + r() * .028, bh = .17 + r() * .09; g.add(mesh(BX(bw, bh, p.d * .85), M(bc[(r() * bc.length) | 0], .8), x + bw / 2, bh / 2, 0)); x += bw + .003; } return g; },
  radiator(w = .8, hi = false) { const g = new THREE.Group(); const m = hi ? hiMat("#F4F4F2") : M("#F4F4F2", .4); const n = Math.max(3, Math.round(w / .08)); for (let i = 0; i < n; i++) g.add(mesh(RB(.07, .55, .08, .02), m, -(n - 1) * .04 + i * .08, .47, .07)); return g; }
};

/* ================= каталог (демо) ================= */
const ST = { ym: "Яндекс Маркет", wb: "Wildberries", oz: "Ozon", my: "Моё" };
const P = (id, n, cat, b, store, price, w, d, vars, extra = {}) => ({ id, n, cat, b, store, price, w, d, vars, ...extra });
const CATALOG = [
  /* --- настоящие товары с Яндекс Маркета, сняты 16.11.2026 --- */
  P("ym-fredmi", "Шкаф Фредми, 4 створки", "Мебель", "wardrobe", "ym", 16065, 1.601, .462,
    [["#4A4D52", "Графит серый"]],
    { h: 2.052, real: 1, at: "16.11.2026", note: "цена с картой Яндекс Пэй", was: 29806, seller: "НОНТОН",
      url: "https://market.yandex.ru/card/shkaf-raspashnoy-4-kh-stvorchatyy-bez-ruchek-fredmi-sh1601--g462--v2052-grafit-seryy/5606832647",
      cont: { doors: 4, plinth: .05, shelves: [.5, .9, 1.3, 1.7], rail: 1.93, handle: 0 } }),
  P("ym-ostin", "Тумба-витрина Остин", "Мебель", "cabinet", "ym", 9079, .8, .419,
    [["#F1EFEA", "Белый шагрень"]],
    { h: .993, top: .993, real: 1, at: "16.11.2026", note: "цена с картой Яндекс Пэй", was: 23488, seller: "Мебель 24",
      front: "#C2994F", url: "https://market.yandex.ru/card/tumba-vitrina-ostin-1639401-tsvet-belyy-shagrendub-kraft-zolotoy/103187794073",
      cont: { doors: 2, plinth: .04, shelves: [.38, .68], handle: 1 } }),
  P("ym-asanka", "Коврик для йоги ASANKA", "Текстиль", "rug", "ym", 2103, 1.83, .61,
    [["#6F5AA6", "Фиолетовый"], ["#4C4F55", "Графитовый"], ["#C9B9A6", "Бежевый"], ["#7E9C8A", "Зелёный"], ["#D8A9A0", "Розовый"]],
    { flat: 1, smooth: 1, th: .006, real: 1, at: "16.11.2026", note: "цена с картой Яндекс Пэй, фиолетовый", was: 6290, seller: "asanka",
      url: "https://market.yandex.ru/card/kovrik-dlya-fitnesa-i-yogi-sportivnyy/103634270656", varNote: "цвета — отдельные товары, цена у каждого своя" }),
  /* --- демо --- */
  P("basket", "Корзина плетёная", "Декор", "basket", "wb", 1290, .32, .32, [["#C9B49F", "Соломa"], ["#E9E4DA", "Белая"], ["#8A5F3E", "Тёмная"]], { h: .26, small: 1 }),
  P("books", "Стопка книг", "Декор", "books", "oz", 890, .34, .16, [["#C4262E", "Разные"]], { small: 1, seed: 3 }),
  P("bed-scandi", "Кровать «Сканди» 160×200", "Мебель", "bed", "wb", 32990, 1.6, 2.0, [["#9FB3C8", "Голубой лён"], ["#E7B9A6", "Пудра"], ["#E9E4DA", "Молочный"]], { wood: "#C49A6C", head: .9 }),
  P("bed-velvet", "Кровать мягкая «Велюр» 160", "Мебель", "bed", "oz", 45990, 1.6, 2.0, [["#7E9C8A", "Шалфей"], ["#C9A99A", "Капучино"], ["#3E4A55", "Графит"]], { wood: "#3A2E25", head: 1.15 }),
  P("bed-single", "Кровать 90×200", "Мебель", "bed", "ym", 17490, .9, 2.0, [["#E7B9A6", "Пудра"], ["#C9D3C0", "Мята"], ["#E9E4DA", "Молочный"]], { wood: "#DDBF98", head: .8 }),
  P("night", "Тумба прикроватная", "Мебель", "night", "wb", 5990, .45, .4, [["#C49A6C", "Дуб"], ["#F2EFE9", "Белая"], ["#2B2D33", "Чёрная"]], { top: .5 }),
  P("wardrobe", "Шкаф двухстворчатый", "Мебель", "wardrobe", "ym", 39990, 1.2, .6, [["#E9E4DA", "Молочный"], ["#C49A6C", "Дуб"], ["#8E9AAF", "Серо-голубой"]], { h: 2.2, rsz: [.8, 2.4], cont: { doors: 2, plinth: .05, shelves: [.6, 1.05, 1.5], rail: 1.9, handle: 1 } }),
  P("dresser", "Комод на ножках", "Мебель", "dresser", "oz", 15990, .9, .45, [["#F2EFE9", "Белый"], ["#C49A6C", "Дуб"], ["#C9D3C0", "Шалфей"]], { top: .82, rsz: [.6, 1.8] }),
  P("shelf", "Стеллаж с книгами", "Мебель", "shelf", "wb", 8990, .8, .32, [["#F2EFE9", "Белый"], ["#C49A6C", "Дуб"]], { h: 1.85, top: 1.85, rsz: [.6, 1.6], cont: { doors: 0, plinth: .02, shelves: [.42, .82, 1.22, 1.62] } }),
  P("sofa", "Диван трёхместный", "Мебель", "sofa", "ym", 52990, 2.1, .95, [["#8E9AAF", "Серо-голубой"], ["#D8C3B0", "Бежевый"], ["#5F6B5A", "Оливковый"]], { rsz: [1.6, 3.2], rszD: [.8, 1.1] }),
  P("armchair", "Кресло мягкое", "Мебель", "armchair", "oz", 18990, .8, .8, [["#7E9C8A", "Шалфей"], ["#C9785A", "Терракота"], ["#E9E4DA", "Букле"]]),
  P("pouf", "Пуф пушистый", "Мебель", "pouf", "wb", 3490, .5, .5, [["#E7C8B8", "Пудра"], ["#F2EFE9", "Белый"]]),
  P("desk", "Стол письменный", "Мебель", "desk", "ym", 11990, 1.2, .6, [["#F2E7E4", "Розовый"], ["#C49A6C", "Дуб"], ["#F2EFE9", "Белый"]], { top: .755, rsz: [.9, 2.6], rszD: [.5, .9] }),
  P("chair", "Кресло офисное", "Мебель", "chair", "oz", 7990, .55, .55, [["#F2EFE9", "Белое"], ["#E7C8B8", "Розовое"], ["#2B2D33", "Чёрное"]]),
  P("coffee", "Журнальный столик", "Мебель", "coffee", "wb", 6990, .7, .7, [["#E9D8C4", "Травертин"], ["#2B2D33", "Чёрный"]], { top: .435, rsz: [.5, 1.2] }),
  P("floorlamp", "Торшер с абажуром", "Свет", "floorlamp", "ym", 6490, .4, .4, [["#FFF1D6", "Тёплый"], ["#F2E2D0", "Лён"]]),
  P("pendant", "Подвесной светильник", "Свет", "pendant", "oz", 8990, .45, .45, [["#FFF1D6", "Опал"], ["#F7E3C2", "Янтарь"]], { ceil: 1 }),
  P("sconce", "Бра шар", "Свет", "sconce", "wb", 2990, .2, .2, [["#FFF1D6", "Опал"]], { wall: 1 }),
  P("garland", "Гирлянда-нить 3 м", "Свет", "garland", "wb", 990, 2.6, .1, [["#FFD9A0", "Тёплый"], ["#FFFFFF", "Холодный"]], { wall: 1 }),
  P("mirror", "Зеркало напольное", "Декор", "mirror", "oz", 7490, .6, .25, [["#E7C8B8", "Розовая рама"], ["#C49A6C", "Дуб"], ["#2B2D33", "Чёрная"]]),
  P("art1", "Постер в раме 50×70", "Декор", "art", "ym", 2490, .5, .05, [["#F2EFE9", "Белая рама"], ["#2B2D33", "Чёрная рама"], ["#C49A6C", "Дуб"]], { wall: 1, seed: 1 }),
  P("art2", "Постер «Формы» 70×90", "Декор", "art", "wb", 3290, .7, .05, [["#2B2D33", "Чёрная рама"], ["#C49A6C", "Дуб"]], { wall: 1, seed: 2 }),
  P("wallshelf", "Полка настенная с книгами", "Декор", "wallshelf", "oz", 1990, .8, .2, [["#F2EFE9", "Белая"], ["#C49A6C", "Дуб"]], { wall: 1 }),
  P("plant", "Монстера в горшке", "Декор", "plant", "ym", 3990, .6, .6, [["#E9D8C4", "Бежевый горшок"], ["#2B2D33", "Чёрный"], ["#C9785A", "Терракота"]], { seed: 5, small: 1 }),
  P("vase", "Ваза с хлопком", "Декор", "vase", "wb", 1890, .3, .3, [["#5E5A62", "Графит"], ["#E9D8C4", "Песок"]], { small: 1 }),
  P("rug-round", "Ковёр круглый пушистый", "Текстиль", "rug", "oz", 5490, 1.8, 1.8, [["#D8A9A0", "Розовый"], ["#E9E4DA", "Молочный"], ["#B9C7D6", "Голубой"]], { round: 1, flat: 1, rsz: [1, 2.6] }),
  P("rug", "Ковёр 200×140", "Текстиль", "rug", "ym", 8990, 2.0, 1.4, [["#C9B49F", "Беж"], ["#8E9AAF", "Серо-голубой"], ["#7E5A4A", "Кирпич"]], { flat: 1, rsz: [1.2, 3.4], rszD: [.8, 2.4] }),
  P("curtain", "Шторы лён 2 шт.", "Текстиль", "curtain", "wb", 4290, 1.8, .2, [["#EDE6DA", "Лён"], ["#C9D3C0", "Шалфей"], ["#E7C8B8", "Пудра"]], { wall: 1 }),
  P("curtain-bo", "Шторы блэкаут 2 шт.", "Текстиль", "curtain", "oz", 5990, 1.8, .22, [["#3E4A55", "Графит"], ["#5F6B5A", "Олива"], ["#7E5A4A", "Какао"], ["#2B2D33", "Чёрный"]], { wall: 1, blackout: 1 }),
  P("vine", "Лиана ампельная", "Декор", "vine", "wb", 2490, .9, .18, [["#4E7D4A", "Зелёная"], ["#6E9A6B", "Светлая"]], { wall: 1, seed: 7 }),
  P("tv", "Телевизор 55\u2033", "Декор", "tv", "oz", 39990, 1.24, .08, [["#1B2430", "Экран"]], { wall: 1 }),
  P("monitor", "Монитор 27\u2033", "Декор", "monitor", "ym", 18990, .62, .2, [["#16202B", "Экран"]], { small: 1 })
];

/* ---------- База: типовые вещи без магазина. Размеры реальные, цвет любой ---------- */
ST.base = "База";
const UPH = [["#E9E4DA", "Молочный"], ["#8E9AAF", "Серо-голубой"], ["#7E9C8A", "Шалфей"], ["#C9785A", "Терракота"]];
const PNT = [["#F2EFE9", "Белый"], ["#C49A6C", "Дуб"], ["#8A5F3E", "Орех"], ["#2B2D33", "Чёрный"]];
const cat1 = id => CATALOG.find(x => x.id === id);
const q5 = x => Math.round(x * 20) / 20;
const BS = (id, sec, n, cat, b, sizes, vars, mid, extra = {}) => {
  const Z = sizes.map(([l, w, d, h]) => ({ l, w, d, h })); const z = Z[mid === undefined ? Math.floor(Z.length / 2) : mid];
  const ws = Z.map(x => x.w), ds = Z.map(x => x.d);
  const o = { id, sec, n, cat, b, store: "base", price: 0, base: 1, w: z.w, d: z.d, vars, sizes: Z,
    rsz: [q5(Math.max(.2, Math.min(...ws) - .1)), q5(Math.max(...ws) + .2)], rszD: [q5(Math.max(.2, Math.min(...ds) - .1)), q5(Math.max(...ds) + .15)] };
  if (z.h) o.h = z.h; return Object.assign(o, extra); };
const BN = (id, sec, n, cat, b, w, d, vars, extra = {}) => Object.assign({ id, sec, n, cat, b, store: "base", price: 0, base: 1, w, d, vars }, extra);
const BED = [["90×200", .9, 2], ["120×200", 1.2, 2], ["140×200", 1.4, 2], ["160×200", 1.6, 2], ["180×200", 1.8, 2]];
const SHELFC = cat1("shelf").cont;
CATALOG.push(
  BS("b-bed", "Кровати", "Кровать с изголовьем", "Мебель", "bed", BED, UPH, 3, { wood: "#B08A63", head: .95 }),
  BS("b-bed-low", "Кровати", "Кровать низкая", "Мебель", "bed", BED, UPH, 3, { wood: "#5E4330", head: .5 }),
  BS("b-bed-soft", "Кровати", "Кровать с высоким изголовьем", "Мебель", "bed", BED, UPH, 3, { wood: "#D8CFC2", head: 1.3 }),
  BS("b-bed-kid", "Кровати", "Кровать детская", "Мебель", "bed", [["70×160", .7, 1.6], ["80×190", .8, 1.9], ["90×200", .9, 2]], UPH, 1, { wood: "#DDBF98", head: .7 }),
  BS("b-sofa", "Диваны и кресла", "Диван", "Мебель", "sofa", [["2-местный 150", 1.5, .9], ["3-местный 210", 2.1, .95], ["4-местный 260", 2.6, 1]], UPH, 1),
  BS("b-sofa-s", "Диваны и кресла", "Диван компактный", "Мебель", "sofa", [["120", 1.2, .8], ["140", 1.4, .85], ["160", 1.6, .85]], UPH, 1),
  BS("b-armchair", "Диваны и кресла", "Кресло", "Мебель", "armchair", [["S · 70", .7, .75], ["M · 80", .8, .85], ["L · 95", .95, .95]], UPH, 1),
  BN("b-pouf", "Диваны и кресла", "Пуф", "Мебель", "pouf", .5, .5, [["#E7C8B8", "Пудра"], ["#F2EFE9", "Белый"], ["#8E9AAF", "Серо-голубой"], ["#7E9C8A", "Шалфей"]]),
  BN("b-chair", "Диваны и кресла", "Кресло офисное", "Мебель", "chair", .55, .55, [["#F2EFE9", "Белое"], ["#2B2D33", "Чёрное"], ["#8E9AAF", "Серо-голубое"], ["#C9785A", "Терракота"]]),
  BS("b-desk", "Столы", "Стол письменный", "Мебель", "desk", [["100×50", 1, .5], ["120×60", 1.2, .6], ["140×70", 1.4, .7], ["160×75", 1.6, .75]], PNT, 1, { top: .755 }),
  BS("b-desk-xl", "Столы", "Стол рабочий широкий", "Мебель", "desk", [["160×80", 1.6, .8], ["180×80", 1.8, .8], ["200×90", 2, .9]], PNT, 1, { top: .755 }),
  BS("b-dining", "Столы", "Стол обеденный", "Мебель", "desk", [["120×75", 1.2, .75], ["140×80", 1.4, .8], ["160×90", 1.6, .9], ["200×100", 2, 1]], PNT, 1, { top: .755 }),
  BS("b-coffee", "Столы", "Журнальный столик круглый", "Мебель", "coffee", [["Ø50", .5, .5], ["Ø70", .7, .7], ["Ø90", .9, .9]], [["#E9D8C4", "Травертин"], ["#2B2D33", "Чёрный"], ["#F2EFE9", "Белый"], ["#C49A6C", "Дуб"]], 1, { top: .435, rszD: null }),
  BS("b-wardrobe2", "Хранение", "Шкаф, 2 створки", "Мебель", "wardrobe", [["80×50×200", .8, .5, 2], ["100×55×210", 1, .55, 2.1], ["120×60×220", 1.2, .6, 2.2]], PNT, 1, { hr: [1.8, 2.6], cont: { doors: 2, plinth: .05, shelves: [.5, .9, 1.3, 1.7], rail: 1.9, handle: 1 } }),
  BS("b-wardrobe3", "Хранение", "Шкаф, 3 створки", "Мебель", "wardrobe", [["120×55×220", 1.2, .55, 2.2], ["150×60×220", 1.5, .6, 2.2], ["180×60×220", 1.8, .6, 2.2]], PNT, 1, { hr: [1.8, 2.6], cont: { doors: 3, plinth: .05, shelves: [.5, .9, 1.3, 1.7], rail: 1.9, handle: 1 } }),
  BS("b-wardrobe4", "Хранение", "Шкаф, 4 створки", "Мебель", "wardrobe", [["160×60×220", 1.6, .6, 2.2], ["200×60×220", 2, .6, 2.2], ["240×60×240", 2.4, .6, 2.4]], PNT, 1, { hr: [1.8, 2.6], cont: { doors: 4, plinth: .05, shelves: [.5, .9, 1.3, 1.7], rail: 1.9, handle: 0 } }),
  BS("b-dresser", "Хранение", "Комод", "Мебель", "dresser", [["S · 60×40", .6, .4], ["M · 90×45", .9, .45], ["L · 120×50", 1.2, .5], ["XL · 160×50", 1.6, .5]], PNT, 1, { top: .82 }),
  BS("b-night", "Хранение", "Тумбочка прикроватная", "Мебель", "night", [["40×35", .4, .35], ["50×40", .5, .4], ["60×45", .6, .45]], PNT, 1, { top: .5 }),
  BS("b-tvstand", "Хранение", "Тумба под ТВ", "Мебель", "cabinet", [["100×40", 1, .4, .5], ["140×40", 1.4, .4, .5], ["180×40", 1.8, .4, .5]], PNT, 1, { hr: [.35, .9], hrTop: 1, top: .5, cont: { doors: 2, plinth: .04, shelves: [.25], handle: 1 } }),
  BS("b-buffet", "Хранение", "Буфет, витрина", "Мебель", "cabinet", [["80×40×100", .8, .4, 1], ["100×40×110", 1, .4, 1.1], ["120×45×120", 1.2, .45, 1.2]], PNT, 1, { hr: [.8, 1.6], hrTop: 1, top: 1.1, cont: { doors: 2, plinth: .04, shelves: [.38, .68], handle: 1 } }),
  BS("b-shelf", "Хранение", "Стеллаж", "Мебель", "shelf", [["60×30×185", .6, .3, 1.85], ["80×32×185", .8, .32, 1.85], ["120×35×185", 1.2, .35, 1.85]], PNT, 1, { hr: [1.2, 2.4], hrTop: 1, top: 1.85, cont: SHELFC }),
  BN("b-floorlamp", "Свет", "Торшер", "Свет", "floorlamp", .4, .4, [["#FFF1D6", "Тёплый"], ["#F2E2D0", "Лён"], ["#FFFFFF", "Белый"], ["#2B2D33", "Чёрный"]]),
  BN("b-pendant", "Свет", "Светильник подвесной", "Свет", "pendant", .45, .45, [["#FFF1D6", "Опал"], ["#F7E3C2", "Янтарь"], ["#FFFFFF", "Белый"], ["#2B2D33", "Чёрный"]], { ceil: 1 }),
  BN("b-sconce", "Свет", "Бра", "Свет", "sconce", .2, .2, [["#FFF1D6", "Опал"], ["#FFFFFF", "Белый"], ["#2B2D33", "Чёрный"]], { wall: 1 }),
  BS("b-rug", "Декор и текстиль", "Ковёр прямоугольный", "Текстиль", "rug", [["S · 120×170", 1.2, 1.7], ["M · 160×230", 1.6, 2.3], ["L · 200×300", 2, 3]], [["#C9B49F", "Беж"], ["#8E9AAF", "Серо-голубой"], ["#7E5A4A", "Кирпич"], ["#E9E4DA", "Молочный"]], 1, { flat: 1 }),
  BS("b-rug-round", "Декор и текстиль", "Ковёр круглый", "Текстиль", "rug", [["Ø100", 1, 1], ["Ø150", 1.5, 1.5], ["Ø200", 2, 2]], [["#D8A9A0", "Розовый"], ["#E9E4DA", "Молочный"], ["#B9C7D6", "Голубой"], ["#C9B49F", "Беж"]], 1, { round: 1, flat: 1, rszD: null }),
  BN("b-curtain", "Декор и текстиль", "Шторы", "Текстиль", "curtain", 1.8, .2, [["#EDE6DA", "Лён"], ["#C9D3C0", "Шалфей"], ["#E7C8B8", "Пудра"], ["#3E4A55", "Графит"]], { wall: 1 }),
  BN("b-mirror", "Декор и текстиль", "Зеркало напольное", "Декор", "mirror", .6, .25, [["#E7C8B8", "Розовая рама"], ["#C49A6C", "Дуб"], ["#2B2D33", "Чёрная"], ["#F2EFE9", "Белая"]]),
  BN("b-plant", "Декор и текстиль", "Растение в горшке", "Декор", "plant", .6, .6, [["#E9D8C4", "Бежевый горшок"], ["#2B2D33", "Чёрный"], ["#C9785A", "Терракота"], ["#F2EFE9", "Белый"]]),
  BS("b-art", "Декор и текстиль", "Постер в раме", "Декор", "art", [["30×40", .3, .4], ["50×70", .5, .7], ["70×100", .7, 1]], [["#F2EFE9", "Белая рама"], ["#2B2D33", "Чёрная рама"], ["#C49A6C", "Дуб"], ["#8A5F3E", "Орех"]], 1, { wall: 1, seed: 4, rszD: null })
);
const PROD = Object.fromEntries(CATALOG.map(p => [p.id, p]));

/* ================= свои вещи: из фото в объект =================
   фото не превращается в 3D само: мы берём нашу модель нужного типа и надеваем на неё фото.
   hv — откуда берётся высота: p — модель её принимает, s — тянем модель по Y, a — из пропорций фото, "-" — фиксированная.
   mode — как показать: model (фото на фасаде нашей модели) или cut (силуэт, вырезанный по фото). */
const ARCH = [
  { k: "wardrobe", n: "Шкаф", cat: "Мебель", b: "wardrobe", w: 1.2, d: .6, h: 2.2, hv: "p", mode: "model", ex: { rsz: [.5, 3.2], rszD: [.3, .9], cont: { doors: 2, plinth: .05, shelves: [.6, 1.05, 1.5], rail: 1.9, handle: 1 } } },
  { k: "cabinet", n: "Тумба, витрина", cat: "Мебель", b: "cabinet", w: .8, d: .42, h: 1, hv: "p", mode: "model", top: 1, ex: { rsz: [.4, 2.2], rszD: [.25, .7], cont: { doors: 2, plinth: .04, shelves: [.4, .7], handle: 1 } } },
  { k: "night", n: "Тумбочка", cat: "Мебель", b: "night", w: .45, d: .4, h: .5, hv: "s", h0: .5, mode: "model", top: 1, ex: { rsz: [.3, .9], rszD: [.25, .6] } },
  { k: "dresser", n: "Комод", cat: "Мебель", b: "dresser", w: .9, d: .45, h: .82, hv: "s", h0: .82, mode: "model", top: 1, ex: { rsz: [.5, 2], rszD: [.3, .6] } },
  { k: "shelf", n: "Стеллаж, полки", cat: "Мебель", b: "shelf", w: .8, d: .32, h: 1.85, hv: "p", mode: "model", top: 1, ex: { rsz: [.4, 2], rszD: [.2, .6], cont: { doors: 0, plinth: .02, shelves: [.42, .82, 1.22, 1.62] } } },
  { k: "desk", n: "Стол", cat: "Мебель", b: "desk", w: 1.2, d: .6, h: .755, hv: "s", h0: .755, mode: "model", top: 1, ex: { rsz: [.6, 2.8], rszD: [.4, 1] } },
  { k: "coffee", n: "Журнальный столик", cat: "Мебель", b: "coffee", w: .7, d: .7, h: .44, hv: "s", h0: .435, mode: "model", top: 1, ex: { rsz: [.4, 1.4], rszD: [.4, 1.2] } },
  { k: "bed", n: "Кровать", cat: "Мебель", b: "bed", w: 1.6, d: 2, h: .9, hv: "-", mode: "model", ex: { rsz: [.8, 2.2], rszD: [1.7, 2.3], wood: "#B08A63" } },
  { k: "sofa", n: "Диван", cat: "Мебель", b: "sofa", w: 2.1, d: .95, h: .85, hv: "s", h0: .85, mode: "model", ex: { rsz: [1, 3.4], rszD: [.7, 1.2] } },
  { k: "armchair", n: "Кресло, стул", cat: "Мебель", b: "armchair", w: .8, d: .8, h: .9, hv: "s", h0: .9, mode: "cut", ex: { rsz: [.4, 1.2], rszD: [.4, 1.2] } },
  { k: "pouf", n: "Пуф", cat: "Мебель", b: "pouf", w: .5, d: .5, h: .45, hv: "s", h0: .45, mode: "cut", ex: {} },
  { k: "mirror", n: "Зеркало", cat: "Декор", b: "mirror", w: .6, d: .25, h: 1.7, hv: "s", h0: 1.7, mode: "cut", ex: {} },
  { k: "rug", n: "Ковёр, коврик", cat: "Текстиль", b: "rug", w: 2, d: 1.4, h: .02, hv: "-", mode: "flat", ex: { flat: 1, smooth: 1, th: .012, rsz: [.5, 4], rszD: [.4, 3] } },
  { k: "art", n: "Постер, картина", cat: "Декор", b: "art", w: .5, d: .05, h: .7, hv: "a", mode: "wall", ex: { wall: 1, rsz: [.2, 1.6] } },
  { k: "tv", n: "ТВ, экран", cat: "Декор", b: "tv", w: 1.24, d: .08, h: .72, hv: "a", mode: "wall", ex: { wall: 1 } },
  { k: "floorlamp", n: "Торшер", cat: "Свет", b: "floorlamp", w: .4, d: .4, h: 1.6, hv: "s", h0: 1.6, mode: "cut", ex: {} },
  { k: "pendant", n: "Люстра, подвес", cat: "Свет", b: "pendant", w: .45, d: .45, h: .4, hv: "-", mode: "cut", ex: { ceil: 1 } },
  { k: "sconce", n: "Бра", cat: "Свет", b: "sconce", w: .2, d: .2, h: .2, hv: "a", mode: "wall", ex: { wall: 1 } },
  { k: "plant", n: "Растение", cat: "Декор", b: "plant", w: .6, d: .6, h: 1, hv: "s", h0: 1, mode: "cut", cross: 1, ex: { small: 1 } },
  { k: "basket", n: "Корзина, ящик", cat: "Декор", b: "basket", w: .32, d: .32, h: .26, hv: "p", mode: "model", ex: { small: 1 } },
  { k: "decor", n: "Мелочь на полку", cat: "Декор", b: "vase", w: .25, d: .25, h: .35, hv: "s", h0: .95, mode: "cut", cross: 1, ex: { small: 1 } }
];
const ARC = Object.fromEntries(ARCH.map(a => [a.k, a]));

/* ================= комнаты ================= */
const OPC = [["#FAFAF8", "Белый"], ["#E9E4DA", "Молочный"], ["#C9C6C0", "Серый"], ["#C49A6C", "Дуб"], ["#8A5F3E", "Орех"], ["#4A5560", "Графит"], ["#2B2D33", "Чёрный"]];
const WALLC = [["#F2EFE9", "Тёплый белый"], ["#EFE6D2", "Ваниль"], ["#C9D3C0", "Шалфей"], ["#E3CFC2", "Пудра"], ["#B9C7D6", "Туман"], ["#D8C3B0", "Глина"], ["#4A5560", "Графит"]];
const rectPts = (L, W) => [[0, 0], [L, 0], [L, W], [0, W]];
const lPts = (L, W) => [[0, 0], [L, 0], [L, W * .55], [L * .6, W * .55], [L * .6, W], [0, W]];
function newRoom(o = {}) { const r = Object.assign({ id: nid(), name: "Спальня", type: "Спальня", shape: "rect", L: 4.2, W: 3.4, H: 2.7, openings: [], wallColors: {}, wallDefault: "#F2EFE9", floor: "oak", items: [], step: 1, snap: null }, o); if (!r.pts) r.pts = r.shape === "L" ? lPts(r.L, r.W) : rectPts(r.L, r.W); return r; }
const PRESETS = [
  { t: "Уютная комната с гирляндой", by: "Подборка канала @ohmyprompts", room: { name: "Комната с гирляндой", L: 3.6, W: 3.4, wallDefault: "#EFE6D2", floor: "light", night: 1,
    openings: [{ type: "window", wall: 3, pos: 1.2, w: 1.0 }],
    items: [["desk", 0, .9, .32, 1, 1], ["chair", 2, 1.0, .9, 3], ["shelf", 0, 2.1, .2, 0], ["rug-round", 0, 1.8, 1.7, 0], ["mirror", 0, 3.3, 1.6, 3], ["garland", 0, 1.9, 0, 0], ["art1", 1, .1, 1.0, 1], ["wallshelf", 0, .1, 2.0, 1], ["vase", 1, 3.3, 2.6, 0], ["pouf", 0, 2.7, 2.6, 0]] } },
  { t: "Спальня в светлом дереве", by: "Партнёрская подборка", ad: "[партнёр]", room: { name: "Спальня в дереве", L: 4.3, W: 3.4, wallDefault: "#F2EFE9", floor: "oak", wallColors: { 0: "#C9D3C0" },
    openings: [{ type: "window", wall: 1, pos: 1.9, w: 1.4 }, { type: "door", wall: 2, pos: 3.3, w: .9 }, { type: "radiator", wall: 1, pos: 1.9, w: 1.0 }],
    items: [["bed-scandi", 0, 1.6, 1.15, 0], ["night", 1, .5, .25, 0], ["night", 1, 2.7, .25, 0], ["wardrobe", 2, 3.65, .32, 0], ["rug", 0, 1.6, 2.2, 0], ["plant", 0, 3.9, 2.95, 0], ["dresser", 0, .3, 2.2, 1], ["art2", 0, 1.6, 0, 0], ["curtain", 0, 4.3, 1.9, 3]] } },
  { t: "Гостиная с диваном", by: "Подборка Яндекс Маркета", room: { name: "Гостиная", L: 5, W: 3.8, wallDefault: "#E3CFC2", floor: "walnut",
    openings: [{ type: "balcony", wall: 0, pos: 3.4, w: .8 }, { type: "window", wall: 0, pos: 1.7, w: 1.5 }],
    items: [["sofa", 0, 2.4, 3.3, 2], ["coffee", 0, 2.4, 2.2, 0], ["rug", 2, 2.4, 2.4, 0], ["armchair", 1, .7, 1.6, 1], ["shelf", 1, .2, 3.0, 1], ["floorlamp", 1, .5, 3.4, 0], ["plant", 2, 4.5, 3.3, 0], ["pendant", 0, 2.4, 2.2, 0], ["art1", 2, 2.4, 3.8, 2]] } }
];
function presetRoom(i) { const p = PRESETS[i].room; const r = newRoom({ name: p.name, L: p.L, W: p.W, wallDefault: p.wallDefault, floor: p.floor, wallColors: Object.assign({}, p.wallColors || {}), openings: p.openings.map(o => Object.assign({ id: nid() }, o)), step: 4 });
  r.items = p.items.map(([k, vi, x, z, rot]) => ({ id: nid(), p: k, v: vi, x, z, rot: rot || 0 })); r.night = !!p.night; for (const it of r.items) if (PROD[it.p].wall) snapWall(r, it); return r; }

/* ================= геометрия комнаты ================= */
function edges(r) { const pts = r.pts; const out = []; const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0);
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz); const d = [dx / len, dz / len];
    let n = area > 0 ? [-d[1], d[0]] : [d[1], -d[0]]; out.push({ i, a, b, len, d, n }); } return out; }
function inside(pts, x, z) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function center(r) { const xs = r.pts.map(p => p[0]), zs = r.pts.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)]; }
function area(r) { const p = r.pts; return Math.abs(p.reduce((a, q, i) => { const s = p[(i + 1) % p.length]; return a + (q[0] * s[1] - s[0] * q[1]); }, 0)) / 2; }
function snapWall(r, it) { const E = edges(r); let best = null; for (const e of E) { const t = Math.max(0, Math.min(e.len, (it.x - e.a[0]) * e.d[0] + (it.z - e.a[1]) * e.d[1])); const px = e.a[0] + e.d[0] * t, pz = e.a[1] + e.d[1] * t; const dist = Math.hypot(it.x - px, it.z - pz); if (!best || dist < best.dist) best = { e, t, px, pz, dist }; }
  const p = PROD[it.p]; const half = (it.w || p.w) / 2; const t = Math.max(half, Math.min(best.e.len - half, best.t)); it.x = best.e.a[0] + best.e.d[0] * t; it.z = best.e.a[1] + best.e.d[1] * t; it.wallIdx = best.e.i; it.ry = Math.atan2(best.e.n[0], best.e.n[1]); }
const dims = it => { const p = PROD[it.p]; return { w: it.w || p.w, d: it.d || p.d }; };
const onSurf = it => !!it.on;
function foot(it) { const q = dims(it); return it.rot % 2 ? { w: q.d, d: q.w } : { w: q.w, d: q.d }; }
/* высота столешницы, если на предмет можно что-то ставить */
const topY = it => { const p = PROD[it.p]; return p.hrTop && it.h ? it.h : (p.top || 0); };
function overlaps(r) { const bad = new Set(); const s = r.items.filter(i => !i.on && !PROD[i.p].flat && !PROD[i.p].wall && !PROD[i.p].ceil);
  for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) { const A = s[a], B = s[b], fa = foot(A), fb = foot(B); if (Math.abs(A.x - B.x) < (fa.w + fb.w) / 2 - .03 && Math.abs(A.z - B.z) < (fa.d + fb.d) / 2 - .03) { bad.add(A.id); bad.add(B.id); } }
  for (const it of s) { const f = foot(it); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (!inside(r.pts, it.x + sx * (f.w / 2 - .02), it.z + sz * (f.d / 2 - .02))) bad.add(it.id); }
  return bad; }

/* ---------- физика: стены, соседи, магниты, зона двери ---------- */
const isFloor = p => !p.wall && !p.ceil && !p.flat;
function doorZones(r) { const out = []; for (const o of r.openings) { if (o.type !== "door") continue; const e = edges(r)[o.wall]; if (!e) continue;
  const xs = [], zs = []; for (const [t, k] of [[-o.w / 2, 0], [o.w / 2, 0], [-o.w / 2, .9], [o.w / 2, .9]]) { xs.push(e.a[0] + e.d[0] * (o.pos + t) + e.n[0] * k); zs.push(e.a[1] + e.d[1] * (o.pos + t) + e.n[1] * k); }
  out.push([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]); } return out; }
function okFloor(r, it) { if (it.on) return true; const f = foot(it), hw = f.w / 2, hd = f.d / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (!inside(r.pts, it.x + sx * (hw - .01), it.z + sz * (hd - .01))) return false;
  for (const b of r.items) { if (b === it || onSurf(b) || !isFloor(PROD[b.p])) continue; const g = foot(b); if (Math.abs(it.x - b.x) < hw + g.w / 2 - .005 && Math.abs(it.z - b.z) < hd + g.d / 2 - .005) return false; }
  for (const [x0, x1, z0, z1] of doorZones(r)) if (it.x + hw > x0 + .01 && it.x - hw < x1 - .01 && it.z + hd > z0 + .01 && it.z - hd < z1 - .01) return false;
  return true; }
function magnet(r, it) { const SN = .12, save = [it.x, it.z], f = foot(it), hw = f.w / 2, hd = f.d / 2;
  for (const e of edges(r)) { if (Math.abs(e.d[0]) > .99) { const z0 = e.a[1], xa = Math.min(e.a[0], e.b[0]), xb = Math.max(e.a[0], e.b[0]); if (it.x < xa - .05 || it.x > xb + .05) continue;
      if (e.n[1] > 0 && Math.abs(it.z - hd - z0) < SN) it.z = z0 + hd; else if (e.n[1] < 0 && Math.abs(z0 - it.z - hd) < SN) it.z = z0 - hd; }
    else if (Math.abs(e.d[1]) > .99) { const x0 = e.a[0], za = Math.min(e.a[1], e.b[1]), zb = Math.max(e.a[1], e.b[1]); if (it.z < za - .05 || it.z > zb + .05) continue;
      if (e.n[0] > 0 && Math.abs(it.x - hw - x0) < SN) it.x = x0 + hw; else if (e.n[0] < 0 && Math.abs(x0 - it.x - hw) < SN) it.x = x0 - hw; } }
  for (const b of r.items) { if (b === it || onSurf(b) || !isFloor(PROD[b.p])) continue; const g = foot(b), dx = it.x - b.x, dz = it.z - b.z;
    if (Math.abs(dz) < hd + g.d / 2 + SN && Math.abs(Math.abs(dx) - hw - g.w / 2) < SN) { it.x = b.x + Math.sign(dx || 1) * (hw + g.w / 2); if (Math.abs(dz) < .1) it.z = b.z; }
    else if (Math.abs(dx) < hw + g.w / 2 + SN && Math.abs(Math.abs(dz) - hd - g.d / 2) < SN) { it.z = b.z + Math.sign(dz || 1) * (hd + g.d / 2); if (Math.abs(dx) < .1) it.x = b.x; } }
  it.x = Math.round(it.x * 100) / 100; it.z = Math.round(it.z * 100) / 100; if (!okFloor(r, it)) { it.x = save[0]; it.z = save[1]; } }
function moveFloor(r, it, nx, nz, lx, lz) { const ok = (x, z) => { it.x = x; it.z = z; return okFloor(r, it); };
  const bis = (a, b, f) => { if (f(b)) return b; let lo = a, hi = b; for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return lo; };
  let x = lx, z = lz; x = bis(x, nx, t => ok(t, z)); z = bis(z, nz, t => ok(x, t)); x = bis(x, nx, t => ok(t, z));
  it.x = x; it.z = z; magnet(r, it); return [it.x, it.z]; }
function findNear(r, it) { const x0 = it.x, z0 = it.z; if (okFloor(r, it)) return true;
  for (let k = 1; k <= 24; k++) { const d = k * .05; for (const [a, b] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) { it.x = x0 + a; it.z = z0 + b; if (okFloor(r, it)) return true; } }
  it.x = x0; it.z = z0; return false; }
/* настенные предметы: штора подгоняется под окно, остальные обходят проёмы */
const iw = it => it.w || PROD[it.p].w;
function adaptWall(r, it) { const p = PROD[it.p]; if (!p.wall) return; const E = edges(r); if (it.wallIdx === undefined || !E[it.wallIdx]) snapWall(r, it);
  const e = E[it.wallIdx]; if (!e) return; let t = (it.x - e.a[0]) * e.d[0] + (it.z - e.a[1]) * e.d[1];
  const ops = r.openings.filter(o => o.wall === e.i && o.type !== "radiator");
  if (p.b === "curtain") { it.w = undefined; const mine = it.win && ops.find(o => o.id === it.win);
    const win = mine || ops.filter(o => o.type === "window" || o.type === "balcony").sort((a, b) => Math.abs(a.pos - t) - Math.abs(b.pos - t))[0];
    if (win && (mine || Math.abs(win.pos - t) < win.w / 2 + .6)) { t = win.pos; it.win = win.id; it.w = Math.min(r05(win.w + (PROD[it.p].blackout ? .8 : .5)), e.len - .1); } }
  else { const w = p.w; for (const o of ops) { if (Math.abs(t - o.pos) < o.w / 2 + w / 2) { const L = o.pos - o.w / 2 - w / 2 - .05, R = o.pos + o.w / 2 + w / 2 + .05; const cand = [L, R].filter(c => c >= w / 2 && c <= e.len - w / 2); if (cand.length) t = cand.sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0]; } } }
  const half = iw(it) / 2; t = Math.max(half, Math.min(e.len - half, t)); it.x = e.a[0] + e.d[0] * t; it.z = e.a[1] + e.d[1] * t; it.ry = Math.atan2(e.n[0], e.n[1]); }
function adaptAll(r) { for (const it of r.items) adaptWall(r, it); }

/* ================= цвета, материалы, проёмы ================= */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r05 = v => Math.round(v * 20) / 20;
const PAL = [["#F2EFE9", "Белый"], ["#E9E4DA", "Молочный"], ["#D8C3B0", "Беж"], ["#C9B49F", "Песок"], ["#C49A6C", "Дуб"], ["#8A5F3E", "Орех"], ["#C9A99A", "Капучино"], ["#C9785A", "Терракота"], ["#7E5A4A", "Кирпич"], ["#E7C8B8", "Пудра"], ["#D8A9A0", "Розовый"], ["#7A2E3A", "Бордо"], ["#D8B26E", "Горчичный"], ["#C9D3C0", "Мята"], ["#7E9C8A", "Шалфей"], ["#5F6B5A", "Оливковый"], ["#9FB3C8", "Голубой"], ["#8E9AAF", "Серо-голубой"], ["#3E5A6B", "Синий"], ["#B7A9C9", "Лаванда"], ["#3E4A55", "Графит"], ["#2B2D33", "Чёрный"]];
const MATS = [["none", "Гладкий"], ["linen", "Лён"], ["boucle", "Букле"], ["velvet", "Велюр"], ["wood", "Дерево"], ["marble", "Мрамор"], ["concrete", "Бетон"]];
const PHOTOS = {}; let photoN = 0;
const isPh = m => !!m && m.startsWith("ph");

/* нейтральные (светлые) текстуры: цвет предмета умножается на них, поэтому цвет и материал выбираются отдельно */
function matTex(key) {
  const draw = {
    linen: (g, s) => { g.fillStyle = "#F4F4F4"; g.fillRect(0, 0, s, s); const r = rnd(21); for (let i = 0; i < s; i += 2) { g.fillStyle = `rgba(0,0,0,${.03 + r() * .07})`; g.fillRect(i, 0, 1, s); g.fillStyle = `rgba(255,255,255,${.1 + r() * .2})`; g.fillRect(0, i, s, 1); } for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(0,0,0,${r() * .08})`; g.fillRect(r() * s, r() * s, 1 + r() * 6, 1); } },
    boucle: (g, s) => { g.fillStyle = "#F0F0F0"; g.fillRect(0, 0, s, s); const r = rnd(5); for (let i = 0; i < 5200; i++) { const x = r() * s, y = r() * s, a = r() * 6.28; g.strokeStyle = r() > .5 ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.95)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 2 + r() * 3, a, a + 3.5); g.stroke(); } },
    velvet: (g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, "#FFFFFF"); gr.addColorStop(.5, "#E2E2E2"); gr.addColorStop(1, "#F7F7F7"); g.fillStyle = gr; g.fillRect(0, 0, s, s); const r = rnd(8); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .04})`; g.fillRect(r() * s, r() * s, 3 + r() * 10, 3 + r() * 10); } },
    wood: (g, s) => { g.fillStyle = "#EEEEEE"; g.fillRect(0, 0, s, s); const r = rnd(13); for (let i = 0; i < 70; i++) { const y = r() * s; g.strokeStyle = `rgba(60,30,10,${.06 + r() * .16})`; g.lineWidth = .5 + r() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x / s * 12.56 + i) * 3 * r()); g.stroke(); } },
    marble: (g, s) => { g.fillStyle = "#F7F7F6"; g.fillRect(0, 0, s, s); const r = rnd(31); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,125,135,${r() * .05})`; g.beginPath(); g.arc(r() * s, r() * s, 10 + r() * 40, 0, 6.28); g.fill(); } for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(90,95,105,${.12 + r() * .25})`; g.lineWidth = .6 + r() * 2.2; g.beginPath(); let x = r() * s, y = 0; g.moveTo(x, y); while (y < s) { x += (r() - .5) * 38; y += 10 + r() * 14; g.lineTo(x, y); } g.stroke(); } },
    concrete: (g, s) => { g.fillStyle = "#EAEAEA"; g.fillRect(0, 0, s, s); const r = rnd(17); for (let i = 0; i < 5000; i++) { g.fillStyle = r() > .5 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.12)"; const z = 1 + r() * 4; g.fillRect(r() * s, r() * s, z, z); } }
  }[key];
  return canvasTex("mat-" + key, 256, draw, { linen: 3, boucle: 3, velvet: 2, wood: 1, marble: 1, concrete: 2 }[key]);
}
function photoTex(id) { const P = PHOTOS[id]; if (!P) return null; if (!P.tex) { const t = new THREE.CanvasTexture(P.canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; P.tex = t; } return P.tex; }
function loadPhoto(file, cb, fail) {
  if (!file || !/^image\//.test(file.type) || file.size > 20e6) { fail(); return; }
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => { const k = Math.min(1, 512 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    const d = g.getImageData(0, 0, c.width, c.height).data; let R = 0, G = 0, B = 0, n = 0; for (let i = 0; i < d.length; i += 64) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
    const avg = "#" + [R, G, B].map(v => Math.round(v / n).toString(16).padStart(2, "0")).join(""); const id = "ph" + (++photoN); PHOTOS[id] = { canvas: c, url: c.toDataURL("image/jpeg", .8), avg, ar: c.height / c.width }; cb(id); };
  img.onerror = () => { URL.revokeObjectURL(url); fail(); }; img.src = url;
}

/* ---------- фото → силуэт: убираем однотонный фон.
   у карточек магазинов он почти всегда белый, так что заливки от рамки хватает. Никаких нейросетей. ---------- */
function cutPhoto(id) {
  const P = PHOTOS[id]; if (!P) return null; if (P.cut !== undefined) return P.cut;
  const src = P.canvas, w = src.width, h = src.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  g.drawImage(src, 0, 0); const im = g.getImageData(0, 0, w, h), d = im.data;
  const bs = []; for (let x = 0; x < w; x += 2) { bs.push((x) * 4); bs.push(((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y += 2) { bs.push((y * w) * 4); bs.push((y * w + w - 1) * 4); }
  const med = ch => { const a = bs.map(i => d[i + ch]).sort((p, q) => p - q); return a[a.length >> 1]; };
  const rf = [med(0), med(1), med(2)];
  const dist = i => Math.max(Math.abs(d[i] - rf[0]), Math.abs(d[i + 1] - rf[1]), Math.abs(d[i + 2] - rf[2]));
  const TOL = 30;
  if (bs.filter(i => dist(i) <= TOL).length / bs.length < .72) { P.cut = null; return null; } // фон неоднородный — резать нечему
  const mask = new Uint8Array(w * h), st = [];
  const push = (x, y) => { const k = y * w + x; if (mask[k] || dist(k * 4) > TOL) return; mask[k] = 1; st.push(k); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const k = st.pop(), x = k % w, y = (k - x) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  const halo = []; // снимаем светлую кайму по контуру
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const k = y * w + x; if (mask[k]) continue;
    if (mask[k - 1] || mask[k + 1] || mask[k - w] || mask[k + w]) halo.push(k); }
  for (const k of halo) if (dist(k * 4) < TOL * 1.9) mask[k] = 1;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x;
    if (mask[k]) d[k * 4 + 3] = 0; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  if (x1 < x0 || tw < 16 || th < 16 || tw * th < w * h * .02) { P.cut = null; return null; }
  g.putImageData(im, 0, 0);
  const t = document.createElement("canvas"); t.width = tw; t.height = th;
  t.getContext("2d").drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  P.cut = { canvas: t, ar: th / tw, url: t.toDataURL("image/png") }; return P.cut;
}
function cutTex(id) { const C = cutPhoto(id); if (!C) return null; if (!C.tex) { const t = new THREE.CanvasTexture(C.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; C.tex = t; } return C.tex; }
function canCut(id) { return !!cutPhoto(id); }

function photoPlane(tex, w, h, alpha) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: .62, metalness: 0, side: THREE.DoubleSide, transparent: !!alpha, alphaTest: alpha ? .4 : 0 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.02, w), Math.max(.02, h)), m);
  o.castShadow = !!alpha; o.receiveShadow = false; o.userData.skin = 1; return o;
}
let shTex = null;
function contactShadow(w, d) {
  if (!shTex) { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.4)"); gr.addColorStop(.5, "rgba(0,0,0,.18)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); shTex = new THREE.CanvasTexture(c); }
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, d * 1.08), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
  o.rotation.x = -Math.PI / 2; o.position.y = .005; o.userData.skin = 1; return o;
}
/* надеваем фото на нашу модель */
function skinMine(g, p, it, room) {
  const a = ARC[p.ar]; const ph = PHOTOS[p.img]; if (!a || !ph) return;
  const H = p.h || a.h;
  if (p.mode === "cut") {
    const C = cutPhoto(p.img); const tex = (C && cutTex(p.img)) || photoTex(p.img); if (!tex) return;
    const ar = C ? C.ar : (ph.ar || 1), al = !!C;
    /* от нашей модели оставляем только свет: в силуэте полигоны модели не нужны */
    g.updateMatrixWorld(true); const keep = [];
    g.traverse(o => { if (o.isLight) keep.push([o, g.worldToLocal(o.getWorldPosition(new THREE.Vector3()))]); });
    for (const c of [...g.children]) g.remove(c);
    for (const [L, pos] of keep) { L.position.copy(pos); g.add(L); }
    if (p.wall) { const o = photoPlane(tex, p.w, p.w * ar, al); o.position.set(0, 1.5, .04); g.add(o); return; }
    if (p.flat) { const o = photoPlane(tex, p.w, p.d, al); o.rotation.x = -Math.PI / 2; o.position.y = .016; g.add(o); return; }
    if (p.ceil) { const hh = p.w * ar, y = (room ? room.H : 2.7) - .45 - hh / 2; const o = photoPlane(tex, p.w, hh, al); o.position.y = y; g.add(o); return; }
    const hh = H, w = H / ar; // в силуэте пропорции задаёт фото: высота от пользователя, ширина из неё
    for (let i = 0; i < (a.cross ? 2 : 1); i++) { const o = photoPlane(tex, w, hh, al); o.position.y = hh / 2; o.rotation.y = i * Math.PI / 2; g.add(o); }
    if (!p.small) g.add(contactShadow(w, Math.min(p.d, w)));
    return;
  }
  const tex = photoTex(p.img); if (!tex) return;
  if (p.flat) { const o = photoPlane(tex, p.w, p.d, false); o.rotation.x = -Math.PI / 2; o.position.y = (p.th || .012) + .004; g.add(o); return; }
  if (a.k === "art") return; // рамка сама берёт фото через it.img
  const bb = new THREE.Box3().setFromObject(g); if (!(bb.max.x > bb.min.x)) return;
  const fw = (bb.max.x - bb.min.x) - .05, fh = (bb.max.y - bb.min.y) - .07;
  if (fw <= .05 || fh <= .05) return;
  const ar = ph.ar || 1; let pw = fw, pht = fw * ar; if (pht > fh) { pht = fh; pw = fh / ar; }
  const o = photoPlane(tex, pw, pht, false);
  o.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z + .005); g.add(o);
}
function skinWrap(inner, p, it, room) {
  if (p.hs && Math.abs(p.hs - 1) > .01) { const w = new THREE.Group(); inner.scale.y = p.hs; w.add(inner); skinMine(w, p, it, room); return w; }
  skinMine(inner, p, it, room); return inner;
}

/* ---------- своя библиотека ---------- */
const MY = []; const MYKEY = "room.my.v1"; const MYMAX = 120;
/* память: IndexedDB (сотни МБ вместо 5 МБ у localStorage), localStorage остаётся запасным путём и источником для переезда */
const KV = (() => { let db = null;
  const open = () => db || (db = new Promise((res, rej) => { try { const q = indexedDB.open("room-kv", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }));
  const run = (mode, f) => open().then(d => new Promise((res, rej) => { const t = d.transaction("kv", mode), st = t.objectStore("kv"); let out; const r = f(st); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error); }));
  return { get: k => run("readonly", st => st.get(k)), set: (k, v) => run("readwrite", st => st.put(v, k)), del: k => run("readwrite", st => st.delete(k)) };
})();
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}
async function kvLoad(key) { try { const v = await KV.get(key); if (Array.isArray(v)) return v; } catch (_) {}
  try { const a = JSON.parse(localStorage.getItem(key) || "[]"); if (!Array.isArray(a)) return [];
    if (a.length) { try { await KV.set(key, a); localStorage.removeItem(key); } catch (_) {} } /* переезд из старой памяти, старую копию убираем, чтобы удалённое не воскресало */
    return a; } catch (_) { return []; } }
function myProd(o) {
  const a = ARC[o.ar], ph = PHOTOS[o.img];
  const p = { id: o.id, n: o.n || a.n, cat: a.cat, b: a.b, store: "my", price: o.price || 0, w: o.w, d: o.d,
    vars: [[(ph && ph.avg) || "#CFCAC2", "С фото"]], ...a.ex, mine: 1, ar: o.ar, img: o.img, mode: o.mode || a.mode };
  if (a.hv === "s") { p.h = o.h; p.hs = o.h / a.h0; } else if (a.hv !== "a") p.h = o.h;
  if (a.top) p.top = o.h;
  /* в силуэте пропорции диктует фото, а не ползунки: пересчитываем габариты, иначе след на полу разойдётся с картинкой */
  if (p.mode === "cut") { const C = cutPhoto(o.img);
    if (C) { if (p.wall || p.ceil) p.h = r05(p.w * C.ar); else if (!p.flat) { const w = r05(o.h / C.ar); p.w = w; p.d = w; p.h = o.h; } } }
  return p;
}
const myList = () => MY.map(o => PROD[o.id]).filter(Boolean);
const allProd = () => CATALOG.concat(myList());
function addMine(o) {
  const p = myProd(o); MY.unshift(o); PROD[p.id] = p;
  const C = p.mode === "cut" && cutPhoto(p.img);
  const u = (C || PHOTOS[p.img] || {}).url || ""; S.thumbs[p.id] = u; S.thumbs[p.id + ":0"] = u;
  while (MY.length > MYMAX) { const old = MY.pop(); delete PROD[old.id]; }
  saveMine(); return p;
}
function dropMine(id) {
  const i = MY.findIndex(o => o.id === id); if (i < 0) return; MY.splice(i, 1); delete PROD[id];
  for (const r of S.rooms) { r.items = r.items.filter(x => x.p !== id); for (const x of r.items) if (x.in) x.in = x.in.filter(o => o.p !== id); }
  saveMine();
}
function saveMine() {
  KV.set(MYKEY, MY.map(o => ({ ...o, u: (PHOTOS[o.img] || {}).url }))).catch(() => toast("Не хватило места в памяти. Удали что-нибудь из своих вещей"));
}
const ROOMKEY = "room.rooms.v1"; let saveT = 0;
function roomPack(withSnap) {
  return S.rooms.map(r => { const ph = {};
    const items = r.items.map(it => { const c = JSON.parse(JSON.stringify(it)); const p = PROD[it.p];
      for (const k of ["img", "mat"]) { const v = c[k]; if (!isPh(v)) continue;
        if (k === "img" && p && p.mine && v === p.img) { delete c.img; continue; }
        if (PHOTOS[v] && PHOTOS[v].url) ph[v] = PHOTOS[v].url; else delete c[k]; }
      return c; });
    const o = { ...r, items, ph }; if (!withSnap) o.snap = null; delete o.sel; return o; });
}
function saveRooms() {
  if (!S.rooms.length) { KV.del(ROOMKEY).catch(() => {}); return; }
  KV.set(ROOMKEY, roomPack(true)).catch(() => toast("Не хватило места в памяти, комнаты не сохранились"));
}
function queueSave() { clearTimeout(saveT); saveT = setTimeout(saveRooms, 500); }
function flushSave() { if (saveT) { try { if (S.room && S.screen !== "home" && !S.walk) snap(); } catch (_) {} clearTimeout(saveT); saveT = 0; saveRooms(); } }
addEventListener("pagehide", flushSave); document.addEventListener("visibilitychange", () => { if (document.hidden) flushSave(); });
async function loadRooms() {
  const arr = await kvLoad(ROOMKEY);
  for (const o of arr.slice(0, 60)) {
    if (!o || !Array.isArray(o.pts) || o.pts.length < 3 || !Array.isArray(o.items) || !Array.isArray(o.openings)) continue;
    const map = {}; const ph = o.ph && typeof o.ph === "object" ? o.ph : {};
    for (const k of Object.keys(ph)) { if (typeof ph[k] === "string" && ph[k].startsWith("data:image/")) { const id = await restorePhoto(ph[k]); if (id) map[k] = id; } }
    o.items = o.items.filter(it => it && PROD[it.p]);
    for (const it of o.items) { const p = PROD[it.p];
      for (const k of ["img", "mat"]) if (isPh(it[k])) { if (map[it[k]]) it[k] = map[it[k]]; else it[k] = null; }
      if (p.mine && p.ar === "art" && !it.img) it.img = p.img; }
    delete o.ph; S.rooms.push(newRoom(o)); }
}
function restorePhoto(url) {
  return new Promise(res => { const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let R = 0, G = 0, B = 0, n = 0; for (let i = 0; i < d.length; i += 64) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
      const avg = "#" + [R, G, B].map(v => Math.round(v / n).toString(16).padStart(2, "0")).join("");
      const id = "ph" + (++photoN); PHOTOS[id] = { canvas: c, url, avg, ar: c.height / c.width }; res(id); };
    im.onerror = () => res(null); im.src = url; });
}
async function loadMine() {
  const arr = await kvLoad(MYKEY);
  for (const o of arr.slice(0, MYMAX).reverse()) {
    if (!o || !ARC[o.ar] || !o.u || typeof o.u !== "string" || !o.u.startsWith("data:image/")) continue;
    const img = await restorePhoto(o.u); if (!img) continue;
    const rec = { id: o.id || nid(), n: o.n, ar: o.ar, w: +o.w || ARC[o.ar].w, d: +o.d || ARC[o.ar].d, h: +o.h || ARC[o.ar].h, mode: o.mode, price: +o.price || 0, img };
    const p = myProd(rec); MY.unshift(rec); PROD[p.id] = p;
    const C = p.mode === "cut" && cutPhoto(img); const u = (C || PHOTOS[img]).url;
    S.thumbs[p.id] = u; S.thumbs[p.id + ":0"] = u;
  }
}
function itemBase(it) { const p = PROD[it.p]; if (isPh(it.mat) && PHOTOS[it.mat]) return PHOTOS[it.mat].avg; return it.col || p.vars[it.v || 0][0]; }
function applyMat(g, it, p, base) {
  if (!it.mat || it.mat === "none") return; const photo = isPh(it.mat); const tex = photo ? photoTex(it.mat) : matTex(it.mat); if (!tex) return;
  const keys = new Set([new THREE.Color(base).getHex(), new THREE.Color(shadeHex(base, .9)).getHex()]); if (p.b === "rug") keys.add(0xffffff);
  g.traverse(o => { if (o.isMesh && !o.userData.skin && o.material && !Array.isArray(o.material) && o.material.color && keys.has(o.material.color.getHex())) { const m = o.material.clone(); m.map = tex; if (photo) m.color.set("#ffffff"); m.needsUpdate = true; o.material = m; } });
}
function colorName(it) {
  if (isPh(it.mat)) return "Своё фото";
  const m = it.mat && it.mat !== "none" ? (MATS.find(x => x[0] === it.mat) || [])[1] : "";
  const c = it.col ? ((PAL.find(x => x[0].toLowerCase() === it.col.toLowerCase()) || [])[1] || "Свой цвет") : PROD[it.p].vars[it.v || 0][1];
  return m ? c + " · " + m.toLowerCase() : c;
}

/* проёмы: размеры, пределы, модель ползунков */
const OPD = { window: { w: [.4, 3], h: [.4, 2.2], def: { w: 1.4, h: 1.4, sill: .9 } }, door: { w: [.6, 1.5], h: [1.8, 2.6], def: { w: .9, h: 2.2 } }, balcony: { w: [.6, 2.2], h: [1.8, 2.6], def: { w: .8, h: 2.2 } }, radiator: { w: [.3, 2.4], def: { w: 1 } } };
const oH = o => o.h ?? OPD[o.type].def.h;
const oSill = o => o.type === "window" ? (o.sill ?? .9) : 0;
function opLimits(r, o) {
  const L = edges(r)[o.wall].len; if (o.type === "radiator") return { lo: .05, hi: L - .05, L };
  let lo = .05, hi = L - .05; for (const x of r.openings) { if (x === o || x.wall !== o.wall || x.type === "radiator") continue; if (x.pos <= o.pos) lo = Math.max(lo, x.pos + x.w / 2); else hi = Math.min(hi, x.pos - x.w / 2); } return { lo, hi, L };
}
function setOp(r, o, key, val) {
  const lim = opLimits(r, o), D = OPD[o.type], H = r.H;
  if (key === "w") o.w = r05(clamp(val, D.w[0], Math.min(D.w[1], lim.hi - lim.lo)));
  else if (key === "pos") o.pos = r05(val);
  else if (key === "h") o.h = r05(clamp(val, D.h[0], Math.min(D.h[1], H - .1 - oSill(o))));
  else if (key === "sill") { o.sill = r05(clamp(val, .1, Math.min(1.6, H - .1 - D.h[0]))); if (oSill(o) + oH(o) > H - .1) o.h = r05(H - .1 - oSill(o)); }
  o.pos = clamp(o.pos, lim.lo + o.w / 2, lim.hi - o.w / 2);
}
function opModel(r, o) {
  const D = OPD[o.type], lim = opLimits(r, o), H = r.H, sill = oSill(o);
  const m = [["w", "Ширина", D.w[0], Math.min(D.w[1], lim.hi - lim.lo), o.w], ["pos", "Сдвиг по стене", lim.lo + o.w / 2, lim.hi - o.w / 2, o.pos]];
  if (o.type !== "radiator") m.push(["h", "Высота", D.h[0], Math.min(D.h[1], H - .1 - sill), oH(o)]);
  if (o.type === "window") m.push(["sill", "От пола", .1, Math.min(1.6, H - .1 - D.h[0]), sill]);
  return m;
}
const pct = (v, mn, mx) => mx > mn ? Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)) : 100;

/* ================= рендер 3D ================= */
const host = $("#gl");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environment = envTex;
const camera = new THREE.PerspectiveCamera(32, 1, .05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false; controls.minPolarAngle = .01; controls.maxPolarAngle = 1.5; controls.rotateSpeed = .9;
const hemi = new THREE.HemisphereLight("#FFFFFF", "#B8A58C", 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight("#FFE9CC", 3.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; sun.shadow.radius = 4;
const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = .5; sc.far = 30; scene.add(sun); scene.add(sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .18 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.161; ground.receiveShadow = true; scene.add(ground);
let roomG = new THREE.Group(), itemsG = new THREE.Group(); scene.add(roomG, itemsG);
const selRing = new THREE.Mesh(new THREE.RingGeometry(.5, .54, 64), new THREE.MeshBasicMaterial({ color: "#3D8BFF", transparent: true, opacity: .9, depthWrite: false })); selRing.rotation.x = -Math.PI / 2; selRing.visible = false; scene.add(selRing);
let walls = [], ceil = null;
const DAYBG = new THREE.Color("#E9E5DF"), NIGHTBG = new THREE.Color("#25262C");

/* вещи на подоконнике */
function sillItems(og, room, o, cx, y0, w, s) {
  const list = o.in || []; if (!list.length) return; const bb = new THREE.Box3(), sz = new THREE.Vector3();
  list.forEach((q, i) => { const sp = PROD[q.p]; if (!sp) return; let sub; try { sub = BUILD[sp.b](sp, q.col || sp.vars[q.v || 0][0], room); } catch (_) { return; }
    bb.setFromObject(sub); bb.getSize(sz); if (!(sz.x > 0)) return;
    const slot = (w - .04) / list.length;
    const sc = Math.min(slot / sz.x, .5 / Math.max(sz.y, .001), .19 / Math.max(sz.z, .001), 1);
    sub.scale.setScalar(sc); sub.position.set(cx - w / 2 + slot * (i + .5) + .02, y0 - bb.min.y * sc, s * .085);
    sub.rotation.y = s > 0 ? 0 : Math.PI; og.add(sub); });
}
function buildRoom(r) {
  scene.remove(roomG); roomG = new THREE.Group(); scene.add(roomG); walls = [];
  const H = r.H, T = .14, f = FLOORS.find(x => x.id === r.floor) || FLOORS[0];
  const shape = new THREE.Shape(r.pts.map(p => new THREE.Vector2(p[0], -p[1])));
  const fg = new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: false });
  const ft = floorTex(f).clone(); ft.needsUpdate = true; ft.repeat.set(.5, .5); ft.rotation = 0;
  const floor = new THREE.Mesh(fg, [M("#ffffff", f.kind === "tile" ? .35 : .55, 0, { map: ft }), M(shadeHex(f.base, .8), .8)]); floor.rotation.x = -Math.PI / 2; floor.position.y = -.16; floor.receiveShadow = true; floor.userData.floor = 1; roomG.add(floor);
  ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), M("#F7F5F1", .95, 0, { side: THREE.DoubleSide })); ceil.rotation.x = -Math.PI / 2; ceil.position.y = H; ceil.visible = walk.on; roomG.add(ceil);
  const E = edges(r);
  for (const e of E) {
    const col = r.wallColors[e.i] || r.wallDefault;
    const wm = new THREE.MeshStandardMaterial({ color: col, roughness: .92 }), capm = new THREE.MeshStandardMaterial({ color: shadeHex(col, 1.06), roughness: .9 });
    const g = new THREE.Group(); const full = new THREE.Group(); const stub = new THREE.Group(); g.add(full, stub);
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    g.position.set(mid[0] - e.n[0] * T / 2, 0, mid[1] - e.n[1] * T / 2); g.rotation.y = Math.atan2(-e.d[1], e.d[0]);
    const s = (Math.sin(g.rotation.y) * e.n[0] + Math.cos(g.rotation.y) * e.n[1]) > 0 ? 1 : -1; // знак внутренней стороны по локальной z
    const L = e.len, ext = T;
    const box = (x0, x1, y0, y1, grp, mat = wm) => { if (x1 - x0 < .005 || y1 - y0 < .005) return; const m = mesh(BX(x1 - x0, y1 - y0, T), mat, (x0 + x1) / 2 - L / 2, (y0 + y1) / 2, 0); grp.add(m); return m; };
    const ops = r.openings.filter(o => o.wall === e.i && o.type !== "radiator").sort((a, b) => a.pos - b.pos);
    let cur = -ext;
    for (const o of ops) {
      const y0 = o.type === "window" ? oSill(o) : 0, y1 = Math.min(y0 + oH(o), H - .05);
      const x0 = Math.max(cur, o.pos - o.w / 2), x1 = Math.min(L, o.pos + o.w / 2);
      box(cur, x0, 0, H, full); box(x0, x1, 0, y0, full); box(x0, x1, y1, H, full); cur = x1;
      // рама, стекло или полотно: всё в одной группе, чтобы проём можно было выбрать тапом
      const og = new THREE.Group(); const sel = S.screen === "step2" && S.selOpen === o.id;
      const FRC = r.opColor || "#FAFAF8", DRC = r.doorColor || "#F4F1EC";
      const fr = sel ? hiMat(FRC) : M(FRC, .4); const cx = (x0 + x1) / 2 - L / 2, w = x1 - x0, h = y1 - y0, cy = (y0 + y1) / 2; const fz = s * (T / 2 - .03);
      for (const [px, py, pw, ph] of [[cx, y0 + .025, w, .05], [cx, y1 - .025, w, .05], [cx - w / 2 + .025, cy, .05, h], [cx + w / 2 - .025, cy, .05, h]]) og.add(mesh(BX(pw, ph, .06), fr, px, py, fz));
      if (o.type === "window") { og.add(mesh(BX(.04, h, .05), fr, cx, cy, fz)); const gl = new THREE.Mesh(BX(w - .1, h - .1, .01), new THREE.MeshPhysicalMaterial({ color: "#CFE3F7", roughness: .05, metalness: 0, transparent: true, opacity: .25 })); gl.position.set(cx, cy, fz); og.add(gl); og.add(mesh(BX(w + .1, .04, .22), M(FRC, .4), cx, y0 - .02, s * .06)); sillItems(og, r, o, cx, y0, w, s); }
      else if (o.type === "balcony") { const gl = new THREE.Mesh(BX(w - .1, h - .1, .01), new THREE.MeshPhysicalMaterial({ color: "#CFE3F7", roughness: .05, transparent: true, opacity: .3 })); gl.position.set(cx, cy, fz); og.add(gl); }
      else { const leaf = new THREE.Group(); leaf.position.set(cx - w / 2 + .05, 0, s * (T / 2)); const pnl = mesh(RB(w - .1, h - .05, .04, .01), sel ? hiMat(DRC) : M(DRC, .5), (w - .1) / 2, (h - .05) / 2, s * .02); leaf.add(pnl); leaf.add(mesh(CY(.01, .01, .14, 8), M("#C9A86A", .3, .8), w - .2, 1.0, s * .06).rotateZ(Math.PI / 2)); leaf.rotation.y = -s * .5; og.add(leaf); }
      og.traverse(m => { m.userData.open = o.id; }); full.add(og);
    }
    box(cur, L + ext, 0, H, full);
    full.add(mesh(BX(L + ext * 2, .02, T + .002), capm, 0, H + .01, 0));
    full.add(mesh(BX(L, .07, .015), M("#FFFFFF", .5), 0, .035, s * (T / 2 + .007)));
    box(-ext, L + ext, 0, .18, stub);
    stub.add(mesh(BX(L + ext * 2, .012, T + .002), capm, 0, .186, 0));
    for (const o of r.openings.filter(o => o.wall === e.i && o.type === "radiator")) { const rd = BUILD.radiator(o.w, S.screen === "step2" && S.selOpen === o.id); rd.position.set(o.pos - L / 2, 0, s * T / 2); if (s < 0) rd.rotation.y = Math.PI; rd.traverse(m => { m.userData.open = o.id; }); full.add(rd); }
    stub.visible = false; g.userData = { e, full, stub, mats: [wm, capm], ghost: false };
    g.traverse(o => { if (o.isMesh) o.userData.wall = e.i; });
    roomG.add(g); walls.push(g);
  }
  // свет из окна
  const [cx, cz, sx, sz] = center(r); const wnd = r.openings.find(o => o.type === "window" || o.type === "balcony");
  let dir = [-1, -.6]; if (wnd) { const e = E[wnd.wall]; if (e) dir = [-e.n[0], -e.n[1]]; }
  sun.position.set(cx + dir[0] * 6, 7, cz + dir[1] * 6 + 2); sun.target.position.set(cx, 0, cz);
  applyLighting(r);
}
const builtItems = {};
function buildItems(r) {
  scene.remove(itemsG); itemsG = new THREE.Group(); scene.add(itemsG); adaptAll(r);
  for (const it of r.items) { const p0 = PROD[it.p]; if (!p0) continue; const p = (it.w || it.d || it.h) ? { ...p0, w: it.w || p0.w, d: it.d || p0.d, h: it.h || p0.h } : p0; const base = itemBase(it);
    let g = BUILD[p.b](p, base, r, it); if (p.mine) g = skinWrap(g, p, it, r); applyMat(g, it, p, base);
    buildInside(g, p, it, r); g.userData.item = it.id; g.traverse(o => { if (o.isMesh) o.userData.item = it.id; });
    placeObj(g, it, r); itemsG.add(g); builtItems[it.id] = g; }
  applyLighting(r); updateSel();
}
function placeObj(g, it, r) { const p = PROD[it.p]; let y = 0;
  if (it.on && r) { const h = r.items.find(i => i.id === it.on); if (h) y = topY(h); else it.on = null; }
  g.position.set(it.x, y, it.z); g.rotation.y = p.wall ? (it.ry || 0) : -(it.rot || 0) * Math.PI / 2; }
function applyLighting(r) {
  const night = !!r.night; scene.background = night ? NIGHTBG : DAYBG;
  hemi.intensity = night ? .1 : .55; sun.intensity = night ? 0 : 3.4; scene.environmentIntensity = night ? .06 : .38; renderer.toneMappingExposure = night ? 1.3 : .95; if (ceil) ceil.visible = walk.on;
  ground.material.opacity = night ? .35 : .18;
  let shadowsLeft = 2;
  itemsG.traverse(o => { if (o.isPointLight) { o.intensity = night ? o.userData.power : 0; o.castShadow = night && shadowsLeft-- > 0; if (o.castShadow) { o.shadow.mapSize.set(512, 512); o.shadow.bias = -.002; o.shadow.radius = 6; } }
    if (o.isMesh && o.userData.shade) { o.material.emissiveIntensity = night ? 2.2 : .15; } });
}
function frame(r, opts = {}) {
  const [cx, cz, sx, sz] = center(r); const span = Math.max(sx, sz, r.H * 1.2);
  controls.target.set(cx, r.H * .32, cz); const dist = (span * 3.4 + 2.4) * (opts.top ? 1.45 : 1); const pol = opts.top ? .14 : 1.0, az = opts.az ?? -Math.PI / 4;
  camera.position.set(cx + dist * Math.sin(pol) * Math.sin(az), r.H * .32 + dist * Math.cos(pol), cz + dist * Math.sin(pol) * Math.cos(az));
  controls.minDistance = span * .45; controls.maxDistance = span * 11 + 8; controls.update();
}
/* подлететь к открытому шкафу, чтобы видеть полки */
function focusItem(r, it) {
  const p = PROD[it.p]; const h = p.h || 1.2; const ang = -(it.rot || 0) * Math.PI / 2;
  const fx = Math.sin(ang), fz = Math.cos(ang); const dist = Math.max(p.w, h) * 2.4 + 1.3;
  controls.target.set(it.x + fx * .1, h * .52, it.z + fz * .1);
  camera.position.set(it.x + fx * dist, h * .62 + dist * .3, it.z + fz * dist);
  controls.minDistance = .6; controls.maxDistance = 40; controls.update();
}
let viewOffset = 0;
function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; if (viewOffset) camera.setViewOffset(w, h, 0, viewOffset, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(host);
function setOffset(sheetH) { const v = Math.round((sheetH || 0) / 2 - 30); if (v !== viewOffset) { viewOffset = v; resize(); } }

/* прогулка */
const walk = { on: false, yaw: 0, pitch: 0, mv: [0, 0], keys: {}, fov: 108, eye: 1.6, goto: null };
const EYES = [[1.6, "стоя"], [1.1, "сидя"], [2.2, "с высоты, смотришь вниз"]];
const goRing = new THREE.Mesh(new THREE.RingGeometry(.1, .15, 32), new THREE.MeshBasicMaterial({ color: "#3D8BFF", transparent: true, opacity: .9, depthWrite: false })); goRing.rotation.x = -Math.PI / 2; goRing.visible = false; scene.add(goRing);
function canStand(r, x, z) {
  const m = .2; for (const [dx, dz] of [[m, 0], [-m, 0], [0, m], [0, -m]]) if (!inside(r.pts, x + dx, z + dz)) return false;
  for (const it of r.items) { const p = PROD[it.p]; if (p.flat || p.wall || p.ceil || it.on) continue; const f = foot(it); if (Math.abs(x - it.x) < f.w / 2 + .12 && Math.abs(z - it.z) < f.d / 2 + .12) return false; }
  return true; }
function setFov(v) { walk.fov = clamp(v, 55, 140); camera.fov = walk.fov; camera.updateProjectionMatrix(); }
/* отдалить или приблизить орбиту */
function zoomBy(k) { const v = camera.position.clone().sub(controls.target); const len = clamp(v.length() * k, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(v.setLength(len)); controls.update(); render(); }
function startWalk() {
  const r = S.room; const [cx, cz] = center(r); walk.on = true; controls.enabled = false; camAnim.on = false; viewOffset = 0; camera.clearViewOffset();
  walk.eye = EYES[0][0]; walk.goto = null; walk.pitch = -.05; walk.mv = [0, 0]; setFov(walk.fov);
  // старт: в дальнем углу, лицом к центру — комната видна целиком, а не в упор
  let best = null; for (const [x, z] of r.pts) { const d = Math.hypot(x - cx, z - cz); if (!best || d > best.d) best = { d, x, z }; } let px = best.x, pz = best.z;
  for (let k = 0; k <= 10 && !canStand(r, px, pz); k++) { px += (cx - px) * .15; pz += (cz - pz) * .15; }
  walk.yaw = Math.atan2(-(cx - px), -(cz - pz));
  camera.position.set(px, walk.eye, pz); if (ceil) ceil.visible = true; updateWalls(true); }
function stopWalk() { walk.on = false; walk.goto = null; goRing.visible = false; walk.mv = [0, 0]; if (ceil) ceil.visible = false; controls.enabled = true; camera.fov = 32; camera.updateProjectionMatrix(); frame(S.room); }

/* ================= камера: поворот на 90°, режимы стен ================= */
const camAnim = { on: false, from: 0, to: 0, t0: 0, dur: 380, r: 1, y: 0 };
const clock = new THREE.Clock(); const tmp = new THREE.Vector3();
function curAz() { const v = camera.position.clone().sub(controls.target); return Math.atan2(v.x, v.z); }
function orbitBy(d) { const v = camera.position.clone().sub(controls.target); Object.assign(camAnim, { on: true, from: Math.atan2(v.x, v.z), to: Math.atan2(v.x, v.z) + d, t0: performance.now(), r: Math.hypot(v.x, v.z), y: v.y }); }
// если стена, на которую повесили предмет, сейчас убрана или смотрит спиной — разворачиваем камеру так, чтобы её было видно
function focusWall(i) {
  if (!S.room || walk.on || S.wallMode === "ghost") return; const e = edges(S.room)[i]; if (!e) return;
  const [cx, cz] = center(S.room); const v = camera.position; const len = Math.hypot(v.x - cx, v.z - cz) || 1; const dot = (e.n[0] * (v.x - cx) + e.n[1] * (v.z - cz)) / len; if (dot > .35) return;
  let d = Math.atan2(e.n[0], e.n[1]) - curAz(); d = Math.atan2(Math.sin(d), Math.cos(d)); orbitBy(d); }
function setGhost(w, on) {
  if (w.userData.ghost === on) return; w.userData.ghost = on; const ms = [...w.userData.mats]; w.traverse(o => { if (o.userData.hiMat) ms.push(o.userData.hiMat); if (o.isMesh) o.castShadow = !on; });
  for (const m of ms) { m.transparent = on; m.opacity = on ? .14 : 1; m.depthWrite = !on; m.needsUpdate = true; } }
function updateWalls(forceUp) {
  const r = S.room; if (!r || !walls.length) return; const mode = forceUp ? "up" : (S.wallMode || "auto");
  const [cx, cz] = center(r); tmp.set(camera.position.x - cx, 0, camera.position.z - cz).normalize();
  for (const w of walls) { const n = w.userData.e.n; const near = (n[0] * tmp.x + n[1] * tmp.z) < -.25; let full = true, stub = false, ghost = false;
    if (mode === "auto") { full = !near; stub = near; } else if (mode === "ghost") ghost = near; else if (mode === "down") { full = false; stub = true; }
    w.userData.full.visible = full; w.userData.stub.visible = stub; setGhost(w, ghost); }
  for (const it of r.items) { if (!PROD[it.p].wall) continue; const g = builtItems[it.id], w = walls[it.wallIdx]; if (g && w) g.visible = !w.userData.stub.visible; } }

/* ================= цикл ================= */
function tick() {
  requestAnimationFrame(tick); const dt = Math.min(.05, clock.getDelta());
  if (walk.on) {
    const k = walk.keys; const f = clamp(walk.mv[1] + ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0), -1, 1), s = clamp(walk.mv[0] + ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0), -1, 1);
    const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw); let mx = 0, mz = 0;
    if (Math.abs(f) + Math.abs(s) > .01) { walk.goto = null; const sp = 1.7 * dt; mx = (fx * f + -fz * s) * sp; mz = (fz * f + fx * s) * sp; }
    else if (walk.goto) { const dx = walk.goto.x - camera.position.x, dz = walk.goto.z - camera.position.z; const d = Math.hypot(dx, dz); if (d < .06) walk.goto = null; else { const sp = Math.min(d, 2.2 * dt); mx = dx / d * sp; mz = dz / d * sp; } }
    if (mx || mz) { const px = camera.position.x, pz = camera.position.z;
      if (canStand(S.room, px + mx, pz + mz)) { camera.position.x += mx; camera.position.z += mz; } else if (canStand(S.room, px + mx, pz)) camera.position.x += mx; else if (canStand(S.room, px, pz + mz)) camera.position.z += mz; else walk.goto = null; }
    camera.position.y += (walk.eye - camera.position.y) * Math.min(1, dt * 8);
    camera.rotation.set(0, 0, 0); camera.rotation.order = "YXZ"; camera.rotation.y = walk.yaw; camera.rotation.x = walk.pitch;
    if (walk.goto) { goRing.visible = true; goRing.position.set(walk.goto.x, .02, walk.goto.z); goRing.material.opacity = .5 + Math.sin(performance.now() / 200) * .4; } else goRing.visible = false;
  } else {
    if (camAnim.on) { const k = Math.min(1, (performance.now() - camAnim.t0) / camAnim.dur); const th = camAnim.from + (camAnim.to - camAnim.from) * (1 - Math.pow(1 - k, 3)); const t = controls.target; camera.position.set(t.x + camAnim.r * Math.sin(th), t.y + camAnim.y, t.z + camAnim.r * Math.cos(th)); if (k >= 1) camAnim.on = false; }
    controls.update(); updateWalls();
  }
  if (selRing.visible) selRing.material.opacity = .6 + Math.sin(performance.now() / 300) * .3;
  renderer.render(scene, camera); posHot();
}

/* ================= состояние UI ================= */
const S = { onb: null, make: null, full: false, open: null, openSill: null, slot: "0", plans: false, wallMode: "auto", wmenu: false, edit: false, screen: "home", rooms: [], room: null, sub: false, selWall: 0, selOpen: null, sel: null, paint: "walls", paintWall: "all", modal: null, toast: null, collapsed: false, lib: "База", store: "all", q: "", draw: null, thumbs: {}, snaps: {} };
const STEPS = ["", "step1", "step2", "step3", "step4", "step5"];
const stepNo = () => STEPS.indexOf(S.screen);

/* иконки */
const I = { x: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M5 12h14M13 6l6 6-6 6"/>', rot: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>', check: '<path d="M5 12l5 5 9-10"/>', spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>', orbit: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', topv: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h8V4"/>', walk: '<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8 12l3-4 4 2 2 3M12 15l-1-5"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>', win: '<rect x="4" y="3" width="20" height="22" rx="2"/><path d="M14 3v22M4 14h20"/>', door: '<rect x="7" y="3" width="14" height="22" rx="1"/><circle cx="17" cy="15" r="1.2"/>', balc: '<rect x="3" y="3" width="10" height="22" rx="1"/><rect x="15" y="3" width="10" height="12" rx="1"/>', rad: '<rect x="3" y="7" width="22" height="15" rx="2"/><path d="M9 7v15M14 7v15M19 7v15"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.4-2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  house: '<path d="M3 21h18"/><path d="M5 21V9h14v12"/><path d="M5 9l7-5 7 5"/>', rotl: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 4v7h7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>', zin: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>', zout: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  expand: '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/>', shrink: '<path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/>' };
const ic = (n, sz = 20, col = "currentColor", sw = 2, vb = 24) => `<svg width="${sz}" height="${sz}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const storeTag = s => `<span class="store st-${["ym", "wb", "my", "base"].includes(s) ? s : "oz"}">${ST[s] || ST.oz}</span>`;

const STEPT = ["", "Размеры", "Окна и двери", "Отделка", "Мебель", "Итог"];
function header(step) { let b = ""; for (let i = 1; i <= 5; i++) b += `<span class="${i < step ? "d" : i === step ? "c" : ""}"></span>`;
  return `<div class="top"><button class="icb glass" data-act="back" aria-label="Назад">${ic(step === 1 ? "x" : "back", 20, "#111114", 2.2)}</button><div class="prog glass" role="group" aria-label="Шаг ${step} из 5"><span>${STEPT[step]}</span><div class="bars" aria-hidden="true">${b}</div></div><span style="width:44px"></span></div>`; }
const WMODES = [["auto", "Срез", "ближние стены убираются"], ["ghost", "Прозрачные", "ближние стены просвечивают"], ["up", "Все стены", "как есть, удобно сверху"], ["down", "Низкие", "стены вровень с полом"]];
function wmenu() { return `<div class="wmenu glass" role="menu" aria-label="Режим стен">${WMODES.map(([k, l, s]) => `<button role="menuitemradio" aria-checked="${S.wallMode === k}" class="${S.wallMode === k ? "on" : ""}" data-wmode="${k}"><b>${l}</b><span>${s}</span></button>`).join("")}</div>`; }
function tools(opts = {}) { const n = S.room && S.room.night; const top = controls.getPolarAngle() < .3; return `<div class="tools glass" role="toolbar" aria-label="Вид">
  <button class="${top ? "on" : ""}" aria-pressed="${top}" data-act="cam-top" aria-label="Вид сверху">${ic("topv", 20, "currentColor", 1.8)}</button>
  <button class="${S.wmenu ? "on" : ""}" aria-expanded="${!!S.wmenu}" data-act="walls" aria-label="Режим стен">${ic("house", 20, "currentColor", 1.8)}</button>
  <button data-act="walk" aria-label="Прогуляться по комнате">${ic("walk", 20, "currentColor", 1.8)}</button><hr>
  <button data-act="night" aria-label="${n ? "Включить день" : "Включить вечер"}">${ic(n ? "sun" : "moon", 20, "currentColor", 1.8)}</button><hr>
  <button class="${S.full ? "on" : ""}" aria-pressed="${!!S.full}" data-act="full" aria-label="${S.full ? "Показать панель" : "Комната на весь экран"}">${ic(S.full ? "shrink" : "expand", 20, "currentColor", 1.8)}</button></div>${S.wmenu ? wmenu() : ""}`; }
function sheet(h, inner, cta, pb = 104) {
  if (S.full) { setOffset(0); $("#phone").style.setProperty("--sh", "72px"); return `<div class="bottom" style="justify-content:center"><button class="chip dark" data-act="full" style="height:46px;padding:0 20px;gap:8px">${ic("shrink", 16, "#FFFFFF", 2)}Показать панель</button></div>`; }
  /* выше 520 панель залезает под столбик инструментов справа и прячет кнопки в её шапке */
  const H = S.collapsed ? 128 : Math.min(h, 520); setOffset(H - 104 < 0 ? 0 : H - 60); $("#phone").style.setProperty("--sh", H + "px");
  return `<div class="sheet" style="height:${H}px;padding-bottom:${pb}px"><button class="grabbtn" data-act="collapse" aria-label="${S.collapsed ? "Развернуть панель" : "Свернуть панель, чтобы видеть комнату"}"><i></i></button><div class="in">${inner}</div></div>
  <div class="rotpad glass" style="bottom:${H + 12}px" role="toolbar" aria-label="Повернуть комнату"><button data-act="rot-l" aria-label="Повернуть комнату влево">${ic("rotl", 20, "currentColor", 1.9)}</button><button data-act="rot-r" aria-label="Повернуть комнату вправо">${ic("rot", 20, "currentColor", 1.9)}</button></div>${cta || ""}`; }
const cta = (t, act = "next") => `<div class="bottom"><button class="cta" data-act="${act}">${t}${ic("next", 18, "#FFFFFF", 2.2)}</button></div>`;

const NOTES = {
  home: ["Главная", "Мои комнаты и подборки", ["Одна главная кнопка — «Обустроить комнату». Без выбора режимов.", "«Начать с готового»: тап делает копию готовой комнаты от канала, магазина или партнёра. Партнёрская помечена «Реклама».", "Незаконченная комната открывается на том шаге, где человек остановился."]],
  step1: ["Шаг 1 из 5", "Форма комнаты", ["Комната в 3D видна сразу и её можно крутить пальцем: результат с первой секунды.", "Три формы: прямая и Г-образная по размерам, «Своя» — рисуешь стены по точкам на сетке, точки прилипают к шагу 25 см.", "Панель сворачивается тапом по полоске сверху, чтобы видеть комнату целиком."]],
  step2: ["Шаг 2 из 5", "Окна, двери, батареи", ["Тап по окну, двери или батарее выбирает её. Ползунки: ширина, сдвиг по стене, высота, высота от пола. Менять можно в любой момент.", "Проёмы не налезают друг на друга: ползунок упирается в соседа.", "Кнопка с домиком — режимы стен: срез, прозрачные, все, низкие."]],
  step3: ["Шаг 3 из 5", "Отделка", ["Тап по стене — красим только её, «Все стены» — сразу все.", "Пол — настоящие текстуры: доска, плитка, микроцемент.", "Кнопка луны справа включает вечер: видно, как работает свет."]],
  step4: ["Шаг 4 из 5", "Обстановка: одна библиотека", ["Мебель, свет, декор и текстиль в одном месте, с поиском и фильтром по магазинам: Яндекс Маркет, Wildberries, Ozon.", "Подборки: «добавить всё» ставит готовый набор в комнату. Это главная точка для партнёрок и каналов.", "Цвет и материал: цвета магазина, ещё 22 цвета, свой цвет, лён, букле, велюр, дерево, мрамор, бетон и своё фото ткани.", "Тап по предмету: светящаяся точка ведёт в карточку товара. Замок закрепляет предмет, чтобы не сдвинуть случайно."]],
  step5: ["Шаг 5 из 5", "Итог и покупки", ["Список разбит по магазинам: удобно собрать корзину на каждом маркетплейсе.", "«Прогуляться» — посмотреть комнату от первого лица перед покупкой.", "Варианты комнаты — в Pro, поделиться — бесплатно (виральность)."]],
  walk: ["Прогулка", "Вид от первого лица", ["Тяни — смотреть, джойстик или WASD — идти, тап по полу — перейти туда.", "Щипок или кнопки с лупой меняют угол обзора, глаз — высоту: стоя, сидя, сверху.", "Мебель и стены не пускают внутрь, камера скользит вдоль них."]],
  guest: ["Гость", "Комната по ссылке", ["Только просмотр: крутить, гулять, смотреть товары.", "Главная кнопка «Сделать такую же у себя» — так шеринг приводит новых людей."]]
};
function setSide() { const n = NOTES[S.walk ? "walk" : S.screen]; if (n) { $("#sNum").textContent = n[0]; $("#sTitle").textContent = n[1]; $("#sNotes").innerHTML = n[2].map(x => `<li>${esc(x)}</li>`).join(""); }
  const all = [["home", "Главная"], ["step1", "1 Форма"], ["step2", "2 Окна"], ["step3", "3 Отделка"], ["step4", "4 Обстановка"], ["step5", "5 Итог"], ["walk", "Прогулка"], ["guest", "Гость"], ["m-product", "Карточка"], ["m-paywall", "Подписка"], ["m-share", "Поделиться"]];
  $("#jump").innerHTML = all.map(([k, l]) => `<button class="${(S.screen === k && !S.walk) || (k === "walk" && S.walk) || S.modal === k.slice(2) ? "on" : ""}" data-jump="${k}">${l}</button>`).join(""); }

/* ---------- экраны ---------- */
/* ---------- онбординг: четыре экрана, показываем один раз ---------- */
const ONBKEY = "room.onb.v1";
const ONB = [
  { h: "Комната как у вас",
    p: "Форма, метраж, окна и двери — не шаблон, а ваша квартира. Нарисуйте план пальцем или возьмите готовый.",
    art: `<svg viewBox="0 0 320 230" aria-hidden="true">
      <path class="o-f d1" d="M44 64H276V186H44Z" fill="#FFFFFF" opacity="0"/>
      <path class="o-draw" d="M44 64H276V186H44Z" fill="none" stroke="#111114" stroke-width="3" stroke-linejoin="round" stroke-dasharray="708" stroke-dashoffset="708"/>
      <rect class="o-p d2" x="152" y="56" width="86" height="16" rx="5" fill="#0B63E5" opacity="0"/>
      <path class="o-f d3" d="M44 158V112" stroke="#0B63E5" stroke-width="7" stroke-linecap="round" opacity="0"/>
      <path class="o-f d3" d="M44 112a46 46 0 0 1 46 46" fill="none" stroke="#0B63E5" stroke-width="2" stroke-dasharray="5 5" opacity="0"/>
      <g class="o-f d4" opacity="0"><path d="M44 204H276" stroke="#8E9199" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="160" y="222" text-anchor="middle" font-size="14" font-weight="600" fill="#6B6E76">3,6 × 2,4 м</text></g>
    </svg>` },
  { h: "Мебель из магазинов",
    p: "Каждая вещь — настоящий товар с реальными габаритами. Шкаф не влезает — вы увидите это сейчас, а не в день доставки.",
    art: `<svg viewBox="0 0 320 230" aria-hidden="true">
      <path d="M44 62H276V188H44Z" fill="#F1F2F4" stroke="#E2E4E8" stroke-width="2"/>
      <rect class="o-r d1" x="60" y="96" width="92" height="64" rx="7" fill="#AFC0DA" opacity="0"/>
      <rect class="o-r d2" x="166" y="80" width="44" height="80" rx="7" fill="#8E9AAE" opacity="0"/>
      <rect class="o-r d3" x="224" y="118" width="38" height="42" rx="7" fill="#D8CFC2" opacity="0"/>
      <g class="o-p d4" opacity="0"><rect x="172" y="176" width="118" height="30" rx="15" fill="#111114"/>
        <text x="231" y="196" text-anchor="middle" font-size="13" font-weight="600" fill="#FFFFFF">1,60 × 0,46 м</text></g>
    </svg>` },
  { h: "Своя вещь по фото",
    p: "Снимите вещь или возьмите фото с карточки товара. Фон уберётся сам, предмет встанет в комнату.",
    art: `<svg viewBox="0 0 320 230" aria-hidden="true">
      <path class="o-f d1" d="M196 70H294V188H196Z" fill="#F1F2F4" stroke="#E2E4E8" stroke-width="2" opacity="0"/>
      <rect x="26" y="58" width="112" height="134" rx="14" fill="#FFFFFF" stroke="#E2E4E8" stroke-width="2"/>
      <rect class="o-bg" x="36" y="68" width="92" height="114" rx="8" fill="#EDEDEA"/>
      <g class="o-ch"><path d="M64 152v-36a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v36" fill="#5B6676"/>
        <rect x="58" y="140" width="48" height="13" rx="5" fill="#48525F"/>
        <path d="M66 153v16M98 153v16" stroke="#48525F" stroke-width="5" stroke-linecap="round"/></g>
      <g class="o-f d2" opacity="0"><path d="M152 126h24" stroke="#0B63E5" stroke-width="3" stroke-linecap="round"/>
        <path d="M170 120l7 6-7 6" fill="none" stroke="#0B63E5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    </svg>` },
  { h: "Список покупок",
    p: "В конце — что купить, где и за сколько. Остаётся открыть ссылки и оформить заказ.",
    art: `<svg viewBox="0 0 320 230" aria-hidden="true">
      <rect x="34" y="40" width="252" height="150" rx="16" fill="#FFFFFF" stroke="#E2E4E8" stroke-width="2"/>
      ${[["16 065 ₽", 96], ["9 079 ₽", 120], ["2 103 ₽", 74]].map(([pr, w], k) => `<g class="o-r d${k + 1}" opacity="0">
        <rect x="50" y="${58 + k * 34}" width="26" height="26" rx="6" fill="#E7E9EE"/>
        <rect x="86" y="${67 + k * 34}" width="${w}" height="8" rx="4" fill="#D6D9E0"/>
        <text x="270" y="${76 + k * 34}" text-anchor="end" font-size="13" font-weight="600" fill="#111114">${pr}</text></g>`).join("")}
      <path class="o-f d4" d="M50 166H270" stroke="#E2E4E8" stroke-width="1.5" opacity="0"/>
      <g class="o-p d5" opacity="0"><text x="50" y="212" font-size="15" fill="#6B6E76">Итого</text>
        <text x="270" y="212" text-anchor="end" font-size="21" font-weight="700" fill="#111114">27 247 ₽</text></g>
    </svg>` }
];
function onbDone() { S.onb = null; try { localStorage.setItem(ONBKEY, "1"); } catch (_) {} render(); }
function vOnb() {
  const i = Math.max(0, Math.min(ONB.length - 1, S.onb)), s = ONB[i], last = i === ONB.length - 1;
  return `<div class="onb" role="dialog" aria-modal="true" aria-label="Знакомство с приложением">
    <button class="onb-skip" data-act="onbskip" style="visibility:${last ? "hidden" : "visible"}">Пропустить</button>
    <div class="onb-art">${s.art}</div>
    <div class="onb-txt"><h1 class="onb-h">${s.h}</h1><p class="onb-p">${s.p}</p></div>
    <div class="onb-foot"><div class="onb-dots" role="presentation">${ONB.map((_, k) => `<i class="onb-dot ${k === i ? "on" : ""}"></i>`).join("")}</div>
      <button class="cta" data-act="onbnext">${last ? "Поехали" : "Дальше"}${ic(last ? "check" : "next", 18, "#FFFFFF", 2.2)}</button></div></div>`;
}

function vHome() {
  let r = `<div class="home"><div style="display:flex;align-items:center;justify-content:space-between;min-height:44px"><h1 style="margin:0;font-size:34px;line-height:41px;font-weight:700;letter-spacing:-.01em">Мои комнаты</h1><button class="${S.sub ? "lg-sel" : "lg"} chip" data-act="paywall" style="font-size:14px;font-weight:600">${ic("spark", 16)}Pro</button></div>`;
  if (!S.rooms.length) r += `<div class="roomcard" style="margin-top:16px"><img src="${S.snaps.p0 || ""}" alt="" style="height:200px"><div style="padding:16px 20px 20px"><div class="t15" style="font-size:20px;line-height:26px">Обустроим комнату за 5 шагов</div><div class="t13" style="font-size:15px;line-height:20px;margin-top:4px">Стены, окна, отделка, мебель — и список, где всё купить</div></div></div>`;
  else r += `<div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">` + S.rooms.map(x => `<button class="roomcard" data-open-room="${x.id}"><img src="${x.snap || ""}" alt="" style="height:180px"><div style="padding:12px 16px 16px;display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div class="t15">${esc(x.name)}</div><div class="t13">${fmt(area(x))} м² · ${x.items.length} предм.</div></div><span class="ad" style="${x.step <= 5 ? "background:#EAF2FD;color:#0058B8" : ""}">${x.step > 5 ? "Готово" : "Шаг " + x.step + " из 5"}</span></div></button>`).join("") + `</div>`;
  r += `<p class="cap" style="margin-top:32px">Начать с готового</p><div class="scrollx">` + PRESETS.map((p, i) => `<button class="coll" data-preset="${i}"><img src="${S.snaps["p" + i] || ""}" alt=""><div style="padding:10px 14px 14px;display:flex;flex-direction:column;gap:4px"><div class="t15">${p.t}</div><div class="t13">${p.by}</div>${p.ad ? `<span class="ad" style="align-self:flex-start">Реклама · ${p.ad}</span>` : ""}</div></button>`).join("") + `</div></div>`;
  r += `<div style="display:flex;justify-content:center;margin-top:24px"><button class="link" data-act="onbshow">Как это работает</button></div>`;
  r += `<div class="bottom"><button class="cta" data-act="new">${ic("plus", 18, "#FFFFFF", 2.2)}Обустроить комнату</button></div>`; return r; }

function vStep1() { const r = S.room;
  if (S.draw) return vDraw();
  const shapes = [["rect", "Прямая", '<rect x="3" y="4" width="22" height="18" rx="2"/>'], ["L", "Г-образная", '<path d="M3 4h22v10h-9v8H3z"/>'], ["custom", "Своя", '<path d="M3 8l8-5 13 4-2 15-14 1z"/>']];
  const plans = S.plans ? `<div class="scrollx" role="group" aria-label="Готовые планировки">${PRESETS.map((p, i) => `<button class="coll" data-plan2="${i}" style="width:190px"><img src="${S.snaps["p" + i] || ""}" alt="" style="height:96px"><div style="padding:8px 12px 12px"><div class="t15">${p.room.name}</div><div class="t13">${fmt(p.room.L)} × ${fmt(p.room.W)} м</div></div></button>`).join("")}</div>` : "";
  return header(1) + tools() + sheet(S.plans ? 600 : 540, `
  <p class="cap" style="margin-top:2px">Тип комнаты</p>
  <div class="scrollx" role="group" aria-label="Тип комнаты">${["Спальня", "Гостиная", "Кухня", "Детская", "Кабинет"].map(t => `<button class="chip ${r.type === t ? "on" : ""}" aria-pressed="${r.type === t}" data-type="${t}">${t}</button>`).join("")}</div>
  <p class="cap">Форма</p><div class="scrollx">${shapes.map(([k, l, d]) => `<button class="tile wide ${r.shape === k ? "on" : ""}" aria-pressed="${r.shape === k}" data-shape="${k}" style="flex:none;min-width:150px"><svg width="28" height="26" viewBox="0 0 28 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">${d}</svg>${l}</button>`).join("")}</div>
  ${r.shape !== "custom" ? `<p class="cap">Размеры, м</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${[["L", "Длина"], ["W", "Ширина"], ["H", "Потолок"]].map(([k, l]) => `<label class="field"><span>${l}</span><input data-dim="${k}" type="text" inputmode="decimal" value="${fmt(r[k])}" aria-label="${l}, метры"></label>`).join("")}</div>`
  : `<p class="sub" style="margin-top:16px">${r.pts.length} стен · ${fmt(area(r))} м²</p><button class="link" data-act="draw">${ic("pen", 16)}Нарисовать заново</button>`}
  <button class="link" data-act="plans" aria-expanded="${!!S.plans}">${ic("layers", 16)}${S.plans ? "Скрыть планировки" : "Выбрать готовую планировку"}</button>${plans}`, cta("Дальше: окна и двери")); }

function vDraw() { const d = S.draw; const W = 390, Hh = 600, cell = 40, ox = 35, oy = 90; const m2p = ([x, z]) => [ox + x * cell, oy + z * cell];
  let g = ""; for (let i = 0; i <= 8; i++) g += `<line x1="${ox + i * cell}" y1="${oy}" x2="${ox + i * cell}" y2="${oy + 12 * cell}" stroke="rgba(17,17,20,${i % 2 ? .06 : .12})"/>`; for (let j = 0; j <= 12; j++) g += `<line x1="${ox}" y1="${oy + j * cell}" x2="${ox + 8 * cell}" y2="${oy + j * cell}" stroke="rgba(17,17,20,${j % 2 ? .06 : .12})"/>`;
  const P2 = d.pts.map(m2p); let path = P2.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  let lab = ""; for (let i = 1; i < d.pts.length; i++) { const a = d.pts[i - 1], b = d.pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const [x1, y1] = m2p(a), [x2, y2] = m2p(b); lab += `<rect x="${(x1 + x2) / 2 - 22}" y="${(y1 + y2) / 2 - 10}" width="44" height="20" rx="10" fill="#0058B8"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff" font-family="Inter Tight">${fmt(L)} м</text>`; }
  return `<div style="position:absolute;inset:0;background:#F2F1EE;z-index:3"><svg id="drawsvg" width="${W}" height="${Hh + 90}" style="touch-action:none" role="img" aria-label="Сетка для рисования стен, клетка 50 см">${g}<path d="${path}" fill="${d.pts.length > 2 ? "rgba(0,88,184,.08)" : "none"}" stroke="#2B2D33" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>${P2.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === 0 && d.pts.length > 2 ? 12 : 7}" fill="${i === 0 ? "#0058B8" : "#fff"}" stroke="#0058B8" stroke-width="2.5"/>`).join("")}${lab}</svg></div>
  <div class="top" style="z-index:6"><button class="icb glass" data-act="drawcancel" aria-label="Отменить рисование">${ic("x", 20, "#111114", 2.2)}</button><div class="prog glass">${d.pts.length < 3 ? "Ставь точки по углам комнаты" : "Тапни первую точку, чтобы замкнуть"}</div><span style="width:44px"></span></div>
  <div class="float glass hint" style="top:66px;z-index:6">Клетка — 50 см · точки прилипают к 25 см</div>
  <div class="drawbar"><button class="cta ghost" data-act="drawundo" style="flex:1" ${d.pts.length ? "" : "disabled"}>${ic("undo", 18)}Шаг назад</button><button class="cta" data-act="drawdone" style="flex:1" ${d.pts.length > 2 ? "" : "disabled aria-disabled=true"}>${ic("check", 18, "#fff", 2.4)}Готово</button></div>`; }

const hl = t => `<p class="hintline">${t}</p>`;
const OPNAME = { window: "Окно", door: "Дверь", balcony: "Балкон", radiator: "Батарея" };
const opSub = (r, o) => `Стена ${o.wall + 1} · ${o.type === "radiator" ? fmt(o.w) + " м" : fmt(o.w) + " × " + fmt(oH(o)) + " м"}`;
const rngHtml = ([k, l, mn, mx, v]) => `<div class="rng"><div class="rh"><span>${l}</span><output data-out="${k}">${fmt(v)} м</output></div><input type="range" data-opf="${k}" min="${mn}" max="${Math.max(mx, mn)}" step=".05" value="${v}" style="--p:${pct(v, mn, mx)}%" aria-label="${l}, метры"${mx <= mn ? " disabled" : ""}></div>`;
function syncOpUI(o) { const r = S.room;
  for (const [k, , mn, mx, v] of opModel(r, o)) { const inp = document.querySelector(`[data-opf="${k}"]`); if (!inp) continue; inp.min = mn; inp.max = Math.max(mx, mn); inp.value = v; inp.disabled = mx <= mn; inp.style.setProperty("--p", pct(v, mn, mx) + "%"); const out = document.querySelector(`[data-out="${k}"]`); if (out) out.textContent = fmt(v) + " м"; }
  const sub = $("#opsub"); if (sub) sub.textContent = opSub(r, o); }
function vStep2() { const r = S.room; const E = edges(r); const op = r.openings.find(o => o.id === S.selOpen); const NM = OPNAME;
  const cnt = t => r.openings.filter(o => o.type === t).length; const tile = (t, icn) => `<button class="tile" data-add-open="${t}">${ic(icn, 28, "#2B2D33", 2, 28)}<span>${NM[t]}</span>${cnt(t) ? `<span class="badge">${cnt(t)}</span>` : ""}</button>`;
  const wallOps = r.openings.filter(o => o.wall === S.selWall); let H, inner;
  if (op) { const model = opModel(r, op); const rows = Math.min(3, model.length); H = 128 + 62 + rows * 70 + 60 + 8;
    inner = `<h1 class="h2">${NM[op.type]}</h1><p class="sub" id="opsub">${opSub(r, op)}</p>
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">${model.slice(0, 2).map(rngHtml).join("")}${model.length > 2 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${model.slice(2).map(rngHtml).join("")}</div>` : ""}</div>
    <div class="row" style="margin-top:8px"><button class="lg" data-op="del" style="height:48px;padding:0 20px;border-radius:24px;display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;color:#C4262E">${ic("trash", 18, "#C4262E")}Удалить</button><button class="cta" data-op="done" style="flex:1;height:48px;font-size:15px">Готово</button></div>`; }
  else { H = wallOps.length ? 400 : 360;
    inner = `<p class="sub" style="margin-top:2px">Стена ${S.selWall + 1} из ${E.length} · ${fmt(E[S.selWall] ? E[S.selWall].len : 0)} м</p>
    <div class="scrollx" style="margin-top:12px" role="group" aria-label="Стена">${E.map(e => `<button class="chip ${S.selWall === e.i ? "on" : ""}" data-wsel="${e.i}" style="height:34px;font-size:14px">Стена ${e.i + 1}</button>`).join("")}</div>
    ${wallOps.length ? `<div class="scrollx" style="margin-top:4px" role="group" aria-label="Что уже стоит на стене">${wallOps.map(o => `<button class="chip" data-osel="${o.id}" style="height:34px;font-size:14px">${ic("pen", 14)}${NM[o.type]} · ${fmt(o.w)} м</button>`).join("")}</div>` : ""}
    <div style="margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${tile("window", "win")}${tile("door", "door")}${tile("balcony", "balc")}${tile("radiator", "rad")}</div>`; }
  return header(2) + tools() + sheet(H, hl(op ? NM[op.type] + " · тап по пустой стене — снять" : "Тап по стене или окну — выбрать") + inner, cta("Дальше: отделка")); }

function vStep3() { const r = S.room; const E = edges(r); const curWall = S.paintWall === "all" ? r.wallDefault : (r.wallColors[S.paintWall] || r.wallDefault);
  const sw = S.paint === "walls" ? WALLC.map(([c, n]) => `<button class="sw ${curWall === c ? "on" : ""}" aria-pressed="${curWall === c}" data-color="${c}"><i style="background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.6),rgba(255,255,255,0) 45%),${c}"></i><span>${n}</span></button>`).join("")
    : FLOORS.map(f => `<button class="sw ${r.floor === f.id ? "on" : ""}" aria-pressed="${r.floor === f.id}" data-floor="${f.id}"><i style="background-image:url(${floorTex(f).image.toDataURL("image/jpeg", .6)});background-size:200%"></i><span>${f.n}</span></button>`).join("");
  const dotbg = c => `radial-gradient(circle at 35% 28%,rgba(255,255,255,.5),rgba(255,255,255,0) 45%),${c}`;
  const opRow = (cur, attr) => OPC.map(([c, n]) => `<button class="sw ${cur === c ? "on" : ""}" aria-pressed="${cur === c}" data-${attr}="${c}"><i style="background:${dotbg(c)}"></i><span>${n}</span></button>`).join("");
  const hasOp = r.openings.some(o => o.type !== "radiator");
  const body = S.paint === "open"
    ? (hasOp ? `<p class="cap" style="margin-top:14px">Рамы окон и балкона</p><div class="scrollx">${opRow(r.opColor || "#FAFAF8", "opcol")}</div>
       <p class="cap" style="margin-top:8px">Полотно двери</p><div class="scrollx">${opRow(r.doorColor || "#F4F1EC", "drcol")}</div>`
      : `<p class="sub" style="margin-top:16px">Окон и дверей пока нет. Вернись на шаг 2 и поставь их.</p>`)
    : `${S.paint === "walls" ? `<div class="scrollx" style="margin-top:12px" role="group" aria-label="Какие стены"><button class="chip ${S.paintWall === "all" ? "on" : ""}" data-pw="all" style="height:34px;font-size:14px">Все стены</button>${E.map(e => `<button class="chip ${S.paintWall === e.i ? "on" : ""}" data-pw="${e.i}" style="height:34px;font-size:14px">Стена ${e.i + 1}</button>`).join("")}</div>` : ""}
    <p class="cap" style="margin-top:16px">${S.paint === "walls" ? "Цвет" : "Покрытие"}</p><div class="scrollx">${sw}</div>`;
  return header(3) + tools() +
  sheet(S.paint === "open" ? 470 : 400, hl(S.paint === "walls" ? "Тап по стене — красим только её" : S.paint === "floor" ? "Выбери покрытие пола" : "Двери и окна красим вместе") + `<div class="seg" role="group" aria-label="Что меняем" style="margin-top:4px">${[["walls", "Стены"], ["floor", "Пол"], ["open", "Проёмы"]].map(([k, l]) => `<button class="${S.paint === k ? "on" : ""}" aria-pressed="${S.paint === k}" data-paint="${k}" style="flex:1">${l}</button>`).join("")}</div>${body}`, cta("Дальше: обстановка")); }

const dimTxt = (it, p) => { const w = it.w || p.w, d = it.d || p.d; return p.round || p.b === "coffee" ? "Ø" + Math.round(w * 100) + " см" : Math.round(w * 100) + "×" + Math.round(d * 100) + " см" + (p.hr ? ", выс. " + Math.round((it.h || p.h) * 100) : ""); };
function edTabs(it) { const p = PROD[it.p]; const t = []; if (p.rsz) t.push(["size", "Размер"]); if (p.b === "art") t.push(["poster", "Постер"]); t.push(["color", "Цвет"], ["mat", "Материал"]); return t; }
const edTab = it => { const t = edTabs(it); return t.some(x => x[0] === S.etab) ? S.etab : t[0][0]; };
const vEdH = it => { const p = PROD[it.p], t = edTab(it); return t === "size" ? 182 + 62 * (1 + (p.rszD ? 1 : 0) + (p.hr ? 1 : 0)) : t === "poster" ? 290 : 262; };
function vEditor(it) { const p = PROD[it.p]; const base = itemBase(it); const photo = isPh(it.mat) && PHOTOS[it.mat]; const curCol = it.col ? it.col.toLowerCase() : null;
  const dot = c => `radial-gradient(circle at 35% 28%,rgba(255,255,255,.6),rgba(255,255,255,0) 45%),${c}`;
  const sv = p.vars.map((v, i) => `<button class="sw ${!curCol && !photo && (it.v || 0) === i ? "on" : ""}" aria-pressed="${!curCol && !photo && (it.v || 0) === i}" data-var="${i}"><i style="background:${dot(v[0])}"></i><span>${v[1]}</span></button>`).join("");
  const sp = PAL.map(([c, n]) => `<button class="sw ${curCol === c.toLowerCase() && !photo ? "on" : ""}" aria-pressed="${curCol === c.toLowerCase() && !photo}" data-ccol="${c}"><i style="background:${dot(c)}"></i><span>${n}</span></button>`).join("");
  const hex = "#" + new THREE.Color(base).getHexString();
  const cust = `<label class="sw" aria-label="Свой цвет"><i style="background:conic-gradient(#ff5a5a,#ffd75a,#5adc7a,#5ac8ff,#8a6bff,#ff5ab4,#ff5a5a)"></i><input type="color" data-cust value="${hex}"><span>Свой</span></label>`;
  const sm = MATS.map(([k, n]) => { const on = (it.mat || "none") === k; const img = k === "none" ? "" : `background-image:url(${matTex(k).image.toDataURL("image/jpeg", .6)});background-size:220%;background-blend-mode:multiply;`; return `<button class="sw ${on ? "on" : ""}" aria-pressed="${on}" data-mat="${k}"><i style="background-color:${photo ? "#ddd" : base};${img}"></i><span>${n}</span></button>`; }).join("");
  const ph = `<label class="sw ${photo ? "on" : ""}" aria-label="Загрузить фото ткани или материала"><i style="${photo ? `background:url(${photo.url}) center/cover` : "background:#F1F2F5;display:flex;align-items:center;justify-content:center"}">${photo ? "" : ic("image", 22, "#2B2D33", 1.8)}</i><input type="file" accept="image/*" data-photo><span>Своё фото</span></label>`;
  const rr = (key, label, lim, cur) => `<div class="rng"><div class="rh"><span>${label}</span><output data-r${key}out>${fmt(cur)} м</output></div><input type="range" data-r${key} min="${lim[0]}" max="${lim[1]}" step=".05" value="${cur}" style="--p:${pct(cur, lim[0], lim[1])}%" aria-label="${label}, метры"></div>`;
  const cw = it.w || p.w, cd = it.d || p.d;
  const chips = p.sizes ? p.sizes.map((z, i) => `<button class="chip ${Math.abs(cw - z.w) < .03 && Math.abs(cd - z.d) < .03 ? "on" : ""}" data-rsz="${i}" style="height:34px;font-size:14px">${z.l}</button>`).join("")
    : p.rsz ? [["S", p.rsz[0]], ["M", Math.round((p.rsz[0] + p.rsz[1]) / 2 * 20) / 20], ["L", p.rsz[1]]].map(([l, v]) => `<button class="chip ${Math.abs(cw - v) < .03 ? "on" : ""}" data-rpre="${v}" style="height:34px;font-size:14px">${l} · ${fmt(v)} м</button>`).join("") : "";
  const tb = edTab(it);
  let body = "";
  if (tb === "size") body = `<div class="scrollx" style="padding-top:4px;padding-bottom:10px">${chips}</div>${rr("w", p.round || p.b === "coffee" ? "Диаметр" : "Ширина", p.rsz, cw)}${p.rszD ? rr("d", "Глубина", p.rszD, cd) : ""}${p.hr ? rr("h", "Высота", p.hr, it.h || p.h) : ""}`;
  else if (tb === "poster") body = `<div class="scrollx" style="padding-top:4px"><label class="sw ${it.img ? "on" : ""}" aria-label="Загрузить своё изображение"><i style="${it.img && PHOTOS[it.img] ? `background:url(${PHOTOS[it.img].url}) center/cover` : "background:#F1F2F4;display:flex;align-items:center;justify-content:center"}">${it.img ? "" : ic("image", 22, "#2B2D33", 1.8)}</i><input type="file" accept="image/*" data-poster><span>Загрузить</span></label>
    ${it.img ? `<button class="sw" data-act="posteroff"><i style="background:#F1F2F4;display:flex;align-items:center;justify-content:center">${ic("undo", 20, "#2B2D33", 2)}</i><span>Вернуть</span></button>` : ""}</div><p class="t13">Картинка встаёт в раму, пропорции подгоняются.</p>`;
  else if (tb === "color") body = `<div class="scrollx" role="group" aria-label="Цвет" style="padding-top:4px">${sv}${cust}${sp}</div>${p.store === "base" ? "" : `<p class="t13" style="margin-top:2px">Свой цвет нужен для примерки. В магазине выбери ближайший.</p>`}`;
  else body = `<div class="scrollx" role="group" aria-label="Материал" style="padding-top:4px">${sm}${ph}</div>`;
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div class="grow" style="min-width:0"><h1 class="h2 plain" style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.n}</h1><p class="sub" style="margin:0">${colorName(it)} · ${dimTxt(it, p)}</p></div><button class="chip dark" data-act="editdone">Готово</button></div>
  <div class="etabs" role="tablist" aria-label="Что менять">${edTabs(it).map(([k, l]) => `<button role="tab" aria-selected="${tb === k}" class="chip ${tb === k ? "dark" : ""}" data-etab="${k}" style="height:34px;font-size:14px">${l}</button>`).join("")}</div>${body}`; }

function vInside() {
  const r = S.room; const sill = S.openSill ? r.openings.find(o => o.id === S.openSill) : null;
  const it = !sill && S.open ? r.items.find(i => i.id === S.open) : null;
  if (!sill && !it) return null;
  const p = it ? PROD[it.p] : null; const host = sill || it; const arr = host.in || [];
  const slots = sill ? [["0", "Подоконник"]]
    : contLevels(p).map((_, i) => [String(i), i === 0 ? "Низ" : "Полка " + i]).concat([["back", "Задняя стенка"]]);
  if (!slots.some(s => s[0] === S.slot)) S.slot = slots[0][0];
  const back = S.slot === "back";
  const pick = allProd().filter(x => back ? (x.wall && x.b === "art") : x.small);
  const here = arr.map((o, i) => [o, i]).filter(([o]) => String(o.s) === String(S.slot));
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
    <div class="grow"><h1 class="h2 plain" style="margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sill ? "Подоконник" : p.n)}</h1><p class="sub">${arr.length ? arr.length + " вещ. внутри" : "Пока пусто"}</p></div>
    <button class="chip dark" data-act="insideclose">Готово</button></div>
  <div class="scrollx" style="margin-top:10px" role="group" aria-label="Куда поставить">${slots.map(([k, l]) => `<button class="chip ${S.slot === k ? "on" : ""}" aria-pressed="${S.slot === k}" data-slot="${k}">${l}</button>`).join("")}</div>
  ${here.length ? `<div class="shelfbar">${here.map(([o, i]) => `<button class="slot full" data-outof="${i}" aria-label="Убрать ${esc(PROD[o.p] ? PROD[o.p].n : "")}"><img src="${S.thumbs[o.p + ":" + (o.v || 0)] || S.thumbs[o.p] || ""}" alt="">${ic("trash", 13, "#C4262E")}</button>`).join("")}</div>`
    : `<p class="t13" style="margin-top:10px">${back ? "Сюда можно повесить постер" : "Выбери, что поставить"}</p>`}
  <p class="cap" style="margin-top:12px">${back ? "Постеры" : "Что поставить"}</p>
  <div class="grid3">${pick.length ? pick.map(x => `<button class="pc" data-into="${x.id}"><span class="im"><img src="${S.thumbs[x.id] || ""}" alt=""></span><b>${x.n}</b><span class="meta"><span class="price">${rub(x.price)}</span></span><span style="padding:0 4px">${storeTag(x.store)}</span></button>`).join("") : `<p class="sub">Пока нечего положить</p>`}</div>`;
}
/* ---------- конвертер: фото → предмет ---------- */
const primMode = a => a.ex.wall ? "wall" : a.ex.flat ? "flat" : "model";
function makeDefaults(k) { const a = ARC[k]; return { ar: k, w: a.w, d: a.d, h: a.h, mode: a.mode === "cut" ? "cut" : primMode(a) }; }
function vMake() {
  const m = S.make, a = m.ar ? ARC[m.ar] : null;
  const ph = m.img ? PHOTOS[m.img] : null, C = m.img ? cutPhoto(m.img) : null;
  const rr = (k, label, lim, cur) => `<div class="rng"><div class="rh"><span>${label}</span><output data-mk${k}out>${fmt(cur)} м</output></div><input type="range" data-mk${k} min="${lim[0]}" max="${lim[1]}" step=".05" value="${clamp(cur, lim[0], lim[1])}" style="--p:${pct(clamp(cur, lim[0], lim[1]), lim[0], lim[1])}%" aria-label="${label}, метры"></div>`;
  const box = `<label class="mkph ${ph ? "on" : ""}" aria-label="Выбрать фото предмета">${ph ? `<img src="${(m.mode === "cut" && C ? C : ph).url}" alt="">` : `<span>${ic("image", 30, "#6B6E76", 1.7)}<b>Выбрать фото</b><i>Снимок товара или своей вещи</i></span>`}<input type="file" accept="image/*" data-mkph></label>`;
  const types = a && !m.pick
    ? `<div style="display:flex;align-items:center;gap:8px"><span class="chip on" style="height:38px;font-size:14px">${a.n}</span><button class="link" data-act="mkpick" style="margin:0">Изменить</button></div>`
    : `<div class="mkgrid">${ARCH.map(x => `<button class="chip ${m.ar === x.k ? "on" : ""}" data-mkar="${x.k}" style="height:38px;font-size:13px;justify-content:center;padding:0 8px">${x.n}</button>`).join("")}</div>`;
  let rest = `<p class="t13" style="margin-top:12px">Фото ляжет на нашу модель выбранного типа. Чем ровнее фон, тем лучше получится силуэт.</p>`;
  if (a && ph) {
    const lw = a.ex.rsz || [r05(Math.max(.1, a.w * .4)), r05(a.w * 2.2)], ld = a.ex.rszD || [r05(Math.max(.1, a.d * .4)), r05(a.d * 2.2)];
    const lh = [r05(Math.max(.1, a.h * .4)), r05(a.h * 1.8)];
    const pm = primMode(a), stand = !a.ex.wall && !a.ex.flat && !a.ex.ceil, cm = m.mode === "cut" && C;
    let szRow;
    if (cm && stand) szRow = rr("h", "Высота", lh, m.h) + `<p class="t13">Ширина и глубина — <b data-mkderived>${fmt(r05(m.h / C.ar))}</b> м, из пропорций фото.</p>`;
    else if (cm && !a.ex.flat) szRow = rr("w", "Ширина", lw, m.w) + `<p class="t13">Высота — <b data-mkderived>${fmt(r05(m.w * C.ar))}</b> м, из пропорций фото.</p>`;
    else szRow = rr("w", "Ширина", lw, m.w) + rr("d", "Глубина", ld, m.d)
      + (a.hv === "p" || a.hv === "s" ? rr("h", "Высота", lh, m.h) : "")
      + (a.hv === "a" ? `<p class="t13">Высота считается из пропорций фото.</p>` : "");
    rest = `<p class="cap" style="margin:14px 0 4px">Размеры</p>${szRow}
    <p class="cap" style="margin:14px 0 6px">Как показать</p>
    <div class="scrollx">
      <button class="chip ${m.mode === pm ? "on" : ""}" data-mkmode="${pm}" style="height:36px;font-size:14px">На модели</button>
      <button class="chip ${m.mode === "cut" ? "on" : ""}" data-mkmode="cut" style="height:36px;font-size:14px"${C ? "" : " disabled aria-disabled=\"true\""}>Силуэт по фото</button>
    </div>
    <p class="t13" style="margin-top:6px">${C ? (m.mode === "cut" ? "Фон убран, видно настоящую форму. Объёма нет: это фото, поставленное в комнату." : "Фото встанет на фасад нашей модели, остальное покрасим в его средний цвет.") : "Фон на фото неоднородный, вырезать силуэт не получится. Фото ляжет на модель."}</p>
    <p class="cap" style="margin:14px 0 6px">Название и цена</p>
    <div class="row" style="gap:8px"><label class="field grow" style="height:64px"><span>Название</span><input data-mkname value="${esc(m.n || "")}" placeholder="${esc(a.n)}" style="font-size:16px;font-weight:500"></label><label class="field" style="height:64px;width:116px;flex:none"><span>Цена, ₽</span><input data-mkprice inputmode="numeric" value="${m.price || ""}" placeholder="—" style="font-size:16px;font-weight:500"></label></div>
    <p class="t13" style="margin-top:6px">Цена нужна только для итогового списка. Можно не ставить.</p>`;
  }
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div class="grow" style="min-width:0"><h1 class="h2 plain" style="margin:4px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Своя вещь из фото</h1><p class="sub">${ph ? (a ? "Проверь размеры" : "Выбери тип") : "Шаг 1: фото"}</p></div><button class="chip" data-act="makeclose" style="flex:none">Отмена</button></div>
  <div style="margin-top:10px">${box}</div>
  <p class="cap" style="margin:16px 0 6px">Что это</p>${types}${rest}`;
}

function vStep4() { const r = S.room; const it = r.items.find(i => i.id === S.sel); const bad = overlaps(r); const ed = !!(it && S.edit);
  const tabs = ["База", "Подборки", "Моё", "Всё", "Мебель", "Свет", "Декор", "Текстиль"]; const stores = [["all", "Все магазины"], ["ym", ST.ym], ["wb", ST.wb], ["oz", ST.oz]].concat(MY.length ? [["my", "Моё"]] : []);
  const mkTile = `<button class="pc mk" data-act="make"><span class="im" style="display:flex;align-items:center;justify-content:center;background:transparent">${ic("plus", 30, "#0B63E5", 2)}</span><b style="color:var(--blue-d)">Своя вещь из фото</b><span class="meta"><span class="t13">фото → предмет</span></span></button>`;
  let body;
  if (S.lib === "База") { const q = S.q.trim().toLowerCase(); const list = CATALOG.filter(p => p.base && (!q || p.n.toLowerCase().includes(q) || p.sec.toLowerCase().includes(q))); const secs = []; for (const p of list) if (!secs.includes(p.sec)) secs.push(p.sec);
    const meta = p => p.sizes ? (p.round || p.b === "coffee" || p.b === "rug" && p.round ? "Ø" + Math.round(p.sizes[0].w * 100) + "–" + Math.round(p.sizes[p.sizes.length - 1].w * 100) : Math.round(p.sizes[0].w * 100) + "–" + Math.round(p.sizes[p.sizes.length - 1].w * 100)) + " см" : Math.round(p.w * 100) + " см";
    body = (secs.length ? secs.map(sc => `<p class="sec">${sc}</p><div class="grid3">${list.filter(p => p.sec === sc).map(p => `<button class="pc lg" data-add="${p.id}"><span class="im"><img src="${S.thumbs[p.id]}" alt=""></span><b>${p.n}</b><span class="meta"><span class="price" style="font-size:13px">${meta(p)}</span><span class="dots">${p.vars.map(v => `<i style="background:${v[0]}"></i>`).join("")}</span></span></button>`).join("")}</div>`).join("") : `<p class="sub" style="margin-top:12px">Ничего не нашли</p>`); }
  else if (S.lib === "Моё") body = `<div class="grid3" style="margin-top:8px">${mkTile}${myList().map(p => `<span style="position:relative;display:block"><button class="pc lg" data-add="${p.id}" style="width:100%"><span class="im"><img src="${S.thumbs[p.id] || ""}" alt=""></span><b>${esc(p.n)}</b><span class="meta"><span class="price">${p.price ? rub(p.price) : "—"}</span><span class="t13">${fmt(p.w)} м</span></span><span style="padding:0 4px">${storeTag("my")}</span></button><button class="xdel" data-mydel="${p.id}" aria-label="Удалить «${esc(p.n)}» из библиотеки">${ic("trash", 15, "#C4262E", 2)}</button></span>`).join("")}</div>
    <p class="t13" style="margin-top:10px">${MY.length ? `Своих вещей: ${MY.length} из ${MYMAX}. Хранятся в этом браузере — на сервере их пока нет, так что на другом телефоне их не будет.` : "Фото вещи или снимок карточки товара — и предмет встанет в комнату. Работает без интернета и без нейросетей."}</p>`;
  else if (S.lib === "Подборки") body = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${COLLS.map((c, i) => `<div class="lg" style="border-radius:20px;padding:12px;display:flex;gap:12px;align-items:center"><div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;width:84px;flex:none">${c.items.slice(0, 4).map(k => `<span style="height:40px;border-radius:8px;background:#F4F3F0;overflow:hidden"><img src="${S.thumbs[k]}" alt="" style="width:100%;height:100%;object-fit:contain"></span>`).join("")}</div><div class="grow"><div class="t15">${c.t}</div><div class="t13">${c.by} · ${c.items.length} товаров</div>${c.ad ? `<span class="ad" style="margin-top:4px">Реклама · ${c.ad}</span>` : ""}</div><button class="chip lg-dark" data-coll="${i}" style="height:36px;padding:0 12px;font-size:14px">Добавить</button></div>`).join("")}</div>`;
  if (S.lib !== "Подборки" && S.lib !== "Моё" && S.lib !== "База") { const q = S.q.trim().toLowerCase(); const list = allProd().filter(p => (S.lib === "Всё" || p.cat === S.lib) && !p.base && (S.store === "all" || p.store === S.store) && (!q || p.n.toLowerCase().includes(q)));
    body = `<div class="scrollx" style="margin-top:4px" role="group" aria-label="Магазин">${stores.map(([k, l]) => `<button class="chip ${S.store === k ? "on" : ""}" data-store="${k}" style="height:32px;font-size:13px;padding:0 12px">${l}</button>`).join("")}</div>
    <div class="grid3" style="margin-top:8px">${list.length ? list.map(p => `<button class="pc lg" data-add="${p.id}"><span class="im"><img src="${S.thumbs[p.id]}" alt=""></span><b>${p.n}</b><span class="meta"><span class="price">${rub(p.price)}</span><span class="dots">${p.vars.map(v => `<i style="background:${v[0]}"></i>`).join("")}</span></span><span style="padding:0 4px">${storeTag(p.store)}</span></button>`).join("") : `<p class="sub">Ничего не нашли</p>`}</div>`; }
  const allLocked = r.items.length > 0 && r.items.every(i => i.locked);
  const lib = `<div style="display:flex;align-items:center;gap:8px"><label class="search lg grow">${ic("search", 18, "#5E6068")}<input data-q value="${esc(S.q)}" placeholder="Найти: кровать, торшер…" aria-label="Поиск по библиотеке"></label><button class="icb lg" data-act="make" aria-label="Добавить свою вещь из фото">${ic("plus", 20, "var(--blue)", 2.2)}</button><button class="icb lg" data-act="lockall" aria-pressed="${allLocked}" aria-label="${allLocked ? "Открепить все предметы" : "Закрепить все предметы"}"${r.items.length ? "" : " disabled"}>${ic(allLocked ? "lock" : "unlock", 20, "currentColor", 1.9)}</button></div>
    <div class="scrollx" style="margin-top:8px" role="tablist" aria-label="Разделы">${tabs.map(t => `<button role="tab" aria-selected="${S.lib === t}" class="chip ${S.lib === t ? "dark" : ""}" data-lib="${t}" style="height:34px;font-size:14px">${t}</button>`).join("")}</div>${body}`;
  const dis = it && it.locked ? ' style="opacity:.35" aria-disabled="true"' : "";
  if (S.make) return header(4) + tools() + sheet(620, vMake(), `<div class="bottom"><button class="cta" data-act="makeadd"${S.make.img && S.make.ar ? "" : " disabled aria-disabled=\"true\""}>Добавить в библиотеку${ic("check", 18, "#FFFFFF", 2.4)}</button></div>`);
  const ins = vInside(); if (ins) return header(4) + tools() + sheet(480, ins, "");
  const pr = it && PROD[it.p];
  const dock = it ? `<div class="dock" role="toolbar" aria-label="${esc(pr.n)}"><div class="dkn">${esc(pr.n)}<span> · ${dimTxt(it, pr)}</span></div><div class="dkrow"><button class="ib add" data-act="desel" aria-label="Добавить ещё из библиотеки">${ic("plus", 18, "currentColor", 2.2)}<span>Ещё</span></button>
    ${pr.wall ? "" : `<button class="ib" data-it="rot" aria-label="Повернуть"${dis}>${ic("rot", 18)}</button>`}${isCont(pr) ? `<button class="ib ${it.open ? "on" : ""}" data-it="open" aria-pressed="${!!it.open}" aria-label="${it.open ? "Закрыть дверцы" : "Открыть дверцы"}">${ic("box", 18)}</button>` : ""}<button class="ib ${S.edit ? "on" : ""}" data-it="color" aria-pressed="${!!S.edit}" aria-label="Размер, цвет и материал">${ic("palette", 18)}</button><button class="ib ${it.locked ? "on" : ""}" data-it="lock" aria-pressed="${!!it.locked}" aria-label="${it.locked ? "Открепить предмет" : "Закрепить предмет, чтобы случайно не сдвинуть"}">${ic(it.locked ? "lock" : "unlock", 18)}</button><button class="ib" data-it="buy" aria-label="${pr.store === "base" ? "Похожие в магазинах" : "Где купить"}">${ic("tag", 18)}</button><button class="ib" data-it="del" aria-label="Удалить"${dis}>${ic("trash", 18, "#C4262E")}</button></div></div>` : "";
  return header(4) + tools() + (bad.size ? `<div class="float glass hint warn" style="top:64px">Предметы пересекаются или вылезли за стену</div>` : "") +
    (ed ? sheet(vEdH(it), vEditor(it), "", 20) : it ? sheet(212, dock, cta("Дальше: итог")) : sheet(440, lib, cta("Дальше: итог"))); }
const COLLS = [
  { t: "Уютный вечер", by: "Канал @ohmyprompts", items: ["garland", "rug-round", "pouf", "vase", "floorlamp"] },
  { t: "Спальня за выходные", by: "Подборка Wildberries", ad: "[партнёр]", items: ["bed-scandi", "night", "art1", "plant", "curtain"] },
  { t: "Рабочее место", by: "Подборка Ozon", items: ["desk", "chair", "wallshelf", "sconce"] },
  { t: "Гостиная в оливке", by: "Подборка Яндекс Маркета", items: ["sofa", "coffee", "rug", "armchair", "pendant"] }
];

function vStep5() { const r = S.room; const sum = r.items.reduce((a, i) => a + PROD[i.p].price, 0); const by = {}; for (const i of r.items) (by[PROD[i.p].store] = by[PROD[i.p].store] || []).push(i);
  return header(5) + tools() + sheet(520, `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px"><div><h1 class="h1">Итог</h1><p class="sub">${r.items.length} предм.${sum ? " · цены демо" : ""}</p></div><div style="text-align:right"><div class="t13">Всего</div><div style="font-size:24px;line-height:30px;font-weight:700">${sum ? rub(sum) : "—"}</div></div></div>
  <button class="cta ghost" data-act="walk" style="margin-top:12px;height:48px;font-size:15px">${ic("walk", 18)}Прогуляться по комнате</button>
  ${Object.entries(by).map(([s, its]) => `<div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between">${storeTag(s)}<span class="t13">${its.length} шт.${s === "base" ? "" : " · " + rub(its.reduce((a, i) => a + PROD[i.p].price, 0))}</span></div><div class="list">${its.map(i => `<button class="li" data-prod="${i.id}"><span class="thumb"><img src="${S.thumbs[i.p + ":" + (i.v || 0)]}" alt=""></span><span class="grow"><span class="t15" style="display:block">${PROD[i.p].n}</span><span class="t13">${colorName(i)} · ${dimTxt(i, PROD[i.p])}</span></span><span class="price">${PROD[i.p].base ? "" : rub(PROD[i.p].price)}</span></button>`).join("")}</div>${s === "base" ? `<p class="t13" style="margin:0 0 4px">Типовые вещи без магазина. Размеры и цвет указаны у каждой, по ним можно подобрать товар. Кнопка с ценником на шаге 4 покажет похожие в магазинах.</p>` : `<button class="link" data-act="cart" style="margin-top:0">Собрать корзину на ${ST[s]}</button>`}`).join("") || `<p class="sub">Комната пока пустая</p>`}`,
  `<div class="bottom" style="flex-direction:column"><div class="row"><button class="cta ghost" data-act="variant" style="flex:1;font-size:15px;height:48px">${ic("layers", 18)}Вариант</button><button class="cta ghost" data-act="share" style="flex:1;font-size:15px;height:48px">${ic("share", 18)}Поделиться</button></div><button class="cta" data-act="finish">Готово${ic("check", 18, "#FFFFFF", 2.4)}</button></div>`, 172); }

function vWalk() { setOffset(0); return `<div class="top"><button class="icb glass" data-act="walkexit" aria-label="Выйти из прогулки">${ic("x", 20, "#111114", 2.2)}</button><div class="prog glass">Прогулка · тап по полу — идти</div><button class="icb glass" data-act="night" aria-label="День или вечер">${ic(S.room.night ? "sun" : "moon", 20, "#111114", 1.8)}</button></div><div class="joy glass" id="joy" aria-label="Джойстик: идти"><i></i></div><div class="walkbar glass" role="toolbar" aria-label="Камера"><button data-act="wz-" aria-label="Отдалить: шире угол обзора">${ic("zout", 20, "currentColor", 1.9)}</button><div style="font-size:11px;line-height:14px;text-align:center;font-weight:600;color:#6B6E76" aria-hidden="true">${Math.round(walk.fov)}°</div><button data-act="wz+" aria-label="Приблизить: уже угол обзора">${ic("zin", 20, "currentColor", 1.9)}</button><button data-act="weye" aria-label="Высота глаз: стоя, сидя, сверху">${ic("eye", 20, "currentColor", 1.9)}</button></div>`; }
function vGuest() { const r = S.room; return `<div class="top"><button class="icb glass" data-act="home" aria-label="Закрыть">${ic("x", 20, "#111114", 2.2)}</button><div class="prog glass">Комната от @karolenok</div><span style="width:44px"></span></div>` + tools() + sheet(330, `<h1 class="h2 plain">${esc(r.name)}</h1><p class="sub">${fmt(area(r))} м² · ${r.items.length} предм.</p><div class="list" style="margin-top:8px">${r.items.map(i => `<button class="li" data-prod="${i.id}"><span class="thumb"><img src="${S.thumbs[i.p]}" alt=""></span><span class="grow t15">${PROD[i.p].n}</span>${storeTag(PROD[i.p].store)}</button>`).join("")}</div>`, cta("Сделать такую же у себя", "copyroom")); }

function vModal() { if (!S.modal) return ""; let b = "";
  if (S.modal === "product") { const it = S.room.items.find(i => i.id === S.sel) || S.room.items[0]; if (!it) return ""; const p = PROD[it.p]; const alts = CATALOG.filter(x => x.b === p.b && x.id !== p.id).concat(CATALOG.filter(x => x.cat === p.cat && x.b !== p.b)).filter(x => !x.mine && !x.base && (!p.base || x.b === p.b)).slice(0, 3);
    b = `<div style="height:220px;border-radius:24px;background:#F4F3F0;overflow:hidden;margin-top:4px"><img src="${S.thumbs[p.id + ":" + (it.v || 0)] || S.thumbs[p.id]}" alt="${esc(p.n)}" style="width:100%;height:100%;object-fit:contain"></div>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h2 class="h2 plain" style="margin:0">${p.n}</h2><div style="margin-top:6px;display:flex;gap:6px;align-items:center">${storeTag(p.store)}<span class="t13">${dimTxt(it, p)}</span></div></div>${p.base ? "" : `<div style="text-align:right"><div style="font-size:22px;line-height:28px;font-weight:700">${p.mine && !p.price ? "—" : rub(p.price)}</div><div class="t13" style="font-size:11px">${p.mine ? "твоя вещь" : "демо-цена"}</div></div>`}</div>
    <p class="cap" style="margin-top:20px">Цвет · ${colorName(it)}</p><div class="row">${p.vars.map((v, i) => `<button class="sw ${(it.v || 0) === i && !it.col && !isPh(it.mat) ? "on" : ""}" data-var="${i}" aria-label="${v[1]}"><i style="background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.6),rgba(255,255,255,0) 45%),${v[0]}"></i><span>${v[1]}</span></button>`).join("")}</div>
    ${it.col || isPh(it.mat) ? `<p class="t13" style="margin:8px 0 0">Свой цвет нужен для примерки. В магазине выбери ближайший вариант.</p>` : ""}${alts.length ? `<p class="cap">Похожие в магазинах</p>` : ""}<div class="row">${alts.map(x => `<button class="pc lg" data-swap="${x.id}" style="flex:1;min-width:0"><span class="im" style="height:72px"><img src="${S.thumbs[x.id]}" alt=""></span><b style="font-size:13px;line-height:16px">${x.n}</b><span class="price" style="padding:0 4px;font-size:13px">${rub(x.price)}</span></button>`).join("")}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:20px">${p.mine || p.base ? "" : `<a class="cta" href="#" data-act="store">Открыть на ${ST[p.store]}${ic("next", 18, "#FFFFFF", 2.2)}</a>`}<button class="cta ${p.mine || p.base ? "" : "ghost"}" data-act="closem">Закрыть</button></div>`; }
  if (S.modal === "paywall") b = `<div style="margin-top:8px;display:flex;align-items:center;gap:8px;color:var(--blue)">${ic("spark", 22)}<b style="font-size:15px">Pro</b></div><h2 style="margin:8px 0 0;font-size:28px;line-height:34px;font-weight:700">Сколько угодно вариантов</h2>
    <ul style="margin:16px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px;font-size:15px;line-height:20px">${["Варианты одной комнаты и сравнение", "Все комнаты квартиры", "Прогулка и вечерний свет без ограничений", "Шеринг без водяного знака"].map(x => `<li style="display:flex;gap:10px">${ic("check", 20, "#0058B8", 2.4)}${x}</li>`).join("")}</ul>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:24px"><button class="lg-sel" data-plan="m" style="border-radius:20px;padding:16px;text-align:left;display:flex;flex-direction:column;gap:4px"><span class="t13" style="color:inherit">Подписка</span><b style="font-size:22px;line-height:28px">150 ₽</b><span class="t13">в месяц</span></button><button class="lg" data-plan="o" style="border-radius:20px;padding:16px;text-align:left;display:flex;flex-direction:column;gap:4px"><span class="t13">Одна квартира</span><b style="font-size:22px;line-height:28px">[цена]</b><span class="t13">навсегда</span></button></div>
    <p class="t13" style="margin:12px 0 0">Тестируем, что купят охотнее. Оплата в прототипе ненастоящая.</p><div style="display:flex;flex-direction:column;gap:8px;margin-top:16px"><button class="cta" data-act="subscribe">Оформить Pro</button><button class="cta ghost" data-act="closem">Не сейчас</button></div>`;
  if (S.modal === "share") { const link = "t.me/[бот]/app?startapp=" + S.room.id; b = `<h2 class="h2" style="margin-top:8px">Поделиться комнатой</h2><p class="sub">По ссылке комнату можно покрутить, пройтись и скопировать себе. Менять — только тебе.</p>
    <img src="${S.room.snap || ""}" alt="" style="margin-top:16px;width:100%;height:190px;object-fit:cover;border-radius:24px;background:#E9E5DF">
    <div class="lg" style="margin-top:12px;border-radius:16px;padding:0 4px 0 14px;height:52px;display:flex;align-items:center;gap:8px"><span class="grow t13" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)">${esc(link)}</span><button class="icb" data-act="copylink" aria-label="Скопировать ссылку">${ic("copy", 20)}</button></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px"><button class="cta" data-act="guest">Посмотреть как гость${ic("next", 18, "#FFFFFF", 2.2)}</button><button class="cta ghost" data-act="closem">Закрыть</button></div>`; }
  return `<div class="overlay" data-act="closebg"><div class="modal" role="dialog" aria-modal="true"><button class="grabbtn" data-act="closem" aria-label="Закрыть"><i></i></button>${b}</div></div>`; }

/* ---------- рендер UI ---------- */
function render() {
  const showGL = S.screen !== "home"; host.style.visibility = showGL ? "visible" : "hidden";
  let v = "";
  if (S.walk) v = vWalk(); else v = { home: vHome, step1: vStep1, step2: vStep2, step3: vStep3, step4: vStep4, step5: vStep5, guest: vGuest }[S.screen]();
  if (S.screen === "home") setOffset(0);
  const ae = document.activeElement; const fq = ae && ae.dataset && ae.dataset.q !== undefined; const pos = fq ? ae.selectionStart : 0;
  $("#ui").innerHTML = v + vModal() + (S.onb !== null && S.onb !== undefined ? vOnb() : "") + (S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : "");
  $("#phone").classList.toggle("night", !!(S.room && S.room.night));
  if (fq) { const q = document.querySelector("[data-q]"); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  setSide(); bindDraw(); bindJoy(); updateSel(); highlightWall();
  const asl = document.querySelector("[data-slot].on"); if (asl) asl.scrollIntoView({ block: "nearest", inline: "center" });
  if (showGL && !walk.on) { controls.update(); renderer.render(scene, camera); }
  queueSave();
}
let tT; function toast(m) { clearTimeout(tT);
  if (S.walk) { const ui = $("#ui"); let t = ui.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); ui.appendChild(t); } t.textContent = m; tT = setTimeout(() => t.remove(), 2400); return; }
  S.toast = m; render(); tT = setTimeout(() => { S.toast = null; render(); }, 2400); }
function snap() { if (!S.room) return; renderer.render(scene, camera); S.room.snap = renderer.domElement.toDataURL("image/jpeg", .82); }
function rebuild(full = true) { if (!S.room) return; if (full) buildRoom(S.room); buildItems(S.room); }
function go(s, opts = {}) { if (S.screen !== "home" && S.room && s === "home") snap();
  S.screen = s; S.sel = null; S.selOpen = null; S.modal = null; S.collapsed = false; S.draw = null; S.edit = false; S.wmenu = false; S.open = null; S.openSill = null; S.plans = false; if (S.walk) { S.walk = false; stopWalk(); }
  if (S.room && stepNo() > 0) S.room.step = Math.max(S.room.step, stepNo());
  if (s !== "home") { rebuild(); S.camMode = s === "step2" ? "orbit" : "orbit"; frame(S.room, { az: S.room.az }); }
  render(); }
function updateSel() { const it = S.room && S.room.items.find(i => i.id === S.sel); const g = it && builtItems[it.id];
  if (!it || !g || S.walk) { selRing.visible = false; $("#hot").style.display = "none"; return; }
  const f = foot(it); const rad = Math.max(f.w, f.d) / 2 + .12; selRing.geometry.dispose(); selRing.geometry = new THREE.RingGeometry(rad, rad + .035, 64);
  selRing.position.set(it.x, .012, it.z); selRing.material.color.set(it.locked ? "#8A8D96" : "#3D8BFF"); selRing.visible = !PROD[it.p].wall; const hot = $("#hot"); hot.style.display = "flex"; hot.classList.toggle("lk", !!it.locked); hot.firstElementChild.innerHTML = it.locked ? ic("lock", 14, "#111114", 2.4) : ""; }
const box3 = new THREE.Box3();
function posHot() { const hot = $("#hot"); if (hot.style.display === "none") return; const it = S.room && S.room.items.find(i => i.id === S.sel); const g = it && builtItems[it.id]; if (!g) return;
  box3.setFromObject(g); const v = new THREE.Vector3((box3.min.x + box3.max.x) / 2, box3.max.y + .18, (box3.min.z + box3.max.z) / 2).project(camera);
  hot.style.left = ((v.x + 1) / 2 * host.clientWidth) + "px"; hot.style.top = ((1 - v.y) / 2 * host.clientHeight) + "px"; }
$("#hot").addEventListener("click", () => { S.modal = "product"; render(); });
function highlightWall() { for (const w of walls) { const sel = (S.screen === "step2" && w.userData.e.i === S.selWall) || (S.screen === "step3" && S.paint === "walls" && (S.paintWall === "all" || S.paintWall === w.userData.e.i));
  w.traverse(o => { if (o.isMesh && o.userData.wall !== undefined && o.material && o.material.isMeshStandardMaterial) { if (!o.userData.baseMat) o.userData.baseMat = o.material; if (sel && o.geometry.type === "BoxGeometry" && o.userData.baseMat.roughness > .85) { if (!o.userData.hiMat) { o.userData.hiMat = o.userData.baseMat.clone(); o.userData.hiMat.emissive = new THREE.Color("#3D8BFF"); o.userData.hiMat.emissiveIntensity = .18; } o.material = o.userData.hiMat; } else o.material = o.userData.baseMat; } }); } }

/* ---------- ввод в 3D ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
let press = null; const walkPtrs = new Map();
function setNdc(e) { const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
const isVis = o => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
renderer.domElement.addEventListener("pointerdown", e => {
  camAnim.on = false; if (S.wmenu) { S.wmenu = false; render(); }
  if (walk.on) { walkPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); renderer.domElement.setPointerCapture(e.pointerId);
    if (walkPtrs.size === 2) { const [a, b] = [...walkPtrs.values()]; press = { walk: 1, pinch: 1, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, fov0: walk.fov }; }
    else press = { walk: 1, x: e.clientX, y: e.clientY, yaw: walk.yaw, pitch: walk.pitch, moved: false }; return; }
  setNdc(e); press = { x: e.clientX, y: e.clientY, moved: false };
  if (S.screen === "step4") { const hits = ray.intersectObjects(itemsG.children, true); const h = hits.find(x => x.object.userData.item && isVis(x.object));
    if (h) { const it = S.room.items.find(i => i.id === h.object.userData.item); press.item = it;
      if (!it.locked) { press.ox = it.x; press.oz = it.z; press.lx = it.x; press.lz = it.z; ray.ray.intersectPlane(floorPlane, hitP); press.hx = hitP.x; press.hz = hitP.z; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); } } }
});
renderer.domElement.addEventListener("pointermove", e => {
  if (walk.on) { if (walkPtrs.has(e.pointerId)) walkPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!press) return;
    if (press.pinch) { if (walkPtrs.size >= 2) { const [a, b] = [...walkPtrs.values()]; setFov(press.fov0 * press.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1)); } return; }
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.moved = true;
    walk.yaw = press.yaw + (e.clientX - press.x) * .006; walk.pitch = clamp(press.pitch + (e.clientY - press.y) * .004, -1, 1); return; }
  if (!press) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.moved = true;
  if (press.item && !press.item.locked && press.moved) { setNdc(e); const it = press.item; const p = PROD[it.p]; const R = S.room;
    if (p.small) { // мелочь кладём на столешницу, если она под пальцем
      const hs = ray.intersectObjects(itemsG.children, true);
      const hh = hs.find(x => { const hid = x.object.userData.item; if (!hid || hid === it.id) return false; const hi = R.items.find(i => i.id === hid); return hi && !hi.on && topY(hi) > 0 && isVis(x.object); });
      if (hh) { const host = R.items.find(i => i.id === hh.object.userData.item); const f = foot(host);
        it.on = host.id; it.x = clamp(hh.point.x, host.x - f.w / 2 + .05, host.x + f.w / 2 - .05); it.z = clamp(hh.point.z, host.z - f.d / 2 + .05, host.z + f.d / 2 - .05);
        placeObj(builtItems[it.id], it, R); S.sel = it.id; updateSel(); return; }
      if (it.on) { it.on = null; press.lx = it.x; press.lz = it.z; } }
    if (!ray.ray.intersectPlane(floorPlane, hitP)) return; let nx = press.ox + hitP.x - press.hx, nz = press.oz + hitP.z - press.hz;
    const px0 = it.x, pz0 = it.z;
    if (p.wall) { it.x = nx; it.z = nz; snapWall(R, it); adaptWall(R, it); } else if (isFloor(p)) { const [qx, qz] = moveFloor(R, it, nx, nz, press.lx, press.lz); press.lx = qx; press.lz = qz; } else if (inside(R.pts, nx, nz)) { it.x = Math.round(nx * 20) / 20; it.z = Math.round(nz * 20) / 20; }
    const dx = it.x - px0, dz = it.z - pz0; // вещи на столешнице едут вместе со столом
    if (dx || dz) for (const q of R.items) if (q.on === it.id) { q.x += dx; q.z += dz; if (builtItems[q.id]) placeObj(builtItems[q.id], q, R); }
    placeObj(builtItems[it.id], it, R); S.sel = it.id; updateSel(); }
});
renderer.domElement.addEventListener("pointerup", e => {
  if (walk.on) { walkPtrs.delete(e.pointerId); const pr = press; if (walkPtrs.size === 0) press = null;
    if (pr && !pr.pinch && !pr.moved && walkPtrs.size === 0) { setNdc(e); if (ray.ray.intersectPlane(floorPlane, hitP) && canStand(S.room, hitP.x, hitP.z)) walk.goto = { x: hitP.x, z: hitP.z }; } return; }
  const pr = press; press = null; controls.enabled = true; if (!pr) return;
  if (pr.item) { if (pr.moved && PROD[pr.item.p].wall) buildItems(S.room); if (!pr.moved) S.sel = S.sel === pr.item.id ? null : pr.item.id; if (!S.sel) S.edit = false; render(); return; }
  if (pr.moved) return; setNdc(e);
  if (S.screen === "step4") {
    const wh = ray.intersectObjects(roomG.children, true).find(x => x.object.userData.open && isVis(x.object));
    if (wh) { const o = S.room.openings.find(q => q.id === wh.object.userData.open); if (o && o.type === "window") { S.openSill = o.id; S.open = null; S.sel = null; S.slot = "0"; render(); toast("Подоконник — можно что-то поставить"); return; } }
    if (S.sel) { S.sel = null; S.edit = false; render(); } return; }
  if (S.screen === "step2" || S.screen === "step3") { const hits = ray.intersectObjects(roomG.children, true); const h = hits.find(x => x.object.userData.wall !== undefined && isVis(x.object));
    if (h) { const u = h.object.userData, wi = u.wall;
      if (S.screen === "step2") { const had = S.selOpen; if (u.open) { const op = S.room.openings.find(x => x.id === u.open); S.selOpen = u.open; if (op) S.selWall = op.wall; } else { S.selWall = wi; S.selOpen = null; } if (had !== S.selOpen) buildRoom(S.room); }
      else { S.paint = "walls"; S.paintWall = wi; } render(); } }
});
renderer.domElement.addEventListener("pointercancel", e => { walkPtrs.delete(e.pointerId); press = null; controls.enabled = !walk.on; });
addEventListener("keydown", e => { walk.keys[e.code] = true; if (e.key === "Escape") { if (S.modal) { S.modal = null; render(); } else if (S.walk) { S.walk = false; stopWalk(); render(); } } });
addEventListener("keyup", e => { walk.keys[e.code] = false; });
let joyId = null, joyKnob = null;
addEventListener("pointerup", e => { if (e.pointerId === joyId) { joyId = null; walk.mv = [0, 0]; if (joyKnob) joyKnob.style.transform = ""; } });
addEventListener("pointercancel", e => { if (e.pointerId === joyId) { joyId = null; walk.mv = [0, 0]; } });
function bindJoy() { const j = $("#joy"); if (!j) return; const knob = j.firstElementChild; joyKnob = knob;
  j.addEventListener("pointerdown", e => { joyId = e.pointerId; j.setPointerCapture(e.pointerId); mv(e); });
  j.addEventListener("pointermove", e => { if (e.pointerId === joyId) mv(e); });
  function mv(e) { const r = j.getBoundingClientRect(); let dx = e.clientX - r.left - 60, dy = e.clientY - r.top - 60; const l = Math.hypot(dx, dy); if (l > 40) { dx *= 40 / l; dy *= 40 / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; walk.mv = [dx / 40, -dy / 40]; } }
function bindDraw() { const sv = $("#drawsvg"); if (!sv) return; sv.addEventListener("click", e => { const r = sv.getBoundingClientRect(); const x = Math.round(((e.clientX - r.left) - 35) / 40 * 4) / 4, z = Math.round(((e.clientY - r.top) - 90) / 40 * 4) / 4;
  if (x < 0 || z < 0 || x > 8 || z > 12) return; const d = S.draw; if (d.pts.length > 2 && Math.hypot(x - d.pts[0][0], z - d.pts[0][1]) < .4) { finishDraw(); return; }
  const last = d.pts[d.pts.length - 1]; if (last && last[0] === x && last[1] === z) return; d.pts.push([x, z]); render(); }); }
function finishDraw() { const pts = S.draw.pts; if (pts.length < 3) return; const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]); const mx = Math.min(...xs), mz = Math.min(...zs);
  S.room.pts = pts.map(p => [p[0] - mx, p[1] - mz]); S.room.shape = "custom"; S.room.openings = []; S.room.items = S.room.items.filter(i => inside(S.room.pts, i.x, i.z)); S.draw = null; rebuild(); frame(S.room); render(); }

/* ---------- размещение ---------- */
function place(pid) { const r = S.room, p = PROD[pid]; const it = { id: nid(), p: pid, v: 0, x: 0, z: 0, rot: 0 }; const [cx, cz, sx, sz] = center(r);
  if (p.mine && p.ar === "art") it.img = p.img; // своя картина: фото едет в рамку
  if (p.b === "curtain") { const E = edges(r); const wins = r.openings.filter(o => o.type === "window" || o.type === "balcony");
    const taken = new Set(r.items.filter(i => PROD[i.p].b === "curtain" && i.win).map(i => i.win));
    const win = wins.find(o => !taken.has(o.id)) || wins[0];
    if (!win) { it.noWin = 1; return it; }
    const e = E[win.wall]; if (!e) { it.noWin = 1; return it; }
    it.wallIdx = win.wall; it.win = win.id; it.x = e.a[0] + e.d[0] * win.pos; it.z = e.a[1] + e.d[1] * win.pos; it.ry = Math.atan2(e.n[0], e.n[1]); return it; }
  if (p.wall) { const E = edges(r); const used = r.items.filter(i => PROD[i.p].wall).length; const e = E[used % E.length]; const t = Math.min(e.len - p.w / 2, Math.max(p.w / 2, e.len / 2)); it.x = e.a[0] + e.d[0] * t; it.z = e.a[1] + e.d[1] * t; snapWall(r, it); return it; }
  if (p.ceil || p.flat) { it.x = cx; it.z = cz; return it; }
  let best = null; for (let z = .05; z < sz; z += .1) for (let x = .05; x < sx; x += .1) { it.x = x + p.w / 2; it.z = z + p.d / 2; r.items.push(it); const ok = okFloor(r, it); r.items.pop(); if (ok) { const dc = Math.hypot(it.x - cx, it.z - cz); const wallness = -Math.min(it.x, it.z, sx - it.x, sz - it.z); const score = wallness * 3 - dc * 0; if (!best || score > best.s) best = { s: score, x: it.x, z: it.z }; } }
  /* округляем до 5 см, но только если после округления место всё ещё свободно:
     у вещей с «фотографическими» размерами (0,55 / 0,9 м) округление раньше выталкивало их в стену */
  if (best) { it.x = Math.round(best.x * 20) / 20; it.z = Math.round(best.z * 20) / 20;
    r.items.push(it); const ok = okFloor(r, it); r.items.pop();
    if (!ok) { it.x = best.x; it.z = best.z; } } else { it.x = cx; it.z = cz; } return it; }

/* ---------- клики UI ---------- */
document.addEventListener("click", e => { const el = e.target.closest("button,a,[data-act]"); if (!el || !$("#phone").contains(el) && !el.dataset.jump) return; const d = el.dataset;
  if (d.act === "closebg" && e.target !== el) return; if (el.tagName === "A") e.preventDefault();
  if (d.jump) { jump(d.jump); return; }
  const r = S.room;
  switch (d.act) {
    case "new": S.room = newRoom(); S.rooms.unshift(S.room); go("step1"); return;
    case "home": go("home"); return;
    case "back": { const n = stepNo(); go(n <= 1 ? "home" : STEPS[n - 1]); return; }
    case "next": go(STEPS[stepNo() + 1]); return;
    case "collapse": S.collapsed = !S.collapsed; render(); return;
    case "full": S.full = !S.full; S.collapsed = false; render(); return;
    case "z+": zoomBy(.78); return;
    case "z-": zoomBy(1.28); return;
    case "plans": S.plans = !S.plans; render(); return;
    case "onbnext": if (S.onb < ONB.length - 1) { S.onb++; render(); } else onbDone(); return;
    case "onbskip": onbDone(); return;
    case "onbshow": S.onb = 0; render(); return;
    case "desel": S.sel = null; S.edit = false; render(); return;
    case "make": S.make = { img: null, ar: null, n: "", price: 0 }; S.edit = false; S.sel = null; render(); return;
    case "makeclose": S.make = null; render(); return;
    case "mkpick": if (S.make) { S.make.pick = true; render(); } return;
    case "makeadd": { const m = S.make; if (!m || !m.img || !m.ar) return;
      const a = ARC[m.ar]; const o = { id: "my" + nid(), n: (m.n || "").trim() || a.n, ar: m.ar, w: m.w, d: m.d, h: m.h, mode: m.mode, price: m.price || 0, img: m.img };
      const p = addMine(o); S.make = null; S.lib = "Моё";
      const nit = place(p.id); if (nit.noWin) { toast("Добавили в библиотеку"); render(); return; }
      r.items.push(nit); S.sel = nit.id; rebuild(false); if (p.wall) focusWall(nit.wallIdx);
      toast("«" + p.n + "» в комнате и в твоей библиотеке"); return; }
    case "insideclose": { if (S.open) { const o = r.items.find(i => i.id === S.open); if (o) o.open = false; } S.open = null; S.openSill = null; rebuild(false); frame(r, { az: curAz() }); render(); return; }
    case "cam-top": { const top = controls.getPolarAngle() < .3; camAnim.on = false; frame(r, top ? { az: curAz() } : { top: 1, az: curAz() }); S.wmenu = false; render(); return; }
    case "walls": S.wmenu = !S.wmenu; render(); return;
    case "rot-l": orbitBy(-Math.PI / 2); return;
    case "rot-r": orbitBy(Math.PI / 2); return;
    case "walk": S.walk = true; S.modal = null; S.wmenu = false; startWalk(); render(); toast("Тап по полу — перейти, щипок — приблизить"); return;
    case "wz+": setFov(walk.fov - 8); render(); return;
    case "wz-": setFov(walk.fov + 8); render(); return;
    case "weye": { const i = (EYES.findIndex(x => x[0] === walk.eye) + 1) % EYES.length; walk.eye = EYES[i][0]; walk.pitch = i === 2 ? -.5 : -.05; toast("Высота глаз " + fmt(walk.eye) + " м · " + EYES[i][1]); return; }
    case "lockall": { const all = r.items.every(i => i.locked); for (const i of r.items) i.locked = !all; toast(all ? "Предметы откреплены" : "Все предметы закреплены"); return; }
    case "posteroff": { const it = r.items.find(i => i.id === S.sel); if (it) { it.img = null; rebuild(false); } render(); return; }
    case "editdone": S.edit = false; render(); return;
    case "walkexit": S.walk = false; stopWalk(); render(); return;
    case "night": r.night = !r.night; applyLighting(r); render(); return;
    case "draw": S.draw = { pts: [] }; render(); return;
    case "drawcancel": S.draw = null; if (r.shape === "custom" && r.pts.length < 3) { r.shape = "rect"; r.pts = rectPts(r.L, r.W); } render(); return;
    case "drawundo": S.draw.pts.pop(); render(); return;
    case "drawdone": finishDraw(); return;
    case "finish": snap(); r.step = 6; S.screen = "step5"; go("home"); toast("Комната сохранена"); return;
    case "share": snap(); S.modal = "share"; render(); return;
    case "variant": if (!S.sub) { S.modal = "paywall"; render(); return; } snap(); { const c = JSON.parse(JSON.stringify(r)); c.id = nid(); c.name = r.name + " · вариант"; S.rooms.unshift(c); } toast("Вариант сохранён в «Мои комнаты»"); return;
    case "paywall": S.modal = "paywall"; render(); return;
    case "subscribe": S.sub = true; S.modal = null; toast("Pro подключён (демо)"); return;
    case "closem": case "closebg": S.modal = null; render(); return;
    case "guest": go("guest"); return;
    case "copyroom": { const c = JSON.parse(JSON.stringify(r)); c.id = nid(); c.name += " (копия)"; c.step = 1; S.room = c; S.rooms.unshift(c); go("step1"); toast("Скопировали комнату — поправь размеры под себя"); return; }
    case "copylink": try { navigator.clipboard.writeText("t.me/[бот]/app?startapp=" + r.id).then(() => toast("Ссылка скопирована"), () => toast("Не удалось скопировать")); } catch (_) { toast("Не удалось скопировать"); } return;
    case "store": toast("Здесь откроется товар по партнёрской ссылке"); return;
    case "cart": toast("Здесь соберём корзину на маркетплейсе (нужен API партнёра)"); return;
  }
  if (d.openRoom) { S.room = S.rooms.find(x => x.id === d.openRoom); go(STEPS[Math.min(5, S.room.step)]); return; }
  if (d.preset !== undefined) { S.room = presetRoom(+d.preset); S.rooms.unshift(S.room); go("step4"); toast("Это копия подборки — меняй как хочешь"); return; }
  if (d.type) { r.type = d.type; r.name = d.type; render(); return; }
  if (d.shape) { if (d.shape === "custom") { S.draw = { pts: [] }; render(); return; } r.shape = d.shape; r.pts = d.shape === "L" ? lPts(r.L, r.W) : rectPts(r.L, r.W); r.openings = []; rebuild(); frame(r); render(); return; }
  if (d.wsel !== undefined) { const had = S.selOpen; S.selWall = +d.wsel; S.selOpen = null; if (had) buildRoom(r); render(); return; }
  if (d.osel) { S.selOpen = d.osel; buildRoom(r); render(); return; }
  if (d.addOpen) { const e = edges(r)[S.selWall]; const D = OPD[d.addOpen].def; const o = { id: nid(), type: d.addOpen, wall: S.selWall, pos: e.len / 2, w: Math.min(D.w, e.len - .2) }; if (D.h) o.h = D.h; if (D.sill) o.sill = D.sill;
    if (d.addOpen !== "radiator" && r.openings.some(x => x.wall === o.wall && x.type !== "radiator" && Math.abs(x.pos - o.pos) < (x.w + o.w) / 2)) { const free = [o.w / 2 + .1, e.len - o.w / 2 - .1].find(p => !r.openings.some(x => x.wall === o.wall && x.type !== "radiator" && Math.abs(x.pos - p) < (x.w + o.w) / 2)); if (free === undefined) { toast("На этой стене нет места"); return; } o.pos = free; }
    r.openings.push(o); S.selOpen = o.id; rebuild(); render(); return; }
  if (d.op) { const o = r.openings.find(x => x.id === S.selOpen); if (!o) return; if (d.op === "del") r.openings = r.openings.filter(x => x !== o); S.selOpen = null; buildRoom(r); render(); return; }
  if (d.paint) { S.paint = d.paint; render(); return; }
  if (d.pw !== undefined) { S.paintWall = d.pw === "all" ? "all" : +d.pw; render(); return; }
  if (d.color) { if (S.paintWall === "all") { r.wallDefault = d.color; r.wallColors = {}; } else r.wallColors[S.paintWall] = d.color; rebuild(); render(); return; }
  if (d.floor) { r.floor = d.floor; rebuild(); render(); return; }
  if (d.lib) { S.lib = d.lib; render(); return; }
  if (d.etab) { S.etab = d.etab; render(); return; }
  if (d.store) { S.store = d.store; render(); return; }
  if (d.coll !== undefined) { const c = COLLS[+d.coll]; for (const pid of c.items) { const it = place(pid); r.items.push(it); } rebuild(false); render(); toast("Добавили подборку «" + c.t + "» — расставь как нравится"); return; }
  if (d.add) { const it = place(d.add); if (it.noWin) { toast("Сначала поставь окно на шаге 2 — штора вешается на него"); return; } r.items.push(it); S.sel = it.id; rebuild(false); if (PROD[d.add].wall) focusWall(it.wallIdx); render(); return; }
  if (d.it) { const it = r.items.find(i => i.id === S.sel); if (!it) return; const p = PROD[it.p];
    if (d.it === "color") { S.edit = !S.edit; if (S.edit) S.etab = null; render(); return; }
    if (d.it === "lock") { it.locked = !it.locked; toast(it.locked ? "Закреплено: не сдвинется случайно" : "Откреплено: можно двигать"); return; }
    if (d.it === "buy") { S.modal = "product"; render(); return; }
    if (d.it === "open") { it.open = !it.open; S.open = it.open ? it.id : null; S.openSill = null; S.slot = "0"; S.edit = false; rebuild(false); if (it.open) focusItem(r, it); else frame(r, { az: curAz() }); render(); if (it.open) toast("Полки открыты — выбери, что поставить"); return; }
    if (it.locked) { toast("Предмет закреплён. Нажми на замок, чтобы открепить"); return; }
    if (d.it === "del") { const riders = r.items.filter(i => i.on === it.id).length; r.items = r.items.filter(i => i !== it && i.on !== it.id); S.sel = null; S.edit = false; if (riders) toast("Убрали вместе с тем, что стояло сверху"); } else if (d.it === "rot") { const old = it.rot || 0, ox = it.x, oz = it.z; it.rot = (old + 1) % 4;
      if (isFloor(PROD[it.p]) && !findNear(r, it)) { it.rot = old; it.x = ox; it.z = oz; toast("Тут не хватает места для поворота"); }
      else { const dx = it.x - ox, dz = it.z - oz; for (const q of r.items) if (q.on === it.id) { const lx = q.x - ox, lz = q.z - oz; q.x = ox + dx + (old % 2 !== it.rot % 2 ? -lz : lx); q.z = oz + dz + (old % 2 !== it.rot % 2 ? lx : lz); } } }
    rebuild(false); render(); return; }
  if (d.prod) { S.sel = d.prod; S.modal = "product"; render(); return; }
  if (d.var !== undefined) { const it = r.items.find(i => i.id === S.sel); if (it) { it.v = +d.var; it.col = null; if (isPh(it.mat)) it.mat = null; rebuild(false); } render(); return; }
  if (d.ccol) { const it = r.items.find(i => i.id === S.sel); if (it) { it.col = d.ccol; if (isPh(it.mat)) it.mat = null; rebuild(false); } render(); return; }
  if (d.mat) { const it = r.items.find(i => i.id === S.sel); if (it) { it.mat = d.mat === "none" ? null : d.mat; rebuild(false); } render(); return; }
  if (d.wmode) { S.wallMode = d.wmode; S.wmenu = false; render(); return; }
  if (d.swap) { const it = r.items.find(i => i.id === S.sel); if (it) { it.p = d.swap; it.v = 0; it.col = null; it.mat = null; if (!PROD[d.swap].wall) { it.w = it.d = it.h = undefined; } if (PROD[d.swap].wall) snapWall(r, it); rebuild(false); } toast("Заменили на «" + PROD[d.swap].n + "»"); return; }
  if (d.mkar) { const a = ARC[d.mkar]; if (!a || !S.make) return; const keep = { img: S.make.img, n: S.make.n, price: S.make.price };
    S.make = { ...makeDefaults(d.mkar), ...keep, pick: false };
    if (S.make.mode === "cut" && S.make.img && !cutPhoto(S.make.img)) S.make.mode = primMode(a);
    render(); return; }
  if (d.mkmode) { if (S.make) { S.make.mode = d.mkmode; render(); } return; }
  if (d.mydel) { const p = PROD[d.mydel]; const n = p ? p.n : ""; dropMine(d.mydel); rebuild(false); toast(n ? "«" + n + "» удалили" : "Удалили"); return; }
  if (d.rsz !== undefined) { const it = r.items.find(i => i.id === S.sel); if (!it) return; const p = PROD[it.p]; const z = p.sizes[+d.rsz]; if (!z) return; const o = { w: it.w, d: it.d, h: it.h };
    it.w = z.w; it.d = z.d; if (z.h) it.h = z.h; if (isFloor(p) && !findNear(r, it)) { it.w = o.w; it.d = o.d; it.h = o.h; toast("Больше не помещается"); } else clampRiders(r, it);
    rebuild(false); render(); return; }
  if (d.rpre !== undefined) { const it = r.items.find(i => i.id === S.sel); if (!it) return; const p = PROD[it.p]; const old = it.w;
    it.w = +d.rpre; if (isFloor(p) && !findNear(r, it)) { it.w = old; toast("Больше не помещается"); } else clampRiders(r, it);
    rebuild(false); render(); return; }
  if (d.plan2 !== undefined) { const pr = PRESETS[+d.plan2].room; r.L = pr.L; r.W = pr.W; r.shape = "rect"; r.pts = rectPts(pr.L, pr.W);
    r.openings = pr.openings.map(o => Object.assign({ id: nid() }, o)); r.items = r.items.filter(i => inside(r.pts, i.x, i.z)); S.plans = false;
    rebuild(); frame(r); render(); toast("Планировка применена — размеры можно поправить"); return; }
  if (d.opcol) { r.opColor = d.opcol; rebuild(); render(); return; }
  if (d.drcol) { r.doorColor = d.drcol; rebuild(); render(); return; }
  if (d.slot) { S.slot = d.slot; render(); return; }
  if (d.into) { const sill = S.openSill ? r.openings.find(o => o.id === S.openSill) : null; const host = sill || r.items.find(i => i.id === S.open); if (!host) return;
    host.in = host.in || []; if (host.in.filter(q => String(q.s) === String(S.slot)).length >= 4) { toast("Тут уже тесно — убери что-нибудь"); return; }
    host.in.push({ p: d.into, v: 0, s: S.slot }); rebuild(!!sill); render(); return; }
  if (d.outof !== undefined) { const sill = S.openSill ? r.openings.find(o => o.id === S.openSill) : null; const host = sill || r.items.find(i => i.id === S.open);
    if (!host || !host.in) return; host.in.splice(+d.outof, 1); rebuild(!!sill); render(); return; }
  if (d.plan) { document.querySelectorAll("[data-plan]").forEach(b => { b.className = b === el ? "lg-sel" : "lg"; }); return; }
});
document.addEventListener("input", e => { const t = e.target;
  if (t.dataset.q !== undefined) { S.q = t.value; render(); return; }
  if (S.make) { const m = S.make;
    for (const k of ["w", "d", "h"]) if (t.dataset["mk" + k] !== undefined) { m[k] = Math.round(+t.value * 20) / 20;
      t.style.setProperty("--p", pct(+t.value, +t.min, +t.max) + "%");
      const out = document.querySelector("[data-mk" + k + "out]"); if (out) out.textContent = fmt(m[k]) + " м";
      const dv = document.querySelector("[data-mkderived]"); const C = m.img && cutPhoto(m.img);
      if (dv && C) dv.textContent = fmt(r05(k === "h" ? m.h / C.ar : m.w * C.ar));
      return; }
    if (t.dataset.mkname !== undefined) { m.n = t.value.slice(0, 48); return; }
    if (t.dataset.mkprice !== undefined) { m.price = Math.max(0, Math.min(9999999, parseInt(t.value.replace(/\D/g, ""), 10) || 0)); return; } }
  if (t.dataset.opf) { const r = S.room, o = r && r.openings.find(x => x.id === S.selOpen); if (!o) return; setOp(r, o, t.dataset.opf, +t.value); syncOpUI(o); scheduleRoom(); return; }
  if (t.dataset.rw !== undefined || t.dataset.rd !== undefined || t.dataset.rh !== undefined) { const r = S.room; const it = r.items.find(i => i.id === S.sel); if (!it) return;
    const key = t.dataset.rw !== undefined ? "w" : t.dataset.rd !== undefined ? "d" : "h"; const p = PROD[it.p]; const lim = key === "w" ? p.rsz : key === "d" ? p.rszD : p.hr; const old = it[key];
    it[key] = Math.round(+t.value * 20) / 20;
    if (isFloor(p) && !findNear(r, it)) { it[key] = old; t.value = old || p[key]; toast("Больше не помещается"); }
    t.style.setProperty("--p", pct(it[key] || p[key], lim[0], lim[1]) + "%");
    const out = document.querySelector("[data-r" + key + "out]"); if (out) out.textContent = fmt(it[key] || p[key]) + " м";
    clampRiders(r, it); scheduleItems(); return; }
  if (t.dataset.cust !== undefined) { const it = S.room.items.find(i => i.id === S.sel); if (!it) return; it.col = t.value; if (isPh(it.mat)) it.mat = null; scheduleItems(); return; }
  const k = t.dataset.dim; if (!k) return; const v = parseFloat(t.value.replace(",", ".")); if (!(v > 0)) return; const lim = k === "H" ? [2.2, 4] : [1.5, 10]; const r = S.room; r[k] = Math.max(lim[0], Math.min(lim[1], v));
  if (k !== "H") r.pts = r.shape === "L" ? lPts(r.L, r.W) : rectPts(r.L, r.W); r.openings = r.openings.filter(o => edges(r)[o.wall]); rebuild(); frame(r); });
document.addEventListener("focusout", e => { if (e.target.dataset && e.target.dataset.dim) render(); });
function clampRiders(r, host) { const f = foot(host); for (const q of r.items) if (q.on === host.id) {
    q.x = clamp(q.x, host.x - f.w / 2 + .05, host.x + f.w / 2 - .05); q.z = clamp(q.z, host.z - f.d / 2 + .05, host.z + f.d / 2 - .05); } }
let qRoom = false, qItems = false;
function scheduleRoom() { if (qRoom) return; qRoom = true; requestAnimationFrame(() => { qRoom = false; if (S.room) buildRoom(S.room); }); }
function scheduleItems() { if (qItems) return; qItems = true; requestAnimationFrame(() => { qItems = false; if (S.room) rebuild(false); }); }
document.addEventListener("change", e => { const t = e.target;
  if (t.dataset.mkph !== undefined) { const f = t.files && t.files[0]; if (!S.make) return;
    loadPhoto(f, id => { S.make.img = id; if (S.make.ar && !cutPhoto(id) && S.make.mode === "cut") S.make.mode = primMode(ARC[S.make.ar]); render(); },
      () => toast("Не получилось открыть фото. Нужен JPG или PNG до 20 МБ")); t.value = ""; return; }
  if (t.dataset.cust !== undefined || t.dataset.opf) { render(); return; }
  if (t.dataset.poster !== undefined) { const it = S.room.items.find(i => i.id === S.sel); const f = t.files && t.files[0]; if (!it) return;
    loadPhoto(f, id => { it.img = id; rebuild(false); render(); toast("Постер на месте"); }, () => toast("Не получилось открыть фото. Нужен JPG или PNG до 20 МБ")); t.value = ""; return; }
  if (t.dataset.photo !== undefined) { const it = S.room.items.find(i => i.id === S.sel); const f = t.files && t.files[0]; if (!it) return;
    loadPhoto(f, id => { it.mat = id; it.col = null; rebuild(false); render(); }, () => toast("Не получилось открыть фото. Нужен JPG или PNG до 20 МБ")); t.value = ""; } });

function jump(j) {
  if (j === "home") { go("home"); return; }
  if (!S.room || (["step4", "step5", "walk", "guest", "m-product", "m-share"].includes(j) && !S.room.items.length)) { S.room = presetRoom(1); S.rooms.unshift(S.room); }
  if (j === "walk") { if (S.screen === "home") go("step5"); S.walk = true; S.modal = null; startWalk(); render(); return; }
  if (j.startsWith("m-")) { if (!stepNo() && S.screen !== "guest") go("step4"); if (j === "m-product") S.sel = S.room.items[0].id; if (j === "m-share") snap(); S.modal = j.slice(2); render(); return; }
  go(j); }

/* ---------- миниатюры ---------- */
async function makeThumbs() {
  const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); tr.setSize(256, 256); tr.toneMapping = THREE.ACESFilmicToneMapping; tr.outputColorSpace = THREE.SRGBColorSpace;
  const ts = new THREE.Scene(); ts.environment = new THREE.PMREMGenerator(tr).fromScene(new RoomEnvironment(), .04).texture; ts.environmentIntensity = .9;
  ts.add(new THREE.HemisphereLight("#fff", "#B8A58C", 1)); const dl = new THREE.DirectionalLight("#fff", 1.6); dl.position.set(3, 5, 4); ts.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, .05, 50); const bx = new THREE.Box3(), sz = new THREE.Vector3(), cn = new THREE.Vector3();
  const shot = (g, key) => { ts.add(g); bx.setFromObject(g); bx.getSize(sz); bx.getCenter(cn); const R = Math.max(sz.x, sz.y, sz.z) * .5 + .05; const D = R / Math.sin(15 * Math.PI / 180) * 1.05;
    cam.position.set(cn.x + D * .58, cn.y + D * .45, cn.z + D * .68); cam.lookAt(cn); tr.render(ts, cam); S.thumbs[key] = tr.domElement.toDataURL("image/png"); ts.remove(g); };
  for (const p of CATALOG) { for (let i = 0; i < p.vars.length; i++) { const g = BUILD[p.b](p, p.vars[i][0], { H: 2.4 }); if (p.b === "pendant") g.position.y = -1.3; shot(g, i ? p.id + ":" + i : p.id); if (!i) S.thumbs[p.id + ":0"] = S.thumbs[p.id]; } await new Promise(r => setTimeout(r, 0)); }
  tr.dispose();
}
async function presetSnaps() { for (let i = 0; i < PRESETS.length; i++) { const r = presetRoom(i); S.room = r; buildRoom(r); buildItems(r); frame(r); setOffset(0); for (let k = 0; k < 3; k++) controls.update();
    updateWalls();
    renderer.render(scene, camera); S.snaps["p" + i] = renderer.domElement.toDataURL("image/jpeg", .85); }
  S.room = null; }

/* ---------- старт ---------- */
(async () => {
  resize(); await makeThumbs(); await loadMine(); await loadRooms(); await presetSnaps(); $("#loading").remove();
  try { if (localStorage.getItem(ONBKEY) !== "1") S.onb = 0; } catch (_) {}
  render(); tick();
  const h = location.hash.slice(1); if (h) jump(h); else render();
  window.APP = { THREE, frame, edges, builtItems, moveFloor, okFloor, adaptAll, buildItems, rebuild, PROD, S, jump, go, render, walk, camera, controls, cutPhoto, MY, ARC, addMine };
})();
