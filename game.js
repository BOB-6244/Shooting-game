(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const scoreEl = document.getElementById('score');
  const currencyEl = document.getElementById('currency');
  const healthEl = document.getElementById('base-health');
  const waveEl = document.getElementById('wave-tag');
  const hintEl = document.getElementById('hint');
  const upgrades = { fireCost: 500, damageCost: 1000, autoCost: 2500, autoUnlocked: false, fireDelay: .15, damage: 10, sentries: [], airstrikeReadyAt: 0 };

  const state = { w: 0, h: 0, dpr: 1, running: false, over: false, score: 0, currency: 0, health: 100, gunY: 0, mouse: { x: 0, y: 0 }, keys: new Set(), mouseDown: false, enemies: [], bullets: [], particles: [], last: 0, spawn: 0, elapsed: 0, shotCooldown: 0, flash: 0, freezeUntil: 0 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = rect.width; state.h = rect.height;
    canvas.width = Math.round(rect.width * state.dpr); canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.gunY = clamp(state.gunY || state.h * .5, 40, state.h - 40);
    state.mouse.x = state.mouse.x || state.w * .75; state.mouse.y = state.mouse.y || state.h * .5;
    draw();
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - r.left; state.mouse.y = e.clientY - r.top;
  }

  function addEnemy() {
    const slime = Math.random() < .57;
    const size = rand(15, 23);
    state.enemies.push({ x: state.w + size + 5, y: rand(60, state.h - 45), baseY: rand(60, state.h - 45), r: size, hp: slime ? 24 : 38, maxHp: slime ? 24 : 38, speed: rand(22, 36) + Math.min(state.elapsed * .35, 25), phase: rand(0, Math.PI * 2), freq: slime ? rand(2.4, 3.7) : rand(.7, 1.2), amp: slime ? rand(24, 65) : rand(9, 23), type: slime ? 'slime' : 'zombie', tint: Math.random() < .5 ? 0 : 1 });
  }

  function fire() {
    if (!state.running || state.over || state.shotCooldown > 0) return;
    const ox = 83, oy = state.gunY;
    const a = Math.atan2(state.mouse.y - oy, state.mouse.x - ox);
    state.bullets.push({ x: ox + Math.cos(a) * 31, y: oy + Math.sin(a) * 31, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, life: 1.1, damage: upgrades.damage, owner: 'player' });
    state.shotCooldown = upgrades.fireDelay;
  }

  function purchase(cost) { if (state.currency < cost) return false; state.currency -= cost; return true; }
  function triggerUpgradeFlash(title, detail) {
    state.freezeUntil = performance.now() + 3000;
    const flash = document.getElementById('upgrade-flash');
    document.getElementById('upgrade-flash-title').textContent = title;
    document.getElementById('upgrade-flash-detail').textContent = detail;
    flash.classList.remove('show');
    void flash.offsetWidth;
    flash.classList.add('show');
    updateUI();
    window.clearTimeout(triggerUpgradeFlash.timer);
    triggerUpgradeFlash.timer = window.setTimeout(() => flash.classList.remove('show'), 3000);
  }
  document.getElementById('fire-upgrade').addEventListener('click', () => {
    if (!purchase(upgrades.fireCost)) return;
    upgrades.fireDelay *= .85; upgrades.fireCost = Math.ceil(upgrades.fireCost * 1.5); triggerUpgradeFlash('QUICKER CYCLE', 'SHOT DELAY REDUCED BY 15%');
  });
  document.getElementById('damage-upgrade').addEventListener('click', () => {
    if (!purchase(upgrades.damageCost)) return;
    upgrades.damage *= 1.5; upgrades.damageCost = Math.ceil(upgrades.damageCost * 1.75); triggerUpgradeFlash('HEAVY ROUNDS', 'PLAYER DAMAGE INCREASED BY 50%');
  });
  document.getElementById('auto-upgrade').addEventListener('click', () => {
    if (upgrades.autoUnlocked || !purchase(upgrades.autoCost)) return;
    upgrades.autoUnlocked = true; triggerUpgradeFlash('TRIGGER LOCK', 'HOLD-TO-FIRE ENABLED');
  });
  document.getElementById('sentry-upgrade').addEventListener('click', () => {
    if (upgrades.sentries.length >= 2 || !purchase(250)) return;
    const slot = upgrades.sentries.length;
    upgrades.sentries.push({ x: 112, y: state.h * (slot === 0 ? .39 : .61), life: 30, cooldown: .4 }); triggerUpgradeFlash('POCKET SENTRY', 'DEFENSE SUPPORT DEPLOYED');
  });
  document.getElementById('airstrike-upgrade').addEventListener('click', () => {
    if (upgrades.airstrikeReadyAt > state.elapsed || !purchase(3000)) return;
    upgrades.airstrikeReadyAt = state.elapsed + 120;
    for (const en of state.enemies) {
      const dealt = Math.min(100, en.hp); en.hp -= 100; awardDamage(dealt); burst(en.x, en.y, '#ffcb72', 12);
    }
    triggerUpgradeFlash('AIRSTRIKE', '100 DAMAGE TO ALL ON-SCREEN ENEMIES'); draw();
  });

  canvas.addEventListener('pointermove', pointer);
  canvas.addEventListener('pointerdown', (e) => { pointer(e); state.mouseDown = true; fire(); });
  window.addEventListener('pointerup', () => { state.mouseDown = false; });
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (['a', 'd', 'arrowup', 'arrowdown'].includes(key)) e.preventDefault();
    state.keys.add(key);
  });
  window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => state.keys.clear());
  document.getElementById('start-button').addEventListener('click', () => {
    if (state.over) reset();
    state.running = true; overlay.classList.add('hidden'); hintEl.style.display = 'block'; state.last = performance.now(); requestAnimationFrame(frame);
  });
  hintEl.style.display = 'none';
  window.addEventListener('resize', resize);

  function reset() {
    Object.assign(state, { score: 0, currency: 0, health: 100, enemies: [], bullets: [], particles: [], elapsed: 0, spawn: 0, over: false, mouseDown: false });
    Object.assign(upgrades, { fireCost: 500, damageCost: 1000, autoCost: 2500, autoUnlocked: false, fireDelay: .15, damage: 10, sentries: [], airstrikeReadyAt: 0 });
    updateUI(); overlay.querySelector('h1').textContent = 'Hold the line.';
    overlay.querySelector('.intro-card p').innerHTML = 'A / ↑ and D / ↓ move the gun.<br />Aim with your cursor. Click to fire.';
    document.getElementById('start-button').innerHTML = 'START DEFENDING <span>→</span>'; updateUI();
  }

  function updateUI() {
    scoreEl.textContent = state.score.toLocaleString(); currencyEl.textContent = state.currency.toLocaleString(); healthEl.textContent = `${state.health}%`;
    healthEl.style.color = state.health <= 35 ? '#ff806a' : '';
    const wave = Math.floor(state.elapsed / 30) + 1; waveEl.innerHTML = `WAVE ${String(wave).padStart(2, '0')} <span>·</span> ${wave === 1 ? 'FIRST CONTACT' : 'PRESSURE RISING'}`;
    const canShop = state.freezeUntil <= performance.now();
    const setCard = (id, enabled, priceText) => { const el = document.getElementById(id); el.disabled = !enabled || !canShop; if (priceText) el.querySelector('.upgrade-price').textContent = priceText; };
    document.getElementById('fire-price').textContent = `${upgrades.fireCost.toLocaleString()} ✦`;
    document.getElementById('damage-price').textContent = `${upgrades.damageCost.toLocaleString()} ✦`;
    setCard('fire-upgrade', state.currency >= upgrades.fireCost, `${upgrades.fireCost.toLocaleString()} ✦`);
    setCard('damage-upgrade', state.currency >= upgrades.damageCost, `${upgrades.damageCost.toLocaleString()} ✦`);
    setCard('auto-upgrade', !upgrades.autoUnlocked && state.currency >= upgrades.autoCost, upgrades.autoUnlocked ? 'UNLOCKED' : `${upgrades.autoCost.toLocaleString()} ✦`);
    document.getElementById('sentry-count').textContent = `${upgrades.sentries.length}/2`;
    setCard('sentry-upgrade', upgrades.sentries.length < 2 && state.currency >= 250, upgrades.sentries.length >= 2 ? 'MAX ACTIVE' : '250 ✦');
    const airReady = upgrades.airstrikeReadyAt <= state.elapsed;
    const remaining = Math.ceil(upgrades.airstrikeReadyAt - state.elapsed);
    setCard('airstrike-upgrade', airReady && state.currency >= 3000, airReady ? '3,000 ✦' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
    hintEl.innerHTML = upgrades.autoUnlocked ? 'A / ↑ UP <span>•</span> D / ↓ DOWN <span>•</span> HOLD CLICK TO FIRE' : 'A / ↑ UP <span>•</span> D / ↓ DOWN <span>•</span> CLICK TO FIRE';
  }

  function awardDamage(amount) { if (amount <= 0) return; const credit = Math.floor(amount); state.score += credit; state.currency += credit; }

  function frame(now) {
    if (!state.running) return;
    if (state.freezeUntil > now) { state.last = now; draw(); requestAnimationFrame(frame); return; }
    if (state.freezeUntil) { state.freezeUntil = 0; updateUI(); }
    const dt = Math.min((now - state.last) / 1000 || 0, .033); state.last = now; state.elapsed += dt;
    const up = state.keys.has('a') || state.keys.has('arrowup');
    const down = state.keys.has('d') || state.keys.has('arrowdown');
    state.gunY = clamp(state.gunY + ((down ? 1 : 0) - (up ? 1 : 0)) * 300 * dt, 32, state.h - 32);
    if (state.mouseDown && upgrades.autoUnlocked) fire();
    state.spawn -= dt; state.shotCooldown -= dt; state.flash = Math.max(0, state.flash - dt * 2.5);
    const interval = Math.max(.45, 1.55 - state.elapsed * .008);
    if (state.spawn <= 0) { addEnemy(); state.spawn = interval * rand(.65, 1.2); }
    for (const b of state.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    state.bullets = state.bullets.filter(b => b.life > 0 && b.x < state.w + 20 && b.y > -20 && b.y < state.h + 20);
    for (const en of state.enemies) { en.x -= en.speed * dt; en.y = clamp(en.baseY + Math.sin(state.elapsed * en.freq + en.phase) * en.amp, 42, state.h - 32); }
    for (const b of state.bullets) {
      if (b.hit) continue;
      for (const en of state.enemies) {
        if (Math.hypot(b.x - en.x, b.y - en.y) < en.r + 5) {
          b.hit = true; const dealt = Math.min(en.hp, b.damage); en.hp -= b.damage; awardDamage(dealt); state.flash = .25;
          burst(b.x, b.y, '#d9ff91', 5);
          if (en.hp <= 0) burst(en.x, en.y, en.type === 'slime' ? '#a7e96e' : '#dd806c', 14);
          break;
        }
      }
    }
    state.bullets = state.bullets.filter(b => !b.hit);
    for (const sentry of upgrades.sentries) {
      sentry.life -= dt; sentry.cooldown -= dt;
      if (sentry.cooldown <= 0 && state.enemies.length) {
        const target = state.enemies.reduce((nearest, en) => !nearest || Math.hypot(en.x - sentry.x, en.y - sentry.y) < Math.hypot(nearest.x - sentry.x, nearest.y - sentry.y) ? en : nearest, null);
        const angle = Math.atan2(target.y - sentry.y, target.x - sentry.x);
        state.bullets.push({ x: sentry.x + Math.cos(angle) * 15, y: sentry.y + Math.sin(angle) * 15, vx: Math.cos(angle) * 520, vy: Math.sin(angle) * 520, life: 1.3, damage: 5, owner: 'sentry' });
        sentry.cooldown = upgrades.fireDelay;
      }
    }
    upgrades.sentries = upgrades.sentries.filter(s => s.life > 0);
    state.enemies = state.enemies.filter(en => { if (en.hp <= 0) return false; if (en.x < 22) { state.health = Math.max(0, state.health - (en.type === 'zombie' ? 14 : 9)); return false; } return true; });
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= .96; p.vy *= .96; }
    state.particles = state.particles.filter(p => p.life > 0);
    updateUI(); draw();
    if (state.health <= 0) { endGame(); return; }
    requestAnimationFrame(frame);
  }

  function burst(x, y, color, count) { for (let i = 0; i < count; i++) { const a = rand(0, Math.PI * 2), s = rand(35, 150); state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.2, .5), max: .5, color, r: rand(1, 3) }); } }

  function draw() {
    const w = state.w, h = state.h; if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#222b22'); grad.addColorStop(.55, '#19221a'); grad.addColorStop(1, '#1b241d'); ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(210,230,194,.045)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // Faint lane guides and floor
    for (let i = 1; i <= 4; i++) { const y = h * i / 5; ctx.setLineDash([3, 9]); ctx.strokeStyle = 'rgba(197,243,107,.075)'; ctx.beginPath(); ctx.moveTo(120, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = '#141a15'; ctx.fillRect(0, h - 27, w, 27); ctx.fillStyle = '#29352a'; ctx.fillRect(0, h - 28, w, 2);
    // Defensive wall glow
    const wall = ctx.createLinearGradient(0, 0, 35, 0); wall.addColorStop(0, 'rgba(197,243,107,.28)'); wall.addColorStop(1, 'rgba(197,243,107,0)'); ctx.fillStyle = wall; ctx.fillRect(0, 0, 35, h);
    ctx.strokeStyle = 'rgba(197,243,107,.35)'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(18, h); ctx.stroke();
    for (const en of state.enemies) drawEnemy(en);
    for (const sentry of upgrades.sentries) drawSentry(sentry);
    for (const b of state.bullets) { const color = b.owner === 'sentry' ? '#93c8ff' : '#dfffab'; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 13; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = color + '66'; ctx.beginPath(); ctx.moveTo(b.x - b.vx * .025, b.y - b.vy * .025); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (const p of state.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    drawGun(); drawCrosshair();
    if (state.flash) { ctx.fillStyle = `rgba(197,243,107,${state.flash * .08})`; ctx.fillRect(0, 0, w, h); }
  }

  function drawEnemy(en) {
    const x = en.x, y = en.y, r = en.r, slime = en.type === 'slime';
    ctx.save(); ctx.translate(x, y);
    if (slime) {
      const c = en.tint ? '#a8d879' : '#80c878'; ctx.shadowColor = c; ctx.shadowBlur = 16;
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r, r * .38); ctx.quadraticCurveTo(-r * .95, -r * .65, -r * .25, -r * .58); ctx.quadraticCurveTo(r * .05, -r * 1.05, r * .32, -r * .52); ctx.quadraticCurveTo(r * 1.05, -r * .4, r, r * .38); ctx.quadraticCurveTo(0, r * .82, -r, r * .38); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#203322'; ctx.beginPath(); ctx.arc(-r * .34, 0, 2.2, 0, 7); ctx.arc(r * .34, 0, 2.2, 0, 7); ctx.fill();
    } else {
      ctx.shadowColor = '#d78168'; ctx.shadowBlur = 12; ctx.fillStyle = '#c67864'; ctx.beginPath(); ctx.arc(0, -r * .34, r * .42, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#6d5144'; ctx.beginPath(); ctx.roundRect(-r * .58, -r * .08, r * 1.16, r * 1.18, r * .35); ctx.fill();
      ctx.fillStyle = '#ddd0ae'; ctx.fillRect(-r * .36, -r * .44, r * .13, 2); ctx.fillRect(r * .23, -r * .44, r * .13, 2);
      ctx.strokeStyle = '#332d27'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-r * .19, -r * .12); ctx.lineTo(r * .2, -r * .12); ctx.stroke();
    }
    ctx.restore();
    const bw = r * 1.65, bh = 3; ctx.fillStyle = '#111710'; ctx.fillRect(x - bw / 2, y - r - 10, bw, bh); ctx.fillStyle = en.hp / en.maxHp > .5 ? '#c5f36b' : '#f08b71'; ctx.fillRect(x - bw / 2, y - r - 10, bw * clamp(en.hp / en.maxHp, 0, 1), bh);
  }

  function drawGun() {
    const ox = 76, oy = state.gunY, a = Math.atan2(state.mouse.y - oy, state.mouse.x - ox);
    ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(5, 17, 35, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#52614a'; ctx.beginPath(); ctx.arc(0, 0, 19, 0, 7); ctx.fill(); ctx.strokeStyle = '#a9c17b'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(a); ctx.fillStyle = '#c3d19f'; ctx.beginPath(); ctx.roundRect(-1, -7, 42, 14, 5); ctx.fill(); ctx.fillStyle = '#7d8c69'; ctx.fillRect(10, -3, 25, 6); ctx.fillStyle = '#dff5ae'; ctx.fillRect(34, -2, 10, 4); ctx.fillStyle = '#889578'; ctx.beginPath(); ctx.roundRect(5, 6, 11, 15, 3); ctx.fill(); ctx.restore();
  }

  function drawSentry(s) {
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.fillStyle = '#263545'; ctx.strokeStyle = '#93c8ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const target = state.enemies.reduce((nearest, en) => !nearest || Math.hypot(en.x - s.x, en.y - s.y) < Math.hypot(nearest.x - s.x, nearest.y - s.y) ? en : nearest, null);
    const angle = target ? Math.atan2(target.y - s.y, target.x - s.x) : 0;
    ctx.rotate(angle); ctx.fillStyle = '#b6d9f5'; ctx.beginPath(); ctx.roundRect(0, -3, 20, 6, 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#111710'; ctx.fillRect(s.x - 13, s.y + 16, 26, 3); ctx.fillStyle = '#93c8ff'; ctx.fillRect(s.x - 13, s.y + 16, 26 * clamp(s.life / 30, 0, 1), 3);
  }

  function drawCrosshair() { const { x, y } = state.mouse; ctx.save(); ctx.strokeStyle = 'rgba(225,245,196,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.moveTo(x - 13, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 13, y); ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 13); ctx.stroke(); ctx.restore(); }

  function endGame() {
    state.running = false; state.over = true; hintEl.style.display = 'none';
    overlay.querySelector('h1').textContent = 'Line breached.';
    overlay.querySelector('.intro-card p').innerHTML = `You held out for ${Math.floor(state.elapsed)} seconds.<br />${state.score} damage dealt · ${state.currency} credits earned`;
    document.getElementById('start-button').innerHTML = 'TRY AGAIN <span>↻</span>'; overlay.classList.remove('hidden');
  }

  resize(); updateUI(); draw();
})();
