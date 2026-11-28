import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PALETTE } from './Graph';
import type { C, E, N } from './types';
import { navigateNodes } from './a11y';

type Props = { nodes: N[]; edges: E[]; clusters: C[]; selected: string | null; highlight: Set<string>; onSelect: (id: string | null) => void };
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const gauss = (s: string) => Math.sqrt(-2 * Math.log(hash(s + 'a') + 1e-9)) * Math.cos(2 * Math.PI * hash(s + 'b'));

/** Stars = notes (InstancedMesh, scales to ~10k), galaxies = clusters, glowing halos, orbit controls with slow drift. */
export default function Universe(props: Props) {
  const host = useRef<HTMLDivElement>(null), label = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const S = useRef<any>({}).current;

  useEffect(() => {
    const el = host.current!, w = () => el.clientWidth, h = () => el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w(), h()); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, w() / h(), 0.1, 2000); camera.position.set(0, 55, 190);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.06; controls.minDistance = 25; controls.maxDistance = 500;
    const group = new THREE.Group(); scene.add(group);
    const bg = new Float32Array(1800); for (let i = 0; i < 600; i++) { const r = 700 + hash('s' + i) * 500, t = hash('t' + i) * 6.283, u = hash('u' + i) * 2 - 1, q = Math.sqrt(1 - u * u); bg.set([r * q * Math.cos(t), r * u, r * q * Math.sin(t)], i * 3); }
    const bgGeo = new THREE.BufferGeometry(); bgGeo.setAttribute('position', new THREE.BufferAttribute(bg, 3)); scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ color: 0x6e7e78, size: 1.6, sizeAttenuation: false })));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d')!; const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(cv);
    Object.assign(S, { renderer, scene, camera, controls, group, glowTex, w, h, drift: true, down: null });

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const pd = (e: PointerEvent) => { S.down = { x: e.clientX, y: e.clientY }; S.drift = false; };
    const pu = (e: PointerEvent) => {
      if (!S.down || Math.hypot(e.clientX - S.down.x, e.clientY - S.down.y) > 4 || !S.mesh) { S.down = null; return; } S.down = null;
      const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera); const hit = ray.intersectObject(S.mesh)[0];
      P.current.onSelect(hit && hit.instanceId != null ? S.ids[hit.instanceId] : null);
    };
    renderer.domElement.addEventListener('pointerdown', pd); renderer.domElement.addEventListener('pointerup', pu);
    const ro = new ResizeObserver(() => { renderer.setSize(w(), h()); camera.aspect = w() / h(); camera.updateProjectionMatrix(); }); ro.observe(el);
    let raf = 0; const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop); if (S.drift && !reduced) group.rotation.y += 0.0006; controls.update(); renderer.render(scene, camera);
      const sel = P.current.selected, i = sel ? S.ids?.indexOf(sel) : -1;
      if (label.current) { if (i >= 0) { v.set(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]).applyMatrix4(group.matrixWorld).project(camera); label.current.style.cssText = `display:block;left:${(v.x * 0.5 + 0.5) * w()}px;top:${(-v.y * 0.5 + 0.5) * h() - 18}px`; label.current.textContent = P.current.nodes.find(n => n.id === sel)?.title || ''; } else label.current.style.display = 'none'; }
    };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener('pointerdown', pd); renderer.domElement.removeEventListener('pointerup', pu); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { // build stars, halos and edges whenever data changes
    if (!S.group) return; const { nodes, edges, clusters } = props, g: THREE.Group = S.group;
    [S.mesh, S.halo, S.lines, S.cons].forEach(o => { if (o) { g.remove(o); o.geometry.dispose(); } });
    const k = Math.max(clusters.length, 1), ci = new Map(clusters.map((c, i) => [c.id, i]));
    const centers = clusters.map((_, i) => { const y = 1 - (2 * (i + 0.5)) / k, r = Math.sqrt(1 - y * y), a = i * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y * 0.7, Math.sin(a) * r).multiplyScalar(78); });
    S.ids = nodes.map(n => n.id); S.pos = new Float32Array(nodes.length * 3);
    nodes.forEach((n, i) => { const c = centers[ci.get(n.cluster_id!) ?? 0] || new THREE.Vector3(); S.pos.set([c.x + gauss(n.id + 'x') * 11, c.y + gauss(n.id + 'y') * 11, c.z + gauss(n.id + 'z') * 11], i * 3); });
    S.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial(), nodes.length);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(S.pos, 3)); S.hcol = new Float32Array(nodes.length * 3); hg.setAttribute('color', new THREE.BufferAttribute(S.hcol, 3));
    S.halo = new THREE.Points(hg, new THREE.PointsMaterial({ size: 16, map: S.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    const seg = (pred: (e: E) => boolean, color: number, op: number) => { const a: number[] = []; edges.filter(pred).forEach(e => { const i = S.ids.indexOf(e.source), j = S.ids.indexOf(e.target); if (i >= 0 && j >= 0) a.push(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2], S.pos[j * 3], S.pos[j * 3 + 1], S.pos[j * 3 + 2]); }); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })); };
    S.lines = seg(e => e.type !== 'CONTRADICTS', 0x6e7e78, 0.22); S.cons = seg(e => e.type === 'CONTRADICTS', 0xff4d5a, 0.8);
    g.add(S.mesh, S.halo, S.lines, S.cons); S.ci = ci; recolor();
  }, [props.nodes, props.edges, props.clusters]);

  const recolor = () => { // selection / search highlight without rebuilding geometry
    const { nodes, selected, highlight } = P.current; if (!S.mesh) return; const m = new THREE.Matrix4(), c = new THREE.Color(), dim = highlight.size > 0;
    nodes.forEach((n, i) => {
      const sel = n.id === selected, hit = highlight.has(n.id), s = (0.9 + n.rank * 1.7) * (sel ? 1.9 : hit ? 1.4 : 1);
      m.compose(new THREE.Vector3(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); S.mesh.setMatrixAt(i, m);
      c.set(sel || hit ? '#D7FF64' : PALETTE[(S.ci.get(n.cluster_id) ?? 0) % 8]); if (dim && !hit && !sel) c.multiplyScalar(0.3); S.mesh.setColorAt(i, c);
      c.multiplyScalar(sel ? 1 : 0.55); S.hcol.set([c.r, c.g, c.b], i * 3);
    });
    S.mesh.instanceMatrix.needsUpdate = true; S.mesh.instanceColor!.needsUpdate = true; S.halo.geometry.attributes.color.needsUpdate = true;
  };
  useEffect(recolor, [props.selected, props.highlight, props.nodes]);

  return (<div ref={host} className="graph universe" tabIndex={0} role="application" aria-label="3D map of your notes. Use the arrow keys to move between notes, Home and End to jump, Escape to deselect." onKeyDown={e => navigateNodes(e.nativeEvent, P.current.nodes, P.current.clusters, P.current.selected, P.current.onSelect)}><div ref={label} className="ulabel" /></div>);
}
