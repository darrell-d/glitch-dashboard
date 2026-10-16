/* Browser port of gen_art/LawnMower. The simulation begins on first display and keeps ticking. */
(function (root) {
  'use strict';

  const WIDTH = 100;
  const HEIGHT = 75;
  const MOWER_SIZE = 4;
  const FPS = 10;
  const DIRECTIONS = ['up', 'down', 'left', 'right'];

  class World {
    constructor(random = Math.random) {
      this.random = random;
      this.grass = Array.from({ length: WIDTH }, () => new Uint8Array(HEIGHT));
      this.x = 51;
      this.y = 51;
      this.direction = 'up';
      this.openingTicks = 10;
      this.score = 0;
      this.ticks = 0;
    }

    grow() {
      for (let x = 0; x < WIDTH; x += 1) {
        for (let y = 0; y < HEIGHT; y += 1) {
          if (this.grass[x][y] < 50 && Math.floor(this.random() * 20) === 0) this.grass[x][y] += 1;
        }
      }
    }

    patchScore(startX, startY) {
      let score = 0;
      for (let x = startX; x < startX + MOWER_SIZE; x += 1) {
        for (let y = startY; y < startY + MOWER_SIZE; y += 1) {
          if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) score += this.grass[x][y];
        }
      }
      return score;
    }

    chooseDirection() {
      const scores = {
        left: this.patchScore(this.x - MOWER_SIZE, this.y),
        right: this.patchScore(this.x + MOWER_SIZE, this.y),
        up: this.patchScore(this.x, this.y - MOWER_SIZE),
        down: this.patchScore(this.x, this.y + MOWER_SIZE),
      };
      const highest = Math.max(...Object.values(scores));
      const winners = DIRECTIONS.filter((direction) => scores[direction] === highest);
      if (highest > 0 && winners.length === 1) this.direction = winners[0];
      if (this.openingTicks > 0) {
        this.direction = 'up';
        this.openingTicks -= 1;
      }
    }

    move() {
      if (this.direction === 'up') this.y -= 1;
      if (this.direction === 'down') this.y += 1;
      if (this.direction === 'left') this.x -= 1;
      if (this.direction === 'right') this.x += 1;
      if (this.x < 0) { this.x = 0; this.direction = 'right'; }
      if (this.x > WIDTH - MOWER_SIZE) { this.x = WIDTH - MOWER_SIZE; this.direction = 'left'; }
      if (this.y < 0) { this.y = 0; this.direction = 'down'; }
      if (this.y > HEIGHT - MOWER_SIZE) { this.y = HEIGHT - MOWER_SIZE; this.direction = 'up'; }
    }

    cut() {
      this.score = this.patchScore(this.x, this.y);
      for (let x = this.x; x < this.x + MOWER_SIZE; x += 1) {
        for (let y = this.y; y < this.y + MOWER_SIZE; y += 1) this.grass[x][y] = 0;
      }
    }

    tick() {
      this.grow();
      this.chooseDirection();
      this.move();
      this.cut();
      this.ticks += 1;
    }
  }

  class Display {
    constructor(canvas, { random = Math.random, setTimer = setInterval } = {}) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: false });
      this.world = new World(random);
      this.visible = false;
      this.timer = setTimer(() => this.step(), 1000 / FPS);
    }

    setVisible(visible) {
      this.visible = visible;
      if (visible) {
        this.resize();
        this.draw();
      }
    }

    resize() {
      const ratio = Math.min(root.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
    }

    step() {
      this.world.tick();
      if (this.visible) this.draw();
    }

    draw() {
      const context = this.context;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const cellWidth = width / WIDTH;
      const cellHeight = height / HEIGHT;
      context.fillStyle = '#5c3317';
      context.fillRect(0, 0, width, height);
      for (let x = 0; x < WIDTH; x += 1) {
        for (let y = 0; y < HEIGHT; y += 1) {
          const grass = this.world.grass[x][y];
          if (!grass) continue;
          context.fillStyle = `rgb(0 ${Math.max(grass * 5, 50)} 0)`;
          context.fillRect(Math.floor(x * cellWidth), Math.floor(y * cellHeight),
            Math.ceil(cellWidth), Math.ceil(cellHeight));
        }
      }
      const x = this.world.x * cellWidth;
      const y = this.world.y * cellHeight;
      const mowerWidth = MOWER_SIZE * cellWidth;
      const mowerHeight = MOWER_SIZE * cellHeight;
      const points = {
        up: [[x, y + mowerHeight], [x + mowerWidth / 2, y], [x + mowerWidth, y + mowerHeight]],
        down: [[x, y], [x + mowerWidth / 2, y + mowerHeight], [x + mowerWidth, y]],
        left: [[x + mowerWidth, y], [x, y + mowerHeight / 2], [x + mowerWidth, y + mowerHeight]],
        right: [[x, y], [x + mowerWidth, y + mowerHeight / 2], [x, y + mowerHeight]],
      }[this.world.direction];
      context.beginPath();
      context.moveTo(...points[0]);
      context.lineTo(...points[1]);
      context.lineTo(...points[2]);
      context.closePath();
      context.fillStyle = '#ff9f1c';
      context.fill();
      context.strokeStyle = '#fff7df';
      context.lineWidth = Math.max(1, width / 1200);
      context.stroke();
      context.fillStyle = '#fff';
      context.font = `600 ${Math.max(14, width / 65)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = 'right';
      context.textBaseline = 'top';
      context.fillText(`GCP/s  ${this.world.score * FPS}`, width - width * .035, height * .035);
    }
  }

  let display;
  function show(canvas) {
    if (!display) display = new Display(canvas);
    display.setVisible(true);
    return display;
  }
  function hide() { if (display) display.setVisible(false); }
  function resize() { if (display?.visible) { display.resize(); display.draw(); } }
  function instance() { return display; }

  const api = { WIDTH, HEIGHT, FPS, World, Display, show, hide, resize, instance };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LawnMowerArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
