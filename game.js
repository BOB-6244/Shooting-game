(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const scoreEl = document.getElementById('score');
  const currencyEl = document.getElementById('currency');
  const healthEl = document.getElementById('base-health');
  const waveEl = document.getElementById('wave-tag');
  const hintEl = document.getElementById('hint');
  const upgrades = { fireCost: 500, damageCost: 1000, firePurchases: 0, damagePurchases: 0, healUnlocked: false, autoCost: 2500, autoUnlocked: false, fireDelay: .5, damage: 20, sentries: [], airstrikeReadyAt: 0 };

  const state = { w: 0, h: 0, dpr: 1, running: false, paused: false, over: false, reviveUsed: false, score: 0, currency: 0, health: 100, healAccumulator: 0, gunY: 0, mouse: { x: 0, y: 0 }, keys: new Set(), mouseDown: false, enemies: [], bullets: [], hostileShots: [], particles: [], floatingTexts: [], last: 0, spawn: 0, elapsed: 0, shotCooldown: 0, flash: 0, freezeUntil: 0, lastBossWave: 0 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function arenaShotLifetime(x, y, speed) {
    const farthestCorner = Math.max(
      Math.hypot(x, y), Math.hypot(state.w - x, y),
      Math.hypot(x, state.h - y), Math.hypot(state.w - x, state.h - y)
    );
    return farthestCorner / speed + .15;
  }
  function closenessMultiplier(targetX) {
    const span = Math.max(1, state.w - 83);
    return 1 + clamp(1 - (targetX - 83) / span, 0, 1);
  }
  function makeBullet(x, y, angle, damage, baseSpeed, targetX, owner) {
    const multiplier = closenessMultiplier(targetX);
    const speed = baseSpeed * multiplier;
    return { x, y, startX: x, startY: y, dirX: Math.cos(angle), dirY: Math.sin(angle), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed, baseSpeed: speed, damage: damage * multiplier, life: arenaShotLifetime(x, y, speed * .35), travelled: 0, travelDistance: Math.max(state.w, state.h) * 1.2, owner };
  }
  function isHeadshot(bullet, enemy) {
    const r = enemy.r;
    let eyes;
    if (enemy.type === 'slime') eyes = [[enemy.x - r * .34, enemy.y], [enemy.x + r * .34, enemy.y]];
    else if (enemy.type === 'zombie') eyes = [[enemy.x - r * .295, enemy.y - r * .44], [enemy.x + r * .295, enemy.y - r * .44]];
    else eyes = [[enemy.x - r * .18, enemy.y - r * .16], [enemy.x + r * .18, enemy.y - r * .16]];
    const radius = Math.max(5, r * .13);
    return eyes.some(([x, y]) => Math.hypot(bullet.x - x, bullet.y - y) <= radius);
  }

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
    const baseHp = slime ? 24 : 38;
    const scaledHp = baseHp * waveHealthMultiplier();
    state.enemies.push({ x: state.w + size + 5, y: rand(60, state.h - 45), baseY: rand(60, state.h - 45), r: size, hp: scaledHp, maxHp: scaledHp, speed: rand(22, 36) + Math.min(state.elapsed * .35, 25), phase: rand(0, Math.PI * 2), freq: slime ? rand(2.4, 3.7) : rand(.7, 1.2), amp: slime ? rand(24, 65) : rand(9, 23), type: slime ? 'slime' : 'zombie', tint: Math.random() < .5 ? 0 : 1 });
  }

  function currentWave() { return Math.floor(state.elapsed / 30) + 1; }
  function waveHealthMultiplier() { return 1.1 ** (currentWave() - 1); }
  function addBoss(wave) {
    const baseHp = 250;
    const scaledHp = baseHp * 1.1 ** (wave - 1);
    const gasBoss = wave === 10;
    state.enemies.push({ x: state.w + 65, y: state.h * .5, baseY: state.h * .5, r: gasBoss ? 54 : 42, hp: scaledHp, maxHp: scaledHp, speed: 19 + wave * 1.2, phase: rand(0, Math.PI * 2), freq: 1.15, amp: Math.min(state.h * .19, 75), type: gasBoss ? 'gasBoss' : 'boss', tint: 0, shotCooldown: 1.5 });
    burst(state.w - 28, state.h * .5, gasBoss ? '#ff9c43' : '#ff7868', 20);
  }

  function fire() {
    if (!state.running || state.over || state.shotCooldown > 0) return;
    const ox = 83, oy = state.gunY;
    const a = Math.atan2(state.mouse.y - oy, state.mouse.x - ox);
    const startX = ox + Math.cos(a) * 31, startY = oy + Math.sin(a) * 31;
    state.bullets.push(makeBullet(startX, startY, a, upgrades.damage, 1200, state.mouse.x, 'player'));
    state.shotCooldown = upgrades.fireDelay;
  }

  function fireGasProjectile(boss) {
    const targetX = 83, targetY = state.gunY;
    const dx = targetX - boss.x, dy = targetY - boss.y;
    state.hostileShots.push({ x: boss.x - 8, y: boss.y, targetX, targetY, vx: dx / 5, vy: dy / 5, life: 5, hp: 1, r: 9 });
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
    triggerUpgradeFlash.timer = window.setTimeout(() => { flash.classList.remove('show'); updateUI(); }, 3000);
  }
  document.getElementById('fire-upgrade').addEventListener('click', () => {
    if (upgrades.firePurchases >= 5 || !purchase(upgrades.fireCost)) return;
    upgrades.firePurchases++; upgrades.fireDelay *= .85; upgrades.fireCost = Math.ceil(upgrades.fireCost * 1.5); triggerUpgradeFlash('QUICKER CYCLE', 'SHOT DELAY REDUCED BY 15%');
  });
  document.getElementById('damage-upgrade').addEventListener('click', () => {
    if (upgrades.damagePurchases >= 5 || !purchase(upgrades.damageCost)) return;
    upgrades.damagePurchases++; upgrades.damage *= 1.5; upgrades.damageCost = Math.ceil(upgrades.damageCost * 1.75); triggerUpgradeFlash('HEAVY ROUNDS', 'PLAYER DAMAGE INCREASED BY 50%');
  });
  document.getElementById('auto-upgrade').addEventListener('click', () => {
    if (upgrades.autoUnlocked || !purchase(upgrades.autoCost)) return;
    upgrades.autoUnlocked = true; triggerUpgradeFlash('TRIGGER LOCK', 'HOLD-TO-FIRE ENABLED');
  });
  document.getElementById('heal-upgrade').addEventListener('click', () => {
    if (upgrades.healUnlocked || !purchase(1000)) return;
    upgrades.healUnlocked = true; triggerUpgradeFlash('REPAIR MATRIX', 'BASE REGENERATES 1% HEALTH PER SECOND');
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
  const pauseButton = document.getElementById('pause-button');
  pauseButton.addEventListener('click', () => {
    if (!state.running || state.over) return;
    state.paused = !state.paused; state.last = performance.now(); updatePauseUI();
  });
  document.getElementById('start-button').addEventListener('click', () => {
    if (state.over) reset();
    state.running = true; state.paused = false; overlay.classList.add('hidden'); hintEl.style.display = 'block'; state.last = performance.now(); updatePauseUI(); requestAnimationFrame(frame);
  });
  document.getElementById('revive-button').addEventListener('click', () => {
    if (!state.over || state.reviveUsed || state.currency < 5000) return;
    state.currency -= 5000; state.health = 50; state.reviveUsed = true; state.over = false; state.running = true; state.paused = false;
    overlay.classList.add('hidden'); hintEl.style.display = 'block'; state.last = performance.now(); updateUI(); updatePauseUI(); requestAnimationFrame(frame);
  });
  hintEl.style.display = 'none';
  window.addEventListener('resize', resize);

  function reset() {
    Object.assign(state, { score: 0, currency: 0, health: 100, healAccumulator: 0, enemies: [], bullets: [], hostileShots: [], particles: [], floatingTexts: [], elapsed: 0, over: false, paused: false, reviveUsed: false, mouseDown: false, lastBossWave: 0, freezeUntil: 0 });
    Object.assign(upgrades, { fireCost: 500, damageCost: 1000, firePurchases: 0, damagePurchases: 0, healUnlocked: false, autoCost: 2500, autoUnlocked: false, fireDelay: .5, damage: 20, sentries: [], airstrikeReadyAt: 0 });
    updateUI(); overlay.querySelector('h1').textContent = 'Hold the line.';
    overlay.querySelector('.intro-card p').innerHTML = 'A / ↑ and D / ↓ move the gun.<br />Aim with your cursor. Click to fire.';
    document.getElementById('start-button').innerHTML = 'START DEFENDING <span>→</span>'; updateUI();
  }

  function updateUI() {
    scoreEl.textContent = state.score.toLocaleString(); currencyEl.textContent = state.currency.toLocaleString(); healthEl.textContent = `${state.health}%`;
    healthEl.style.color = state.health <= 35 ? '#ff806a' : '';
    const wave = currentWave();
    const waveLabel = wave % 5 === 0 ? 'BOSS WAVE' : wave === 1 ? 'FIRST CONTACT' : 'PRESSURE RISING';
    waveEl.innerHTML = `WAVE ${String(wave).padStart(2, '0')} <span>·</span> ${waveLabel}`;
    const roundsToBoss = 5 - (wave % 5);
    document.getElementById('boss-count').textContent = roundsToBoss === 0 ? 'BOSS WAVE' : `BOSS IN ${roundsToBoss} WAVES`;
    const canShop = state.freezeUntil <= performance.now();
    const setCard = (id, enabled, priceText) => { const el = document.getElementById(id); el.disabled = !enabled || !canShop; if (priceText) el.querySelector('.upgrade-price').textContent = priceText; };
    document.getElementById('fire-price').textContent = `${upgrades.fireCost.toLocaleString()} ✦`;
    document.getElementById('damage-price').textContent = `${upgrades.damageCost.toLocaleString()} ✦`;
    document.querySelector('#fire-upgrade .upgrade-copy strong').innerHTML = `QUICKER CYCLE <i>${upgrades.firePurchases}/5</i>`;
    document.querySelector('#damage-upgrade .upgrade-copy strong').innerHTML = `HEAVY ROUNDS <i>${upgrades.damagePurchases}/5</i>`;
    setCard('fire-upgrade', upgrades.firePurchases < 5 && state.currency >= upgrades.fireCost, upgrades.firePurchases >= 5 ? 'MAXED' : `${upgrades.fireCost.toLocaleString()} ✦`);
    setCard('damage-upgrade', upgrades.damagePurchases < 5 && state.currency >= upgrades.damageCost, upgrades.damagePurchases >= 5 ? 'MAXED' : `${upgrades.damageCost.toLocaleString()} ✦`);
    setCard('heal-upgrade', !upgrades.healUnlocked && state.currency >= 1000, upgrades.healUnlocked ? 'OWNED' : '1,000 ✦');
    setCard('auto-upgrade', !upgrades.autoUnlocked && state.currency >= upgrades.autoCost, upgrades.autoUnlocked ? 'UNLOCKED' : `${upgrades.autoCost.toLocaleString()} ✦`);
    document.getElementById('sentry-count').textContent = `${upgrades.sentries.length}/2`;
    setCard('sentry-upgrade', upgrades.sentries.length < 2 && state.currency >= 250, upgrades.sentries.length >= 2 ? 'MAX ACTIVE' : '250 ✦');
    const airReady = upgrades.airstrikeReadyAt <= state.elapsed;
    const remaining = Math.ceil(upgrades.airstrikeReadyAt - state.elapsed);
    const cooldownTrack = document.getElementById('airstrike-track');
    cooldownTrack.querySelector('.cooldown-fill').style.width = `${clamp(remaining / 120, 0, 1) * 100}%`;
    cooldownTrack.hidden = airReady;
    const airstrikeLabel = !airReady ? `CD ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : state.currency < 3000 ? 'NEED 3,000 ✦' : '3,000 ✦';
    setCard('airstrike-upgrade', airReady && state.currency >= 3000, airstrikeLabel);
    const reviveButton = document.getElementById('revive-button');
    reviveButton.hidden = !state.over;
    reviveButton.disabled = state.reviveUsed || state.currency < 5000;
    reviveButton.textContent = state.reviveUsed ? 'REVIVE USED THIS MATCH' : state.currency < 5000 ? 'REVIVE · NEED 5,000 ✦' : 'REVIVE · 5,000 ✦';
    hintEl.innerHTML = upgrades.autoUnlocked ? 'A / ↑ UP <span>•</span> D / ↓ DOWN <span>•</span> HOLD CLICK TO FIRE' : 'A / ↑ UP <span>•</span> D / ↓ DOWN <span>•</span> CLICK TO FIRE';
    updatePauseUI();
  }

  function updatePauseUI() {
    pauseButton.disabled = !state.running || state.over;
    pauseButton.innerHTML = state.paused ? '▶ <span>RESUME</span>' : 'Ⅱ <span>PAUSE</span>';
    pauseButton.setAttribute('aria-label', state.paused ? 'Resume game' : 'Pause game');
    document.getElementById('pause-overlay').classList.toggle('show', state.paused && state.running);
  }

  function awardDamage(amount) { if (amount <= 0) return; const credit = Math.floor(amount); state.score += credit; state.currency += credit; }

  function frame(now) {
    if (!state.running) return;
    if (state.paused) {
      state.last = now;
      if (state.freezeUntil && now >= state.freezeUntil) { state.freezeUntil = 0; updateUI(); }
      draw(); requestAnimationFrame(frame); return;
    }
    if (state.freezeUntil > now) { state.last = now; draw(); requestAnimationFrame(frame); return; }
    if (state.freezeUntil) { state.freezeUntil = 0; updateUI(); }
    const dt = Math.min((now - state.last) / 1000 || 0, .033); state.last = now; state.elapsed += dt;
    if (upgrades.healUnlocked) {
      state.healAccumulator += dt;
      while (state.healAccumulator >= 1) { state.health = Math.min(100, state.health + 1); state.healAccumulator -= 1; }
    }
    const wave = currentWave();
    if (wave % 5 === 0 && state.lastBossWave !== wave) { addBoss(wave); state.lastBossWave = wave; }
    const up = state.keys.has('a') || state.keys.has('arrowup');
    const down = state.keys.has('d') || state.keys.has('arrowdown');
    state.gunY = clamp(state.gunY + ((down ? 1 : 0) - (up ? 1 : 0)) * 300 * dt, 32, state.h - 32);
    if (state.mouseDown && upgrades.autoUnlocked) fire();
    state.spawn -= dt; state.shotCooldown -= dt; state.flash = Math.max(0, state.flash - dt * 2.5);
    // Give the player breathing room early; spawn pace ramps up in later waves.
    const interval = Math.max(.8, 3.2 - (currentWave() - 1) * .38);
    if (state.spawn <= 0) { addEnemy(); state.spawn = interval * rand(.65, 1.2); }
    for (const b of state.bullets) {
      b.travelled += b.speed * dt;
      const progress = clamp(b.travelled / b.travelDistance, 0, 1);
      b.speed = b.baseSpeed * (1 - .65 * progress);
      b.vx = b.dirX * b.speed; b.vy = b.dirY * b.speed;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    }
    state.bullets = state.bullets.filter(b => b.life > 0 && b.x < state.w + 20 && b.y > -20 && b.y < state.h + 20);
    for (const en of state.enemies) { en.x -= en.speed * dt; en.y = clamp(en.baseY + Math.sin(state.elapsed * en.freq + en.phase) * en.amp, 42, state.h - 32); }
    for (const boss of state.enemies) {
      if (boss.type !== 'gasBoss') continue;
      boss.shotCooldown -= dt;
      if (boss.x < state.w - boss.r && boss.shotCooldown <= 0) { fireGasProjectile(boss); boss.shotCooldown = 4; }
    }
    for (const shot of state.hostileShots) { shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt; }
    for (const b of state.bullets) {
      if (b.hit) continue;
      for (const en of state.enemies) {
        if (Math.hypot(b.x - en.x, b.y - en.y) < en.r + 5) {
          b.hit = true;
          const crit = isHeadshot(b, en), damage = b.damage * (crit ? 1.5 : 1), dealt = Math.min(en.hp, damage);
          en.hp -= damage; awardDamage(dealt); state.flash = .25;
          if (crit) state.floatingTexts.push({ x: en.x, y: en.y - en.r - 15, text: 'CRIT!', life: .9, maxLife: .9, vy: -32 });
          burst(b.x, b.y, '#d9ff91', 5);
          if (en.hp <= 0) burst(en.x, en.y, en.type === 'slime' ? '#a7e96e' : '#dd806c', 14);
          break;
        }
      }
      if (!b.hit) {
        for (const shot of state.hostileShots) {
          if (Math.hypot(b.x - shot.x, b.y - shot.y) < shot.r + 4) {
            b.hit = true; shot.hp -= b.damage; burst(shot.x, shot.y, '#ffb15d', 7); break;
          }
        }
      }
    }
    state.bullets = state.bullets.filter(b => !b.hit);
    state.hostileShots = state.hostileShots.filter(shot => {
      if (shot.hp <= 0) return false;
      if (shot.life <= 0) {
        if (Math.abs(state.gunY - shot.targetY) < 22) state.health = Math.max(0, state.health - 10);
        burst(shot.targetX, shot.targetY, '#ff9b43', 12); return false;
      }
      return true;
    });
    for (const sentry of upgrades.sentries) {
      sentry.life -= dt; sentry.cooldown -= dt;
      if (sentry.cooldown <= 0 && state.enemies.length) {
        const target = state.enemies.reduce((nearest, en) => !nearest || Math.hypot(en.x - sentry.x, en.y - sentry.y) < Math.hypot(nearest.x - sentry.x, nearest.y - sentry.y) ? en : nearest, null);
        const angle = Math.atan2(target.y - sentry.y, target.x - sentry.x);
        const sx = sentry.x + Math.cos(angle) * 15, sy = sentry.y + Math.sin(angle) * 15;
        state.bullets.push(makeBullet(sx, sy, angle, 10, 900, target.x, 'sentry'));
        sentry.cooldown = upgrades.fireDelay;
      }
    }
    upgrades.sentries = upgrades.sentries.filter(s => s.life > 0);
    state.enemies = state.enemies.filter(en => { if (en.hp <= 0) return false; if (en.x < 22 + en.r) { state.health = Math.max(0, state.health - (['boss', 'gasBoss'].includes(en.type) ? 30 : en.type === 'zombie' ? 14 : 9)); return false; } return true; });
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= .96; p.vy *= .96; }
    state.particles = state.particles.filter(p => p.life > 0);
    for (const t of state.floatingTexts) { t.y += t.vy * dt; t.life -= dt; }
    state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);
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
    for (const shot of state.hostileShots) {
      ctx.strokeStyle = 'rgba(255,191,104,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(shot.x - shot.vx * .07, shot.y - shot.vy * .07); ctx.lineTo(shot.x, shot.y); ctx.stroke();
      ctx.fillStyle = '#ff9c43'; ctx.shadowColor = '#ff7b32'; ctx.shadowBlur = 17; ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff0c1'; ctx.beginPath(); ctx.arc(shot.x - 2, shot.y - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of state.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    for (const t of state.floatingTexts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1); ctx.textAlign = 'center'; ctx.font = '800 13px Manrope, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#210e0ddd'; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = '#ff4545'; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
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
    } else if (en.type === 'gasBoss') {
      const pulse = 1 + Math.sin(state.elapsed * 2.7) * .055;
      ctx.scale(pulse, pulse); ctx.shadowColor = '#ff8a36'; ctx.shadowBlur = 25;
      ctx.fillStyle = '#b95725'; ctx.beginPath(); ctx.ellipse(0, 2, r * .95, r * .69, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ed8735'; ctx.beginPath(); ctx.arc(-r * .46, -r * .08, r * .43, 0, Math.PI * 2); ctx.arc(0, -r * .38, r * .52, 0, Math.PI * 2); ctx.arc(r * .43, -r * .04, r * .41, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffb95a'; ctx.beginPath(); ctx.arc(-r * .18, -r * .13, 4, 0, Math.PI * 2); ctx.arc(r * .2, -r * .13, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#74351f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, r * .12, r * .2, .2, Math.PI - .2); ctx.stroke();
    } else if (en.type === 'boss') {
      const pulse = 1 + Math.sin(state.elapsed * 3) * .04;
      ctx.scale(pulse, pulse);
      ctx.shadowColor = '#ff665b'; ctx.shadowBlur = 22; ctx.fillStyle = '#983f42';
      ctx.beginPath(); ctx.ellipse(0, 0, r * .88, r * .78, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#d77862'; ctx.beginPath(); ctx.arc(0, -r * .15, r * .47, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b2931'; ctx.beginPath(); ctx.moveTo(-r * .32, -r * .49); ctx.lineTo(-r * .57, -r * .94); ctx.lineTo(-r * .05, -r * .62); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * .32, -r * .49); ctx.lineTo(r * .57, -r * .94); ctx.lineTo(r * .05, -r * .62); ctx.fill();
      ctx.fillStyle = '#f5c46f'; ctx.beginPath(); ctx.arc(-r * .18, -r * .18, 3.5, 0, Math.PI * 2); ctx.arc(r * .18, -r * .18, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#351c24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * .22, r * .18); ctx.lineTo(-r * .1, r * .3); ctx.lineTo(0, r * .18); ctx.lineTo(r * .1, r * .3); ctx.lineTo(r * .22, r * .18); ctx.stroke();
    } else {
      ctx.shadowColor = '#d78168'; ctx.shadowBlur = 12; ctx.fillStyle = '#c67864'; ctx.beginPath(); ctx.arc(0, -r * .34, r * .42, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#6d5144'; ctx.beginPath(); ctx.roundRect(-r * .58, -r * .08, r * 1.16, r * 1.18, r * .35); ctx.fill();
      ctx.fillStyle = '#ddd0ae'; ctx.fillRect(-r * .36, -r * .44, r * .13, 2); ctx.fillRect(r * .23, -r * .44, r * .13, 2);
      ctx.strokeStyle = '#332d27'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-r * .19, -r * .12); ctx.lineTo(r * .2, -r * .12); ctx.stroke();
    }
    ctx.restore();
    const boss = en.type === 'boss' || en.type === 'gasBoss';
    const bw = boss ? 100 : r * 1.65, bh = boss ? 5 : 3, barY = y - r - (boss ? 16 : 10);
    if (boss) { ctx.fillStyle = '#fff0d6'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(en.type === 'gasBoss' ? 'ORANGE GAS CLOUD · BOSS' : 'WAVE BOSS', x, barY - 5); }
    ctx.fillStyle = '#111710'; ctx.fillRect(x - bw / 2, barY, bw, bh); ctx.fillStyle = boss ? en.type === 'gasBoss' ? '#ff9c43' : '#ff7768' : en.hp / en.maxHp > .5 ? '#c5f36b' : '#f08b71'; ctx.fillRect(x - bw / 2, barY, bw * clamp(en.hp / en.maxHp, 0, 1), bh);
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
    state.running = false; state.paused = false; state.over = true; hintEl.style.display = 'none';
    overlay.querySelector('h1').textContent = 'Line breached.';
    overlay.querySelector('.intro-card p').innerHTML = `You held out for ${Math.floor(state.elapsed)} seconds.<br />${state.score} damage dealt · ${state.currency} credits earned`;
    document.getElementById('start-button').innerHTML = 'TRY AGAIN <span>↻</span>'; overlay.classList.remove('hidden'); updateUI();
  }

  resize(); updateUI(); draw();
})();
