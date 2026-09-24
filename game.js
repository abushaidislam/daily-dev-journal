/**
 * ShadowDungeon — Procedural Web Roguelike Game Engine
 * Features: Turn-based game loop, Web Audio API sound FX, Fog of War, A* inspired enemy AI.
 */

// Sound Synthesizer (Web Audio API)
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

  playTone(freq, type, duration, endFreq = null) {
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
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio play error", e);
    }
  }

  step() { this.playTone(120, 'sine', 0.05, 80); }
  attack() { this.playTone(320, 'sawtooth', 0.12, 100); }
  hurt() { this.playTone(180, 'square', 0.18, 60); }
  pickupKey() { this.playTone(520, 'sine', 0.15, 880); }
  potion() { this.playTone(400, 'triangle', 0.25, 650); }
  chest() { this.playTone(600, 'triangle', 0.2, 900); }
  trap() { this.playTone(110, 'sawtooth', 0.25, 40); }
  win() {
    setTimeout(() => this.playTone(523, 'sine', 0.15), 0);
    setTimeout(() => this.playTone(659, 'sine', 0.15), 150);
    setTimeout(() => this.playTone(784, 'sine', 0.3), 300);
  }
}

const sfx = new SoundFX();

// Game State & Canvas Engine
class DungeonGame {
  constructor() {
    this.canvas = document.getElementById("dungeonCanvas");
    this.ctx = this.canvas.getContext("2d");

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
      turns: 0
    };

    this.entities = [];
    this.fogOfWar = true;
    this.explored = [];
    this.visible = [];
    this.viewRadius = 5;

    this.gameOver = false;
    this.victory = false;

    this.initDOM();
    this.bindEvents();
    this.loadLevel();
  }

  initDOM() {
    this.dom = {
      levelTitle: document.getElementById("level-title"),
      diffBadge: document.getElementById("diff-badge"),
      hpDisplay: document.getElementById("hp-display"),
      keyDisplay: document.getElementById("key-display"),
      goldDisplay: document.getElementById("gold-display"),
      turnsDisplay: document.getElementById("turns-display"),
      log: document.getElementById("game-log"),
      overlay: document.getElementById("overlay"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayMsg: document.getElementById("overlay-msg"),
      overlayTurns: document.getElementById("overlay-turns"),
      overlayGold: document.getElementById("overlay-gold"),
      btnRestart: document.getElementById("btn-restart"),
      btnFog: document.getElementById("btn-fog"),
      btnSound: document.getElementById("btn-sound"),
      btnReload: document.getElementById("btn-reload")
    };
  }

  bindEvents() {
    window.addEventListener("keydown", (e) => {
      sfx.init();
      if (this.gameOver || this.victory) return;

      const keys = {
        ArrowUp: { dx: 0, dy: -1 },
        KeyW: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 },
        KeyS: { dx: 0, dy: 1 },
        ArrowLeft: { dx: -1, dy: 0 },
        KeyA: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        KeyD: { dx: 1, dy: 0 },
        Space: { dx: 0, dy: 0 }
      };

      if (keys[e.code]) {
        e.preventDefault();
        this.stepTurn(keys[e.code].dx, keys[e.code].dy);
      }
    });

    // Mobile D-Pad
    document.querySelectorAll(".dpad-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        sfx.init();
        if (this.gameOver || this.victory) return;
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
    this.dom.btnReload.addEventListener("click", () => this.loadLevel());

    this.dom.btnFog.addEventListener("click", () => {
      this.fogOfWar = !this.fogOfWar;
      this.dom.btnFog.classList.toggle("active", this.fogOfWar);
      this.dom.btnFog.textContent = `👁️ Fog of War: ${this.fogOfWar ? 'ON' : 'OFF'}`;
      this.render();
    });

    this.dom.btnSound.addEventListener("click", () => {
      sfx.enabled = !sfx.enabled;
      this.dom.btnSound.classList.toggle("active", sfx.enabled);
      this.dom.btnSound.textContent = `🔊 Sound: ${sfx.enabled ? 'ON' : 'OFF'}`;
    });
  }

  async loadLevel() {
    this.setLog("Loading procedural dungeon from repository...");
    try {
      // Try fetching latest level JSON
      const res = await fetch("level.json?t=" + Date.now());
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      this.initLevel(data);
    } catch (e) {
      console.warn("Could not fetch level.json, using fallback local dungeon", e);
      this.initFallbackLevel();
    }
  }

  initLevel(data) {
    this.levelData = data;
    this.grid = data.grid;
    this.height = this.grid.length;
    this.width = this.grid[0].length;

    // Resize canvas
    this.tileSize = Math.floor(Math.min(960 / this.width, 576 / this.height));
    this.canvas.width = this.width * this.tileSize;
    this.canvas.height = this.height * this.tileSize;

    // Player
    this.player.x = data.player_start.x;
    this.player.y = data.player_start.y;
    this.player.hp = 5;
    this.player.maxHp = 5;
    this.player.hasKey = false;
    this.player.gold = 0;
    this.player.turns = 0;

    // Exit & Key
    this.keyPos = data.key_location;
    this.exitPos = data.exit_door;

    // Deep copy entities
    this.entities = JSON.parse(JSON.stringify(data.entities));

    // Fog of War arrays
    this.explored = Array.from({ length: this.height }, () => Array(this.width).fill(false));
    this.visible = Array.from({ length: this.height }, () => Array(this.width).fill(false));

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
    this.render();
    this.setLog("Dungeon generated. Explore carefully, find the key 🗝️, and reach the exit 🚪!");
  }

  initFallbackLevel() {
    // Basic fallback level if json cannot be read directly
    const fallback = {
      metadata: { level_id: 1, title: "Vault of Shadows", seed: "0xDEMO", difficulty: "MEDIUM" },
      player_start: { x: 2, y: 2 },
      key_location: { x: 10, y: 5 },
      exit_door: { x: 18, y: 8 },
      entities: [
        { id: "e1", type: "goblin", x: 6, y: 3, hp: 2, atk: 1, icon: "👾" },
        { id: "e2", type: "skeleton", x: 14, y: 7, hp: 3, atk: 2, icon: "💀" },
        { id: "p1", type: "health_potion", x: 8, y: 2, heal: 3, icon: "🧪" },
        { id: "c1", type: "treasure_chest", x: 12, y: 5, value: 50, icon: "💎" }
      ],
      grid: Array.from({ length: 12 }, (_, y) =>
        Array.from({ length: 22 }, (_, x) => (y === 0 || y === 11 || x === 0 || x === 21 ? 1 : 0))
      )
    };
    this.initLevel(fallback);
  }

  computeFOV() {
    // Reset visible
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.visible[y][x] = false;
      }
    }

    const px = this.player.x;
    const py = this.player.y;
    const r = this.viewRadius;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
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
    let actionTaken = false;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    // Wait in place
    if (dx === 0 && dy === 0) {
      actionTaken = true;
      this.setLog("You wait and catch your breath...");
    } else {
      // Out of bounds or wall
      if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height || this.grid[ny][nx] === 1) {
        sfx.step();
        return;
      }

      // Check combat with enemy
      const enemyIndex = this.entities.findIndex(e => e.x === nx && e.y === ny && e.hp > 0);
      if (enemyIndex !== -1) {
        const enemy = this.entities[enemyIndex];
        const dmg = 2;
        enemy.hp -= dmg;
        sfx.attack();
        actionTaken = true;

        if (enemy.hp <= 0) {
          this.setLog(`⚔️ You struck down the ${enemy.type}! (+15 Gold)`);
          this.player.gold += 15;
          this.entities.splice(enemyIndex, 1);
        } else {
          this.setLog(`⚔️ You slashed the ${enemy.type} for ${dmg} damage! (HP: ${enemy.hp})`);
        }
      } else {
        // Move player
        this.player.x = nx;
        this.player.y = ny;
        actionTaken = true;
        sfx.step();

        // Check Items & Traps
        this.checkTileInteraction();
      }
    }

    if (actionTaken) {
      this.player.turns++;
      this.computeFOV();
      this.updateHUD();

      // Enemy turn
      if (!this.victory && !this.gameOver) {
        this.enemyTurn();
      }

      this.render();
    }
  }

  checkTileInteraction() {
    const px = this.player.x;
    const py = this.player.y;

    // Key pickup
    if (!this.player.hasKey && px === this.keyPos.x && py === this.keyPos.y) {
      this.player.hasKey = true;
      sfx.pickupKey();
      this.setLog("🗝️ You found the Dungeon Key! The exit door is now unlocked!");
    }

    // Exit door
    if (px === this.exitPos.x && py === this.exitPos.y) {
      if (this.player.hasKey) {
        this.triggerVictory();
        return;
      } else {
        this.setLog("🚪 The iron door is locked tight! You must find the key 🗝️ first.");
      }
    }

    // Entity Pickups & Traps
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.x === px && ent.y === py) {
        if (ent.type === "health_potion") {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + ent.heal);
          sfx.potion();
          this.setLog(`🧪 Drank health potion! Restored ${ent.heal} HP.`);
          this.entities.splice(i, 1);
        } else if (ent.type === "treasure_chest") {
          this.player.gold += ent.value;
          sfx.chest();
          this.setLog(`💎 Looted treasure chest! Found ${ent.value} gold coins!`);
          this.entities.splice(i, 1);
        } else if (ent.type === "spike_trap") {
          this.player.hp -= ent.damage;
          sfx.trap();
          this.setLog(`🔥 OUCH! You stepped on a spike trap and took ${ent.damage} damage!`);
          if (this.player.hp <= 0) {
            this.triggerGameOver("Impaled by spike trap.");
            return;
          }
        }
      }
    }
  }

  enemyTurn() {
    for (const enemy of this.entities) {
      if (enemy.hp <= 0) continue;

      const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);

      // Attack if adjacent
      if (Math.abs(enemy.x - this.player.x) + Math.abs(enemy.y - this.player.y) === 1) {
        const dmg = enemy.atk || 1;
        this.player.hp -= dmg;
        sfx.hurt();
        this.setLog(`🩸 The ${enemy.type} strikes you for ${dmg} damage!`);

        if (this.player.hp <= 0) {
          this.triggerGameOver(`Killed in combat by ${enemy.type}.`);
          return;
        }
      } else if (dist <= 6) {
        // Move towards player
        const dx = Math.sign(this.player.x - enemy.x);
        const dy = Math.sign(this.player.y - enemy.y);

        let targetX = enemy.x + dx;
        let targetY = enemy.y;

        // Try X axis first
        if (this.grid[targetY][targetX] === 0 && !this.isTileOccupied(targetX, targetY)) {
          enemy.x = targetX;
          enemy.y = targetY;
        } else {
          // Try Y axis
          targetX = enemy.x;
          targetY = enemy.y + dy;
          if (this.grid[targetY][targetX] === 0 && !this.isTileOccupied(targetX, targetY)) {
            enemy.x = targetX;
            enemy.y = targetY;
          }
        }
      }
    }
    this.updateHUD();
  }

  isTileOccupied(x, y) {
    if (this.player.x === x && this.player.y === y) return true;
    return this.entities.some(e => e.x === x && e.y === y && e.hp > 0);
  }

  triggerVictory() {
    this.victory = true;
    sfx.win();
    this.dom.overlay.className = "overlay victory";
    this.dom.overlayTitle.textContent = "🏆 VICTORY!";
    this.dom.overlayMsg.textContent = "You successfully unlocked the door and escaped the dungeon alive!";
    this.dom.overlayTurns.textContent = this.player.turns;
    this.dom.overlayGold.textContent = this.player.gold;
    this.setLog("🎉 VICTORY! You conquered this dungeon!");
  }

  triggerGameOver(cause) {
    this.gameOver = true;
    sfx.hurt();
    this.dom.overlay.className = "overlay gameover";
    this.dom.overlayTitle.textContent = "💀 YOU DIED";
    this.dom.overlayMsg.textContent = `${cause} Better luck in the next procedural realm!`;
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
    // Hearts display
    let hearts = "";
    for (let i = 0; i < this.player.maxHp; i++) {
      hearts += i < this.player.hp ? "❤️" : "🖤";
    }
    this.dom.hpDisplay.textContent = hearts;
    this.dom.keyDisplay.textContent = this.player.hasKey ? "🗝️ ACQUIRED" : "🔒 LOCKED";
    this.dom.keyDisplay.style.color = this.player.hasKey ? "#fbbf24" : "#9ca3af";
    this.dom.goldDisplay.textContent = `💎 ${this.player.gold}`;
    this.dom.turnsDisplay.textContent = this.player.turns;
  }

  render() {
    const ctx = this.ctx;
    const ts = this.tileSize;

    ctx.fillStyle = "#090b10";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const isExplored = !this.fogOfWar || this.explored[y][x];
        const isVisible = !this.fogOfWar || this.visible[y][x];

        if (!isExplored) continue;

        const posX = x * ts;
        const posY = y * ts;

        // Draw Map Tiles
        if (this.grid[y][x] === 1) {
          // Wall
          ctx.fillStyle = isVisible ? "#272c42" : "#171a29";
          ctx.fillRect(posX, posY, ts, ts);
          ctx.strokeStyle = isVisible ? "#373e5c" : "#202438";
          ctx.strokeRect(posX + 0.5, posY + 0.5, ts - 1, ts - 1);
        } else {
          // Floor
          ctx.fillStyle = isVisible ? "#12141f" : "#0d0e17";
          ctx.fillRect(posX, posY, ts, ts);

          // Subtle floor dots
          ctx.fillStyle = isVisible ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.015)";
          ctx.fillRect(posX + ts / 2 - 1, posY + ts / 2 - 1, 2, 2);
        }

        // Only draw interactive entities if visible
        if (isVisible) {
          // Key
          if (!this.player.hasKey && x === this.keyPos.x && y === this.keyPos.y) {
            this.drawEmoji("🗝️", posX, posY, ts);
          }

          // Exit Door
          if (x === this.exitPos.x && y === this.exitPos.y) {
            this.drawEmoji(this.player.hasKey ? "🚪" : "🔒", posX, posY, ts);
          }
        }
      }
    }

    // Draw Entities
    for (const ent of this.entities) {
      if (!this.fogOfWar || this.visible[ent.y][ent.x]) {
        const posX = ent.x * ts;
        const posY = ent.y * ts;
        this.drawEmoji(ent.icon || "👾", posX, posY, ts);

        // Draw mini enemy health bar
        if (ent.hp && ent.maxHp !== undefined || (ent.atk && ent.hp > 0)) {
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(posX + 4, posY + 2, (ts - 8) * (ent.hp / 3), 3);
        }
      }
    }

    // Draw Player
    const px = this.player.x * ts;
    const py = this.player.y * ts;
    this.drawEmoji("🧙‍♂️", px, py, ts);
  }

  drawEmoji(emoji, x, y, size) {
    this.ctx.font = `${Math.floor(size * 0.72)}px sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(emoji, x + size / 2, y + size / 2 + 1);
  }
}

// Start Game on load
window.addEventListener("DOMContentLoaded", () => {
  window.game = new DungeonGame();
});
