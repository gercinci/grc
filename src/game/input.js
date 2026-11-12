// Klavye + fare + dokunmatik girişlerini tek bir durum nesnesinde toplar.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // tek seferlik eylemler
  const held = new Set();    // dokunmatik basılı tutulan düğmeler
  const joy = { x: 0, y: 0, active: false };
  let lookX = 0, lookY = 0;
  let enabled = false;

  const KEY_ACTIONS = { KeyF: 'interact', KeyE: 'interact', Enter: 'interact', KeyG: 'garage', Escape: 'menu', KeyP: 'menu', KeyM: 'menu', KeyL: 'lights', KeyR: 'reset', KeyC: 'camera' };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (!e.repeat && KEY_ACTIONS[e.code]) pressed.add(KEY_ACTIONS[e.code]);
    keys.add(e.code);
    if (enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); held.clear(); });

  // --- Fare: sürükleyerek veya işaretçi kilidiyle kamera ---
  let dragging = false;
  canvas.addEventListener('mousedown', (e) => {
    if (!enabled) return;
    dragging = true;
    if (e.button === 0 && !document.pointerLockElement) canvas.requestPointerLock?.()?.catch?.(() => {});
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!enabled) return;
    if (document.pointerLockElement === canvas || dragging) { lookX += e.movementX; lookY += e.movementY; }
  });

  // --- Dokunmatik: sol yarı joystick, sağ yarı kamera ---
  const joyEl = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  let joyTouch = null, lookTouch = null, joyOrigin = { x: 0, y: 0 }, lookLast = { x: 0, y: 0 };
  const JOY_R = 56;

  canvas.addEventListener('touchstart', (e) => {
    if (!enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joyTouch === null && t.clientX < window.innerWidth * 0.45) {
        joyTouch = t.identifier; joyOrigin = { x: t.clientX, y: t.clientY }; joy.active = true;
        joyEl.style.left = t.clientX + 'px'; joyEl.style.top = t.clientY + 'px'; joyEl.classList.add('on');
      } else if (lookTouch === null) { lookTouch = t.identifier; lookLast = { x: t.clientX, y: t.clientY }; }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouch) {
        let dx = t.clientX - joyOrigin.x, dy = t.clientY - joyOrigin.y;
        const len = Math.hypot(dx, dy);
        if (len > JOY_R) { dx *= JOY_R / len; dy *= JOY_R / len; }
        joy.x = dx / JOY_R; joy.y = -dy / JOY_R;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (t.identifier === lookTouch) {
        lookX += (t.clientX - lookLast.x) * 1.6; lookY += (t.clientY - lookLast.y) * 1.6;
        lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouch) { joyTouch = null; joy.x = joy.y = 0; joy.active = false; joyEl.classList.remove('on'); knob.style.transform = ''; }
      if (t.identifier === lookTouch) lookTouch = null;
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  // data-hold="throttle" (basılı tut) ve data-action="interact" (tek dokunuş) düğmeleri
  for (const el of document.querySelectorAll('[data-hold]')) {
    const name = el.dataset.hold;
    const on = (e) => { e.preventDefault(); held.add(name); el.classList.add('down'); };
    const off = (e) => { e.preventDefault(); held.delete(name); el.classList.remove('down'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  for (const el of document.querySelectorAll('[data-action]')) {
    el.addEventListener('click', (e) => { e.preventDefault(); pressed.add(el.dataset.action); el.blur(); });
  }

  const k = (...codes) => codes.some((c) => keys.has(c));
  const axis = (pos, neg) => (pos ? 1 : 0) - (neg ? 1 : 0);

  return {
    setEnabled(v) { enabled = v; if (!v) { keys.clear(); held.clear(); joy.x = joy.y = 0; document.exitPointerLock?.(); } },
    // Yürüme: x sağ(+), y ileri(+)
    move() {
      let x = axis(k('KeyD', 'ArrowRight'), k('KeyA', 'ArrowLeft')) + joy.x;
      let y = axis(k('KeyW', 'ArrowUp'), k('KeyS', 'ArrowDown')) + joy.y;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      return { x, y, run: k('ShiftLeft', 'ShiftRight') || held.has('run') || Math.hypot(joy.x, joy.y) > 0.92, jump: k('Space') || held.has('jump') };
    },
    // Sürüş
    drive() {
      const steer = Math.max(-1, Math.min(1, axis(k('KeyD', 'ArrowRight'), k('KeyA', 'ArrowLeft')) + joy.x));
      return {
        steer,
        throttle: k('KeyW', 'ArrowUp') || held.has('throttle') ? 1 : 0,
        brake: k('KeyS', 'ArrowDown') || held.has('brake') ? 1 : 0,
        handbrake: k('Space') || held.has('handbrake'),
        horn: k('KeyH') || held.has('horn'),
      };
    },
    consumeLook() { const r = { x: lookX, y: lookY }; lookX = lookY = 0; return r; },
    take(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    clearActions() { pressed.clear(); },
    get pointerLocked() { return document.pointerLockElement === canvas; },
  };
}
