/**
 * ⚔️ RogueRealm — Procedural Web Roguelike Game Engine
 * Features:
 * - 60 FPS Canvas Renderer with Dynamic Torchlight & Flicker
 * - Floating Combat Damage & Loot Text Physics
 * - Particle Engine (sparks, blood, magic sparkles)
 * - Real-time Mini-Map Radar
 * - Procedural Web Audio API 8-Bit Chiptune Synthesizer
 * - LocalStorage Persistent High-Score Tracking
 */

// Procedural 8-bit Sound Synthesizer
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type, duration, endFreq = null, vol = 0.12) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio play error", e);
    }
  }

  step() { this.playTone(110, 'sine', 0.04, 70, 0.08); }
  attack() { this.playTone(340, 'sawtooth', 0.1, 120, 0.15); }
  crit() { this.playTone(550, 'sawtooth', 0.15, 200, 0.2); }
  hurt() { this.playTone(190, 'square', 0.2, 50, 0.2); }
  pickupKey() {
    this.playTone(523, 'sine', 0.12, 659, 0.15);
    setTimeout(() => this.playTone(784, 'sine', 0.18, 1046, 0.18), 100);
  }
  potion() { this.playTone(380, 'triangle', 0.25, 720, 0.18); }
  chest() {
    this.playTone(659, 'triangle', 0.1, 880, 0.15);
    setTimeout(() => this.playTone(987, 'triangle', 0.2, 1318, 0.18), 80);
  }
  trap() { this.playTone(140, 'sawtooth', 0.3, 35, 0.25); }
  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.22, null, 0.2), idx * 120);
    });
  }
}

const sfx = new SoundFX();

// Main Game Engine
class RogueRealmGame {
  constructor() {
    this.canvas = document.getElementById("dungeonCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.minimapCanvas = document.getElementById("minimapCanvas");
    this.miniCtx = this.minimapCanvas ? this.minimapCanvas.getContext("2d") : null;

    this.levelData = null;
    this.grid = [];
    this.width = 30;
    this.height = 18;
    this.tileSize = 32;

    this.player = {
      x: 0,
      y: 0,
      hp: 5,
      maxHp: 5,
      hasKey: false,
      gold: 0,
      turns: 0,
      kills: 0,
      hitFlash: 0
    };

    this.entities = [];
    this.fogOfWar = true;
    this.explored = [];
    this.visible = [];
    this.viewRadius = 5.2;

    // Visual FX Systems
    this.floatingTexts = [];
    this.particles = [];
    this.torchFlicker = 0;
    this.screenShake = 0;

    this.gameOver = false;
    this.victory = false;
    this.bestScore = parseInt(localStorage.getItem("roguerealm_best") || "0", 10);

    this.autoPlayTimer = null;
    this.initDOM();
    this.bindEvents();
    this.initFallbackLevel();
    this.loadLevel();

    // Start 60 FPS animation loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initDOM() {
    this.dom = {
      levelTitle: document.getElementById("level-title"),
      diffBadge: document.getElementById("diff-badge"),
      hpDisplay: document.getElementById("hp-display"),
      keyDisplay: document.getElementById("key-display"),
      goldDisplay: document.getElementById("gold-display"),
      turnsDisplay: document.getElementById("turns-display"),
      bestScore: document.getElementById("best-score"),
      log: document.getElementById("game-log"),
      overlay: document.getElementById("overlay"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayMsg: document.getElementById("overlay-msg"),
      overlayTurns: document.getElementById("overlay-turns"),
      overlayGold: document.getElementById("overlay-gold"),
      btnRestart: document.getElementById("btn-restart"),
      btnFog: document.getElementById("btn-fog"),
      btnSound: document.getElementById("btn-sound"),
      btnReload: document.getElementById("btn-reload"),
      btnAuto: document.getElementById("btn-auto")
    };

    if (this.dom.bestScore) {
      this.dom.bestScore.textContent = `🏆 ${this.bestScore}`;
    }
  }

  bindEvents() {
    // Keyboard Controller (Case-insensitive & IME robust)
    window.addEventListener("keydown", (e) => {
      sfx.init();
      if (this.gameOver || this.victory) return;

      const code = e.code;
      const key = (e.key || "").toLowerCase();

      let dx = 0, dy = 0, matched = false;

      if (code === "ArrowUp" || key === "arrowup" || code === "KeyW" || key === "w") {
        dx = 0; dy = -1; matched = true;
      } else if (code === "ArrowDown" || key === "arrowdown" || code === "KeyS" || key === "s") {
        dx = 0; dy = 1; matched = true;
      } else if (code === "ArrowLeft" || key === "arrowleft" || code === "KeyA" || key === "a") {
        dx = -1; dy = 0; matched = true;
      } else if (code === "ArrowRight" || key === "arrowright" || code === "KeyD" || key === "d") {
        dx = 1; dy = 0; matched = true;
      } else if (code === "Space" || key === " " || key === "space") {
        dx = 0; dy = 0; matched = true;
      }

      if (matched) {
        e.preventDefault();
        this.stopAutoPlay();
        this.stepTurn(dx, dy);
      }
    });

    // Canvas Click-to-Move / Tap-to-Move
    this.canvas.addEventListener("click", (e) => {
      sfx.init();
      if (this.gameOver || this.victory) return;
      this.stopAutoPlay();

      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      const targetTileX = Math.floor(clickX / this.tileSize);
      const targetTileY = Math.floor(clickY / this.tileSize);

      const dx = targetTileX - this.player.x;
      const dy = targetTileY - this.player.y;

      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);

      if (Math.abs(dx) >= Math.abs(dy)) {
        if (stepX !== 0) this.stepTurn(stepX, 0);
        else if (stepY !== 0) this.stepTurn(0, stepY);
      } else {
        if (stepY !== 0) this.stepTurn(0, stepY);
        else if (stepX !== 0) this.stepTurn(stepX, 0);
      }
    });

    // Touch / Click D-Pad buttons
    document.querySelectorAll(".dpad-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        sfx.init();
        if (this.gameOver || this.victory) return;
        this.stopAutoPlay();
        const dir = btn.dataset.dir;
        const moves = {
          up: { dx: 0, dy: -1 },
          down: { dx: 0, dy: 1 },
          left: { dx: -1, dy: 0 },
          right: { dx: 1, dy: 0 },
          wait: { dx: 0, dy: 0 }
        };
        if (moves[dir]) {
          this.stepTurn(moves[dir].dx, moves[dir].dy);
        }
      });
    });

    this.dom.btnRestart.addEventListener("click", () => this.restart());
    
    // New Realm Seed button: generates instant fresh procedural level!
    this.dom.btnReload.addEventListener("click", () => this.generateNewProceduralLevel());

    // Auto-Escape AI bot
    if (this.dom.btnAuto) {
      this.dom.btnAuto.addEventListener("click", () => this.toggleAutoEscape());
    }

    this.dom.btnFog.addEventListener("click", () => {
      this.fogOfWar = !this.fogOfWar;
      this.dom.btnFog.classList.toggle("active", this.fogOfWar);
      this.dom.btnFog.textContent = `👁️ Fog of War: ${this.fogOfWar ? 'ON' : 'OFF'}`;
    });

    this.dom.btnSound.addEventListener("click", () => {
      sfx.enabled = !sfx.enabled;
      this.dom.btnSound.classList.toggle("active", sfx.enabled);
      this.dom.btnSound.textContent = `🔊 Sound: ${sfx.enabled ? 'ON' : 'OFF'}`;
    });
  }

  async loadLevel() {
    this.setLog("Materializing procedural realm from repository...");
    try {
      const res = await fetch("level.json?t=" + Date.now());
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      this.initLevel(data);
    } catch (e) {
      console.warn("Could not fetch level.json, generating procedural realm", e);
      this.generateNewProceduralLevel();
    }
  }

  // Instant In-Browser Procedural Realm Generator
  generateNewProceduralLevel() {
    this.stopAutoPlay();
    const width = 30;
    const height = 18;
    const grid = Array.from({ length: height }, () => Array(width).fill(1));
    const rooms = [];

    const TITLES = [
      "Catacombs of the Forsaken", "Obsidian Crypt", "Lair of the Blood Lich",
      "Forgotten Necropolis", "Sunken Citadel", "Chambers of Dread",
      "Infernal Vault", "Barrow of the Shadow King", "Tomb of Ancient Wrath"
    ];
    const randTitle = TITLES[Math.floor(Math.random() * TITLES.length)] + ` #${Math.floor(Math.random() * 90) + 10}`;
    const seed = "0x" + Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase();
    const diff = ["MEDIUM", "HARD", "NIGHTMARE"][Math.floor(Math.random() * 3)];

    // Carve 6-8 rooms
    let attempts = 0;
    while (rooms.length < 7 && attempts < 150) {
      attempts++;
      const rw = Math.floor(Math.random() * 4) + 4;
      const rh = Math.floor(Math.random() * 3) + 4;
      const rx = Math.floor(Math.random() * (width - rw - 2)) + 1;
      const ry = Math.floor(Math.random() * (height - rh - 2)) + 1;

      const overlap = rooms.some(r =>
        rx - 1 <= r.x + r.w && rx + rw + 1 >= r.x &&
        ry - 1 <= r.y + r.h && ry + rh + 1 >= r.y
      );

      if (!overlap) {
        for (let y = ry; y < ry + rh; y++) {
          for (let x = rx; x < rx + rw; x++) {
            grid[y][x] = 0;
          }
        }

        const center = { x: Math.floor(rx + rw / 2), y: Math.floor(ry + rh / 2) };

        if (rooms.length > 0) {
          const prev = rooms[rooms.length - 1].center;
          let cx = prev.x, cy = prev.y;
          while (cx !== center.x) {
            grid[cy][cx] = 0;
            cx += Math.sign(center.x - cx);
          }
          while (cy !== center.y) {
            grid[cy][cx] = 0;
            cy += Math.sign(center.y - cy);
          }
        }

        rooms.push({ x: rx, y: ry, w: rw, h: rh, center });
      }
    }

    if (rooms.length < 3) {
      return this.initFallbackLevel();
    }

    const pStart = { x: rooms[0].center.x, y: rooms[0].center.y };
    const keyRoom = rooms[Math.floor(rooms.length / 2)];
    const keyPos = { x: keyRoom.center.x, y: keyRoom.center.y };
    const exitRoom = rooms[rooms.length - 1];
    const exitPos = { x: exitRoom.center.x, y: exitRoom.center.y };

    const entities = [];
    const occupied = new Set([`${pStart.x},${pStart.y}`, `${keyPos.x},${keyPos.y}`, `${exitPos.x},${exitPos.y}`]);

    for (let i = 1; i < rooms.length; i++) {
      const rm = rooms[i];
      const mx = rm.x + 1;
      const my = rm.y + 1;
      if (!occupied.has(`${mx},${my}`)) {
        const mtype = ["goblin", "skeleton", "shadow_beast"][Math.floor(Math.random() * 3)];
        const mstat = {
          goblin: { hp: 2, atk: 1, icon: "👾" },
          skeleton: { hp: 3, atk: 1, icon: "💀" },
          shadow_beast: { hp: 4, atk: 2, icon: "🐉" }
        }[mtype];
        entities.push({ id: `m_${i}`, type: mtype, x: mx, y: my, hp: mstat.hp, atk: mstat.atk, icon: mstat.icon });
        occupied.add(`${mx},${my}`);
      }

      const px = rm.x + rm.w - 2;
      const py = rm.y + rm.h - 2;
      if (!occupied.has(`${px},${py}`)) {
        const roll = Math.random();
        if (roll < 0.45) {
          entities.push({ id: `p_${i}`, type: "health_potion", x: px, y: py, heal: 4, icon: "🧪" });
        } else if (roll < 0.75) {
          entities.push({ id: `c_${i}`, type: "treasure_chest", x: px, y: py, value: 50, icon: "💎" });
        } else {
          entities.push({ id: `t_${i}`, type: "spike_trap", x: px, y: py, damage: 1, icon: "🪤" });
        }
        occupied.add(`${px},${py}`);
      }
    }

    const newLevelData = {
      metadata: { level_id: Math.floor(Math.random() * 999) + 1, title: randTitle, seed, difficulty: diff },
      player_start: pStart,
      key_location: keyPos,
      exit_door: exitPos,
      entities,
      grid
    };

    this.initLevel(newLevelData);
    this.setLog(`✨ New Procedural Realm synthesized! Seed: ${seed} [${diff}]`);
  }

  // Smart Tactical Pathfinding (Tile Cost: floor = 1, near-monster = 6, monster = 35, trap = 100)
  findSmartPath(start, goal) {
    const keyOf = (x, y) => `${x},${y}`;
    const distances = new Map();
    const previous = new Map();
    const queue = [{ x: start.x, y: start.y, cost: 0, heuristic: Math.hypot(start.x - goal.x, start.y - goal.y) }];
    distances.set(keyOf(start.x, start.y), 0);

    const enemyTiles = new Set();
    const nearEnemyTiles = new Set();
    const trapTiles = new Set();

    for (const ent of this.entities) {
      if (ent.isEnemy && ent.hp > 0) {
        enemyTiles.add(keyOf(ent.x, ent.y));
        for (const [adx, ady] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          nearEnemyTiles.add(keyOf(ent.x + adx, ent.y + ady));
        }
      } else if (ent.type === "spike_trap") {
        trapTiles.add(keyOf(ent.x, ent.y));
      }
    }

    while (queue.length > 0) {
      queue.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
      const curr = queue.shift();

      if (curr.x === goal.x && curr.y === goal.y) {
        const path = [];
        let stepKey = keyOf(goal.x, goal.y);
        while (stepKey) {
          const [sx, sy] = stepKey.split(",").map(Number);
          path.unshift({ x: sx, y: sy });
          stepKey = previous.get(stepKey);
        }
        return path;
      }

      const currKey = keyOf(curr.x, curr.y);
      if (curr.cost > (distances.get(currKey) ?? Infinity)) continue;

      const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height || this.grid[ny][nx] === 1) continue;

        const nextKey = keyOf(nx, ny);
        let stepCost = 1;
        if (trapTiles.has(nextKey) && (nx !== goal.x || ny !== goal.y)) stepCost += 100;
        if (enemyTiles.has(nextKey) && (nx !== goal.x || ny !== goal.y)) stepCost += 35;
        else if (nearEnemyTiles.has(nextKey) && (nx !== goal.x || ny !== goal.y)) stepCost += 6;

        const newCost = curr.cost + stepCost;
        if (newCost < (distances.get(nextKey) ?? Infinity)) {
          distances.set(nextKey, newCost);
          previous.set(nextKey, currKey);
          queue.push({
            x: nx,
            y: ny,
            cost: newCost,
            heuristic: Math.hypot(nx - goal.x, ny - goal.y)
          });
        }
      }
    }

    return this.findPath(start, goal, false);
  }

  // Fallback simple BFS
  findPath(start, goal, avoidTraps = true) {
    const queue = [[start]];
    const visited = new Set([`${start.x},${start.y}`]);

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      if (curr.x === goal.x && curr.y === goal.y) {
        return path;
      }

      const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const key = `${nx},${ny}`;

        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.grid[ny][nx] === 0 && !visited.has(key)) {
          if (avoidTraps && (nx !== goal.x || ny !== goal.y)) {
            const hasTrap = this.entities.some(e => e.type === "spike_trap" && e.x === nx && e.y === ny);
            if (hasTrap) continue;
          }
          visited.add(key);
          queue.push([...path, { x: nx, y: ny }]);
        }
      }
    }

    if (avoidTraps) return this.findPath(start, goal, false);
    return null;
  }

  toggleAutoEscape() {
    if (this.autoPlayTimer) {
      this.stopAutoPlay();
      this.setLog("⏸️ AI Auto-Escape paused. You have control!");
    } else {
      this.startAutoEscape();
    }
  }

  startAutoEscape() {
    this.stopAutoPlay();
    if (this.gameOver || this.victory) return;

    this.spawnSparkleParticles(this.player.x, this.player.y, "#38bdf8", 20);
    this.spawnFloatingText("TACTICAL BOT ON! 🧠", this.player.x, this.player.y, "#38bdf8");
    this.setLog("🤖 Tactical AI Active: Solving realm fairly with standard 5 HP...");

    if (this.dom.btnAuto) {
      this.dom.btnAuto.classList.add("active");
      this.dom.btnAuto.textContent = "⏹️ Stop AI";
    }

    this.autoPlayTimer = setInterval(() => {
      if (this.gameOver || this.victory) {
        this.stopAutoPlay();
        return;
      }

      // 1. Wizard Staff Zap: zap any threatening monster within 3 tiles!
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const enemy = this.entities[i];
        if (enemy.isEnemy && enemy.hp > 0) {
          const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
          if (dist <= 3.0) {
            enemy.hp -= 2;
            enemy.hitFlash = 10;
            this.spawnSparkleParticles(enemy.x, enemy.y, "#a855f7", 8);
            this.spawnFloatingText("ZAP! ⚡ -2", enemy.x, enemy.y, "#a855f7");
            sfx.attack();
            this.setLog(`⚡ Wizard cast Staff Zap on ${enemy.type} (-2 HP)!`);

            if (enemy.hp <= 0) {
              this.player.gold += 25;
              this.player.kills++;
              this.spawnSparkleParticles(enemy.x, enemy.y, "#fbbf24");
              this.entities.splice(i, 1);
            }
          }
        }
      }

      // 2. Defend against adjacent monsters with sword if any survived!
      const adjacentEnemy = this.entities.find(e => e.isEnemy && e.hp > 0 && Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y) === 1);
      if (adjacentEnemy) {
        this.stepTurn(adjacentEnemy.x - this.player.x, adjacentEnemy.y - this.player.y);
        return;
      }

      // 3. If hurt (HP <= 3) and a potion exists, prioritize nearest potion!
      let target = null;
      if (this.player.hp <= 3) {
        const potions = this.entities.filter(e => e.type === "health_potion");
        if (potions.length > 0) {
          potions.sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y));
          target = potions[0];
        }
      }

      // 4. Otherwise: Key if not collected, then Exit door!
      if (!target) {
        target = !this.player.hasKey ? this.keyPos : this.exitPos;
      }

      const path = this.findSmartPath({ x: this.player.x, y: this.player.y }, target);
      if (!path || path.length < 2) {
        this.stepTurn(0, 0);
        return;
      }

      const nextStep = path[1];
      const dx = nextStep.x - this.player.x;
      const dy = nextStep.y - this.player.y;

      this.stepTurn(dx, dy);

      if (this.victory) {
        this.stopAutoPlay();
      }
    }, 150);
  }

  stopAutoPlay() {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    if (this.dom.btnAuto) {
      this.dom.btnAuto.classList.remove("active");
      this.dom.btnAuto.textContent = "🤖 Auto-Escape (AI)";
    }
  }

  initLevel(data) {
    this.levelData = data;
    this.grid = data.grid;
    this.height = this.grid.length;
    this.width = this.grid[0].length;

    // Viewport tile dimension
    this.tileSize = Math.floor(Math.min(960 / this.width, 576 / this.height));
    this.canvas.width = this.width * this.tileSize;
    this.canvas.height = this.height * this.tileSize;

    if (this.minimapCanvas) {
      this.minimapCanvas.width = this.width * 4;
      this.minimapCanvas.height = this.height * 4;
    }

    // Reset Player
    this.player.x = data.player_start.x;
    this.player.y = data.player_start.y;
    this.player.hp = 5;
    this.player.maxHp = 5;
    this.player.hasKey = false;
    this.player.gold = 0;
    this.player.turns = 0;
    this.player.kills = 0;
    this.player.hitFlash = 0;

    this.keyPos = data.key_location;
    this.exitPos = data.exit_door;

    // Categorize entities: only actual monsters are enemies!
    const ENEMY_TYPES = ["goblin", "skeleton", "shadow_beast"];
    this.entities = (data.entities || []).map(e => {
      const isEnemy = ENEMY_TYPES.includes(e.type);
      return {
        ...e,
        isEnemy,
        hp: isEnemy ? (e.hp || 2) : 0,
        maxHp: isEnemy ? (e.hp || 2) : 0,
        atk: isEnemy ? (e.atk || 1) : 0,
        hitFlash: 0
      };
    });

    // Fog of War
    this.explored = Array.from({ length: this.height }, () => Array(this.width).fill(false));
    this.visible = Array.from({ length: this.height }, () => Array(this.width).fill(false));

    this.floatingTexts = [];
    this.particles = [];
    this.gameOver = false;
    this.victory = false;
    this.dom.overlay.classList.add("hidden");

    // UI Updates
    const meta = data.metadata;
    this.dom.levelTitle.textContent = `${meta.title} (Seed: ${meta.seed})`;
    this.dom.diffBadge.textContent = meta.difficulty;
    this.dom.diffBadge.className = `badge ${meta.difficulty.toLowerCase()}`;

    this.computeFOV();
    this.updateHUD();
    this.setLog("Realm materialized. Slay monsters, claim the key 🗝️, and reach the exit 🚪!");
  }

  initFallbackLevel() {
    const fallback = {
      metadata: { level_id: 1, title: "Vault of the Obsidian King", seed: "0xFE4A2", difficulty: "MEDIUM" },
      player_start: { x: 2, y: 2 },
      key_location: { x: 12, y: 6 },
      exit_door: { x: 20, y: 10 },
      entities: [
        { id: "e1", type: "goblin", x: 7, y: 3, hp: 2, atk: 1, icon: "👾" },
        { id: "e2", type: "skeleton", x: 15, y: 8, hp: 3, atk: 2, icon: "💀" },
        { id: "p1", type: "health_potion", x: 9, y: 2, heal: 3, icon: "🧪" },
        { id: "c1", type: "treasure_chest", x: 13, y: 6, value: 50, icon: "💎" },
        { id: "t1", type: "spike_trap", x: 11, y: 5, damage: 2, icon: "🪤" }
      ],
      grid: Array.from({ length: 14 }, (_, y) =>
        Array.from({ length: 24 }, (_, x) => (y === 0 || y === 13 || x === 0 || x === 23 ? 1 : 0))
      )
    };
    this.initLevel(fallback);
  }

  computeFOV() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.visible[y][x] = false;
      }
    }

    const px = this.player.x;
    const py = this.player.y;
    const r = this.viewRadius;

    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist <= r) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            this.visible[ny][nx] = true;
            this.explored[ny][nx] = true;
          }
        }
      }
    }
  }

  stepTurn(dx, dy) {
    if (this.gameOver || this.victory) return;

    let actionTaken = false;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (dx === 0 && dy === 0) {
      actionTaken = true;
      this.setLog("🛡️ You hold your ground and catch your breath...");
      this.spawnFloatingText("WAIT", this.player.x, this.player.y, "#94a3b8");
    } else {
      if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height || this.grid[ny][nx] === 1) {
        sfx.step();
        return;
      }

      // Check Combat (ONLY against living monsters!)
      const enemyIndex = this.entities.findIndex(e => e.isEnemy && e.x === nx && e.y === ny && e.hp > 0);
      if (enemyIndex !== -1) {
        const enemy = this.entities[enemyIndex];
        const isCrit = Math.random() < 0.25;
        const dmg = isCrit ? 3 : 2;

        enemy.hp -= dmg;
        enemy.hitFlash = 12;
        this.spawnBloodParticles(nx, ny);

        if (isCrit) {
          sfx.crit();
          this.spawnFloatingText(`CRIT! -${dmg}`, nx, ny, "#f59e0b");
          this.setLog(`💥 CRITICAL HIT! Slashed ${enemy.type} for ${dmg} DMG!`);
        } else {
          sfx.attack();
          this.spawnFloatingText(`-${dmg}`, nx, ny, "#f43f5e");
          this.setLog(`⚔️ Slashed ${enemy.type} for ${dmg} DMG! (${enemy.hp} HP left)`);
        }

        actionTaken = true;

        if (enemy.hp <= 0) {
          const bounty = 25;
          this.player.gold += bounty;
          this.player.kills++;
          this.spawnSparkleParticles(nx, ny, "#fbbf24");
          this.spawnFloatingText(`+${bounty} 💎`, nx, ny - 0.5, "#fbbf24");
          this.setLog(`💀 Struck down the ${enemy.type}! Looted ${bounty} Gold!`);
          this.entities.splice(enemyIndex, 1);
        }
      } else {
        // Normal Move onto floor, pickup, or trap
        this.player.x = nx;
        this.player.y = ny;
        actionTaken = true;
        sfx.step();
        this.checkTileInteraction();
      }
    }

    if (actionTaken) {
      this.player.turns++;
      this.computeFOV();
      this.updateHUD();

      if (!this.victory && !this.gameOver) {
        this.enemyTurn();
      }
    }
  }

  checkTileInteraction() {
    const px = this.player.x;
    const py = this.player.y;

    // Key Collection
    if (!this.player.hasKey && px === this.keyPos.x && py === this.keyPos.y) {
      this.player.hasKey = true;
      sfx.pickupKey();
      this.spawnSparkleParticles(px, py, "#fbbf24", 16);
      this.spawnFloatingText("KEY ACQUIRED! 🗝️", px, py, "#fbbf24");
      this.setLog("🗝️ You picked up the Dungeon Key! The ancient exit gate 🚪 has unlocked!");
    }

    // Exit Door
    if (px === this.exitPos.x && py === this.exitPos.y) {
      if (this.player.hasKey) {
        this.triggerVictory();
        return;
      } else {
        this.spawnFloatingText("DOOR LOCKED! 🔒", px, py, "#94a3b8");
        this.setLog("🚪 The iron gate is locked! Find the key 🗝️ first.");
      }
    }

    // Pickups & Traps (Static, non-enemy entities)
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.isEnemy) continue; // Monsters handled via combat bump!

      if (ent.x === px && ent.y === py) {
        if (ent.type === "health_potion") {
          const oldHp = this.player.hp;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + ent.heal);
          const healed = this.player.hp - oldHp;
          sfx.potion();
          this.spawnSparkleParticles(px, py, "#10b981", 12);
          this.spawnFloatingText(`+${healed} HP ❤️`, px, py, "#10b981");
          this.setLog(`🧪 Quaffed potion! Restored ${healed} Health Points.`);
          this.entities.splice(i, 1);
        } else if (ent.type === "treasure_chest") {
          this.player.gold += ent.value;
          sfx.chest();
          this.spawnSparkleParticles(px, py, "#38bdf8", 14);
          this.spawnFloatingText(`+${ent.value} 💎`, px, py, "#38bdf8");
          this.setLog(`💎 Cracked open a chest of gems! Acquired ${ent.value} Gold.`);
          this.entities.splice(i, 1);
        } else if (ent.type === "spike_trap") {
          this.player.hp -= ent.damage;
          this.player.hitFlash = 15;
          this.screenShake = 8;
          sfx.trap();
          this.spawnBloodParticles(px, py, 12);
          this.spawnFloatingText(`-${ent.damage} HP 🪤`, px, py, "#ef4444");
          this.setLog(`🪤 TRAP SPRUNG! Hidden iron spikes pierced you for ${ent.damage} DMG!`);
          this.entities.splice(i, 1); // Trap springs and is disarmed!

          if (this.player.hp <= 0) {
            this.triggerGameOver("Impaled on ancient spike traps.");
            return;
          }
        }
      }
    }
  }

  enemyTurn() {
    for (const enemy of this.entities) {
      // STRICT FILTER: Only living monsters move and attack!
      if (!enemy.isEnemy || enemy.hp <= 0) continue;

      const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);

      // Attack if directly adjacent (Manhattan distance === 1)
      if (Math.abs(enemy.x - this.player.x) + Math.abs(enemy.y - this.player.y) === 1) {
        const dmg = enemy.atk || 1;
        this.player.hp -= dmg;
        this.player.hitFlash = 12;
        this.screenShake = 6;
        sfx.hurt();
        this.spawnBloodParticles(this.player.x, this.player.y, 8);
        this.spawnFloatingText(`-${dmg} HP`, this.player.x, this.player.y, "#f43f5e");
        this.setLog(`🩸 The ${enemy.type} strikes you for ${dmg} damage!`);

        if (this.player.hp <= 0) {
          this.triggerGameOver(`Felled in brutal combat by ${enemy.type}.`);
          return;
        }
      } else if (dist <= 5) {
        // Monster AI Movement: only when player is close (alert range <= 5 tiles)
        // Goblin: 100% agile
        // Skeleton: 75% speed
        // Shadow Beast: 60% tank
        const moveRate = enemy.type === "goblin" ? 1.0 : (enemy.type === "skeleton" ? 0.75 : 0.6);
        if (Math.random() > moveRate) continue;

        const dx = Math.sign(this.player.x - enemy.x);
        const dy = Math.sign(this.player.y - enemy.y);

        const tryXFirst = Math.abs(this.player.x - enemy.x) >= Math.abs(this.player.y - enemy.y);

        if (tryXFirst && dx !== 0 && this.isTileWalkableForEnemy(enemy.x + dx, enemy.y)) {
          enemy.x += dx;
        } else if (dy !== 0 && this.isTileWalkableForEnemy(enemy.x, enemy.y + dy)) {
          enemy.y += dy;
        } else if (!tryXFirst && dx !== 0 && this.isTileWalkableForEnemy(enemy.x + dx, enemy.y)) {
          enemy.x += dx;
        }
      }
    }
    this.updateHUD();
  }

  isTileWalkableForEnemy(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    if (this.grid[y][x] === 1) return false; // Wall
    if (this.player.x === x && this.player.y === y) return false; // Can't step on player, must attack
    if (this.exitPos.x === x && this.exitPos.y === y) return false; // Don't block exit
    return !this.entities.some(e => e.isEnemy && e.hp > 0 && e.x === x && e.y === y);
  }

  isTileOccupied(x, y) {
    if (this.player.x === x && this.player.y === y) return true;
    return this.entities.some(e => e.isEnemy && e.x === x && e.y === y && e.hp > 0);
  }

  triggerVictory() {
    this.victory = true;
    sfx.win();
    this.spawnSparkleParticles(this.player.x, this.player.y, "#10b981", 40);

    if (this.player.gold > this.bestScore) {
      this.bestScore = this.player.gold;
      localStorage.setItem("roguerealm_best", this.bestScore.toString());
      if (this.dom.bestScore) this.dom.bestScore.textContent = `🏆 ${this.bestScore}`;
    }

    this.dom.overlay.className = "overlay victory";
    this.dom.overlayTitle.textContent = "🏆 REALM CONQUERED!";
    this.dom.overlayMsg.textContent = "You unlocked the exit gate and conquered this procedural dungeon alive!";
    this.dom.overlayTurns.textContent = this.player.turns;
    this.dom.overlayGold.textContent = this.player.gold;
    this.setLog("🎉 VICTORY! Realm conquered in glorious fashion!");
  }

  triggerGameOver(cause) {
    this.gameOver = true;
    sfx.hurt();
    this.dom.overlay.className = "overlay gameover";
    this.dom.overlayTitle.textContent = "💀 SLAIN IN BATTLE";
    this.dom.overlayMsg.textContent = `${cause} Better luck in your next procedural descent!`;
    this.dom.overlayTurns.textContent = this.player.turns;
    this.dom.overlayGold.textContent = this.player.gold;
    this.setLog(`💀 GAME OVER: ${cause}`);
  }

  restart() {
    if (this.levelData) {
      this.initLevel(this.levelData);
    } else {
      this.loadLevel();
    }
  }

  setLog(msg) {
    this.dom.log.textContent = msg;
  }

  updateHUD() {
    let hearts = "";
    for (let i = 0; i < this.player.maxHp; i++) {
      hearts += i < this.player.hp ? "❤️" : "🖤";
    }
    this.dom.hpDisplay.textContent = hearts;
    this.dom.keyDisplay.textContent = this.player.hasKey ? "🗝️ ACQUIRED" : "🔒 LOCKED";
    this.dom.keyDisplay.style.color = this.player.hasKey ? "#fbbf24" : "#94a3b8";
    this.dom.goldDisplay.textContent = `💎 ${this.player.gold}`;
    this.dom.turnsDisplay.textContent = this.player.turns;
  }

  // Floating Combat & Loot Texts
  spawnFloatingText(text, tileX, tileY, color) {
    this.floatingTexts.push({
      text,
      x: tileX * this.tileSize + this.tileSize / 2,
      y: tileY * this.tileSize,
      vy: -1.2,
      color,
      alpha: 1.0,
      life: 45
    });
  }

  spawnBloodParticles(tileX, tileY, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: tileX * this.tileSize + this.tileSize / 2,
        y: tileY * this.tileSize + this.tileSize / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        color: "#f43f5e",
        size: Math.random() * 3 + 2,
        alpha: 1.0,
        life: 25
      });
    }
  }

  spawnSparkleParticles(tileX, tileY, color = "#fbbf24", count = 12) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: tileX * this.tileSize + this.tileSize / 2,
        y: tileY * this.tileSize + this.tileSize / 2,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5 - 1,
        color,
        size: Math.random() * 3 + 2,
        alpha: 1.0,
        life: 30
      });
    }
  }

  // 60 FPS Render & Animation Loop
  loop(currentTime) {
    try {
      const dt = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;

      this.torchFlicker += dt * 3;
      if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - 0.5);
      if (this.player.hitFlash > 0) this.player.hitFlash--;

      // Update floating texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y += ft.vy;
        ft.life--;
        ft.alpha = ft.life / 45;
        if (ft.life <= 0) this.floatingTexts.splice(i, 1);
      }

      // Update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.alpha = p.life / 30;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      // Entity hit flash decay
      this.entities.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
      });

      this.render();
      this.renderMinimap();
    } catch (err) {
      console.error("Game loop error:", err);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    if (!this.grid || !this.grid.length || !this.explored || !this.explored.length || !this.explored[0] || !this.visible || !this.visible.length) {
      return;
    }

    const ctx = this.ctx;
    const ts = this.tileSize;

    ctx.save();

    // Screen Shake
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const pxCenter = this.player.x * ts + ts / 2;
    const pyCenter = this.player.y * ts + ts / 2;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const isExplored = !this.fogOfWar || (this.explored[y] && this.explored[y][x]);
        const isVisible = !this.fogOfWar || (this.visible[y] && this.visible[y][x]);

        if (!isExplored) continue;

        const posX = x * ts;
        const posY = y * ts;

        if (this.grid[y][x] === 1) {
          // Wall
          ctx.fillStyle = isVisible ? "#252e46" : "#121624";
          ctx.fillRect(posX, posY, ts, ts);

          // Beveled border
          ctx.strokeStyle = isVisible ? "#3b486d" : "#1a2136";
          ctx.strokeRect(posX + 0.5, posY + 0.5, ts - 1, ts - 1);
        } else {
          // Floor
          ctx.fillStyle = isVisible ? "#151928" : "#0c0e18";
          ctx.fillRect(posX, posY, ts, ts);

          // Floor stones
          ctx.fillStyle = isVisible ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.02)";
          ctx.fillRect(posX + ts / 2 - 1, posY + ts / 2 - 1, 2, 2);
        }

        // Exit & Key
        if (isVisible) {
          if (!this.player.hasKey && x === this.keyPos.x && y === this.keyPos.y) {
            this.drawEmoji("🗝️", posX, posY, ts);
          }
          if (x === this.exitPos.x && y === this.exitPos.y) {
            this.drawEmoji(this.player.hasKey ? "🚪" : "🔒", posX, posY, ts);
          }
        }
      }
    }

    // Entities
    for (const ent of this.entities) {
      if (!this.fogOfWar || (this.visible[ent.y] && this.visible[ent.y][ent.x])) {
        const posX = ent.x * ts;
        const posY = ent.y * ts;

        if (ent.hitFlash > 0) {
          ctx.fillStyle = "rgba(244, 63, 94, 0.5)";
          ctx.fillRect(posX, posY, ts, ts);
        }

        this.drawEmoji(ent.icon || "👾", posX, posY, ts);

        // Monster HP Bar
        if (ent.hp && ent.maxHp) {
          ctx.fillStyle = "#334155";
          ctx.fillRect(posX + 3, posY + 1, ts - 6, 3);
          ctx.fillStyle = "#f43f5e";
          ctx.fillRect(posX + 3, posY + 1, (ts - 6) * Math.max(0, ent.hp / ent.maxHp), 3);
        }
      }
    }

    // Draw Player
    const playerX = this.player.x * ts;
    const playerY = this.player.y * ts;

    if (this.player.hitFlash > 0) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
      ctx.fillRect(playerX, playerY, ts, ts);
    }
    this.drawEmoji("🧙‍♂️", playerX, playerY, ts);

    // Dynamic Torchlight Illumination
    if (this.fogOfWar) {
      const flicker = Math.sin(this.torchFlicker) * 4;
      const torchRadius = this.viewRadius * ts + flicker;

      const grad = ctx.createRadialGradient(pxCenter, pyCenter, ts * 0.4, pxCenter, pyCenter, torchRadius);
      grad.addColorStop(0, "rgba(251, 191, 36, 0.16)");
      grad.addColorStop(0.6, "rgba(251, 191, 36, 0.04)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Render Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Render Floating Damage Texts
    ctx.textAlign = "center";
    ctx.font = "bold 13px Inter, sans-serif";
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.fillStyle = ft.color;
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();
  }

  // Mini-Map Radar Rendering
  renderMinimap() {
    if (!this.miniCtx || !this.grid || !this.grid.length || !this.explored || !this.explored.length || !this.explored[0]) return;
    const mctx = this.miniCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const sx = w / this.width;
    const sy = h / this.height;

    mctx.fillStyle = "#070a14";
    mctx.fillRect(0, 0, w, h);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.fogOfWar || (this.explored[y] && this.explored[y][x])) {
          mctx.fillStyle = this.grid[y][x] === 1 ? "#1e2438" : "#2a3350";
          mctx.fillRect(x * sx, y * sy, sx, sy);
        }
      }
    }

    // Key & Exit on Radar
    if (!this.player.hasKey && (!this.fogOfWar || (this.explored[this.keyPos.y] && this.explored[this.keyPos.y][this.keyPos.x]))) {
      mctx.fillStyle = "#fbbf24";
      mctx.fillRect(this.keyPos.x * sx, this.keyPos.y * sy, sx + 1, sy + 1);
    }
    if (!this.fogOfWar || (this.explored[this.exitPos.y] && this.explored[this.exitPos.y][this.exitPos.x])) {
      mctx.fillStyle = "#10b981";
      mctx.fillRect(this.exitPos.x * sx, this.exitPos.y * sy, sx + 1, sy + 1);
    }

    // Player position on Radar (pulsing cyan)
    mctx.fillStyle = "#06b6d4";
    mctx.fillRect(this.player.x * sx - 1, this.player.y * sy - 1, sx + 2, sy + 2);
  }

  drawEmoji(emoji, x, y, size) {
    this.ctx.font = `${Math.floor(size * 0.74)}px sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(emoji, x + size / 2, y + size / 2 + 1);
  }
}

// Launch
window.addEventListener("DOMContentLoaded", () => {
  window.game = new RogueRealmGame();
});
