import { Random, randomRange, seedFromString } from "@oliversalzburg/js-utils/data/random.js";
import { getDocumentElementTypeByIdStrict } from "@oliversalzburg/js-utils/dom/core.js";
import { CanvasSandbox } from "@oliversalzburg/js-utils/graphics/canvas-sandbox.js";
import {
  Canvas2D,
  putPixel32,
  putPixel32Add,
  putPixel32Sub,
} from "@oliversalzburg/js-utils/graphics/canvas2d.js";
import { fromRGBA } from "@oliversalzburg/js-utils/graphics/core.js";
import { palette } from "@oliversalzburg/js-utils/graphics/palette.js";
import { clamp, distance, TWO_PI } from "@oliversalzburg/js-utils/math/core.js";
import { subtractVector2, Vector2 } from "@oliversalzburg/js-utils/math/vector2.js";

const canvasNode = getDocumentElementTypeByIdStrict(document, "main", HTMLCanvasElement);

// ----------------------- Non-boilerplate code starts here -----------------------

const urlParameters = new URLSearchParams(document.location.search);
const devMode = urlParameters.get("devMode") !== null;

const applicationOptions = {
  blendingAdditive: true,
  blendingSubtractive: true,
  canvasColorDark: fromRGBA(0, 0, 0, 1),
  canvasColorLight: fromRGBA(255, 255, 255, 5),
  darkMode: true,
  /**
   * Instead of drawing a perfect line, offset each pixel slightly.
   */
  fuzzyness: 0,
  iterationsPerUpdate: 1,
  padding: 20,
  particleCount: 3000,
  pieceCount: 12,
  sandPainterGrains: 50,
  scale: 1,
  seed: seedFromString("gencha"),
  useSandPainter: false,

  viewport: {
    h: 1,
    w: 1,
    x: 0,
    y: 0,
  },
};

type ApplicationOptions = typeof applicationOptions;
type Plotter = (canvas: Canvas2D, x: number, y: number, color: number, alpha: number) => void;

class SandPainter {
  readonly canvas: Canvas2D;
  readonly random: Random;
  readonly options: ApplicationOptions;
  readonly color: number;
  grainDistance: number;
  readonly plotter: Plotter;
  readonly maxAlpha: number;

  /**
   * Construct a {@link SandPainter}.
   * @param canvas -
   * @param random -
   * @param options -
   */
  constructor(canvas: Canvas2D, random: Random, options: ApplicationOptions) {
    this.canvas = canvas;
    this.random = random;
    this.options = options;

    this.color = palette.someColor();
    this.grainDistance = randomRange(0.001, 0.01);

    if (this.options.blendingAdditive && this.options.blendingSubtractive) {
      // Both additive and subtractive blending (pick random)
      const r = random.nextFloat();
      if (r > 0.5) {
        this.plotter = putPixel32Add;
      } else {
        this.plotter = putPixel32Sub;
      }
      this.maxAlpha = 128;
    } else if (this.options.blendingAdditive) {
      // Only additive blending
      this.plotter = putPixel32Add;
      this.maxAlpha = 128;
    } else if (this.options.blendingSubtractive) {
      // Only subtractive blending
      this.plotter = putPixel32Sub;
      this.maxAlpha = 128;
    } else {
      // Alpha blending
      this.plotter = putPixel32;
      this.maxAlpha = 256;
    }
  }

  /**
   * Renders a line of grains.
   * @param x - The X coordinate to draw to.
   * @param y - The Y coordinate to draw to.
   * @param ox - The X coordinate of the origin.
   * @param oy - The Y coordinate of the origin.
   */
  renderSandpainter(x: number, y: number, ox: number, oy: number) {
    // modulate gain
    this.grainDistance += randomRange(-0.05, 0.05);
    const maxg = 1.0;
    if (this.grainDistance < 0) {
      this.grainDistance = 0;
    }
    if (this.grainDistance > maxg) {
      this.grainDistance = maxg;
    }

    // calculate grains by distance
    //const grains = Math.trunc( Math.sqrt( ( ox - x ) * ( ox - x ) + ( oy - y ) * ( oy - y ) ) );

    // lay down grains of sand (transparent pixels)
    const w = this.grainDistance / (this.options.sandPainterGrains - 1);

    let alpha = 0;
    let sine = 0;
    let xpos = 0;
    let ypos = 0;

    for (let i = 0; i < this.options.sandPainterGrains; ++i) {
      alpha = clamp(0.1 - i / (this.options.sandPainterGrains * 10.0), 0, 255);
      sine = Math.sin(Math.sin(i * w));
      xpos = Math.trunc(ox + (x - ox) * sine);
      ypos = Math.trunc(oy + (y - oy) * sine);

      this.plotter(this.canvas, xpos, ypos, this.color, alpha * this.maxAlpha);
    }
  }
}

class Walker {
  readonly canvas: Canvas2D;
  readonly random: Random;
  readonly options: ApplicationOptions;
  readonly grid: Array<Array<boolean>>;
  readonly sandPainter: SandPainter;

  position: Vector2;
  direction: Vector2;
  readonly directionOriginal: Vector2;
  readonly variance: number;

  /**
   * Constructs a new {@link Walker}.
   * @param canvas - The canvas to interact with.
   * @param random - The PRNG to use.
   * @param options -
   * @param position - The position to start from.
   * @param direction - The direction of the walker.
   */
  constructor(
    canvas: Canvas2D,
    random: Random,
    options: ApplicationOptions,
    grid: Array<Array<boolean>>,
    position: Vector2,
    direction: Vector2,
  ) {
    this.canvas = canvas;
    this.random = random;
    this.options = options;
    this.grid = grid;
    this.sandPainter = new SandPainter(this.canvas, this.random, this.options);

    this.position = position;
    this.direction = direction;
    this.directionOriginal = new Vector2(0, 0);
    this.variance = random.nextFloat();
  }

  walk() {
    this.position.addMultiply(this.direction, 0.35);
  }

  /**
   * Draw the walker.
   * @param timestamp -
   * @param skipSandpainter -
   */
  drawWalker(timestamp: number, skipSandpainter: boolean) {
    let cx = this.position.x + randomRange(-this.options.fuzzyness, this.options.fuzzyness);
    let cy = this.position.y + randomRange(-this.options.fuzzyness, this.options.fuzzyness);

    if (!this.grid[Math.round(cy / 20)][Math.round(cx / 20)]) {
      return;
    }

    const center = new Vector2(this.canvas.width / 2, this.canvas.height / 2);
    const vectorCenter = new Vector2(
      center.x - this.position.x + Math.sin(timestamp / 6000),
      center.y - this.position.y + Math.cos(timestamp / 3000) * 2,
    );
    const length = distance(this.position.x, this.position.y, center.x, center.y);
    const vectorCenterNormalized = new Vector2(vectorCenter.x / length, vectorCenter.y / length);

    const noise = this.random.simplex3(
      this.position.x / this.canvas.width,
      this.position.y / this.canvas.height,
      timestamp / 10000,
    );

    cx = Math.trunc(cx + noise);
    cy = Math.trunc(cy + noise);

    if (this.options.useSandPainter && !skipSandpainter) {
      const finalVector = new Vector2(vectorCenterNormalized.x, vectorCenterNormalized.y);
      this.sandPainter.renderSandpainter(cx + finalVector.x, cy + finalVector.y, cx, cy);
    }

    this.sandPainter.plotter(this.canvas, cx, cy, this.sandPainter.color, 255);
  }
}

class Application {
  canvas: Canvas2D;
  options: ApplicationOptions;
  random: Random;

  pieces = new Array<boolean>();
  walker = new Array<Walker>();

  paused = false;

  constructor(canvas: Canvas2D, options: ApplicationOptions) {
    this.options = options;
    this.canvas = canvas;
    this.random = new Random(options.seed);

    this.options.blendingAdditive = options.darkMode;
    this.options.blendingSubtractive = !options.darkMode;

    this.reconfigure(this.canvas, this.options);
  }

  reconfigure(canvas: Canvas2D, options: Partial<ApplicationOptions> = {}) {
    const minDimension = Math.min(document.body.clientHeight, document.body.clientWidth);
    this.canvas.canvasElement.height = minDimension / 2;
    this.canvas.canvasElement.width = minDimension / 2;
    this.canvas.refreshCanvasNode();

    this.options = {
      ...this.options,
      ...options,
      scale: minDimension / 2 / 512,
    };
    this.canvas = canvas;
    this.random = new Random(this.options.seed);
  }

  /**
   * Draw a frame.
   * @param _delta -
   * @param timestamp -
   */
  onDraw(_delta: number, timestamp: number) {
    if (this.paused) {
      return;
    }

    let iterations = 10;
    while (0 < --iterations) {
      const toReplace = [];

      for (const walker of this.walker) {
        walker.walk();
      }

      for (const walker of this.walker) {
        if (
          walker.position.x < this.options.padding ||
          this.canvas.width - this.options.padding < walker.position.x ||
          walker.position.y < this.options.padding ||
          this.canvas.height - this.options.padding < walker.position.y 
        ) {
          toReplace.push(this.walker.indexOf(walker));
        }
      }

      for (const walker of this.walker) {
        walker.drawWalker(timestamp, this.random.nextBoolean());
      }

      for (const index of toReplace.reverse()) {
        this.walker[index] = this.spawnWalker();
      }
    }

    this.canvas.fade(
      this.options.darkMode ? this.options.canvasColorDark : this.options.canvasColorLight,
    );

    let walksPerFrame = 10;
    while (0 < --walksPerFrame) {
      const canWalkLeft = 0 < this.gridWalkX - 2 && !this.grid[this.gridWalkY][this.gridWalkX - 2];
      const canWalkRight =
        this.gridWalkX < Math.trunc(this.canvas.width / 20) - 2 &&
        !this.grid[this.gridWalkY][this.gridWalkX + 2];
      const canWalkUp = 0 < this.gridWalkY - 2 && !this.grid[this.gridWalkY - 2][this.gridWalkX];
      const canWalkDown =
        this.gridWalkY < Math.trunc(this.canvas.height / 20) - 2 &&
        !this.grid[this.gridWalkY + 2][this.gridWalkX];

      if (!canWalkLeft && !canWalkRight && !canWalkUp && !canWalkDown) {
        const back = this.gridWalk.pop();
        if (back !== undefined) {
          this.gridWalkY = back[0];
          this.gridWalkX = back[1];
        } else {
          break;
        }
      } else {
        this.gridWalk.push([this.gridWalkY, this.gridWalkX]);
      }

      const r = Math.trunc(this.random.nextRange(0, 4));
      if (canWalkLeft && r === 0) {
        this.grid[this.gridWalkY][this.gridWalkX - 1] = true;
        this.grid[this.gridWalkY][this.gridWalkX - 2] = true;
        this.gridWalkX -= 2;
        this.gridWalk.push([this.gridWalkY, this.gridWalkX]);
        continue;
      }
      if (canWalkRight && r === 1) {
        this.grid[this.gridWalkY][this.gridWalkX + 1] = true;
        this.grid[this.gridWalkY][this.gridWalkX + 2] = true;
        this.gridWalkX += 2;
        this.gridWalk.push([this.gridWalkY, this.gridWalkX]);
        continue;
      }
      if (canWalkUp && r === 2) {
        this.grid[this.gridWalkY - 1][this.gridWalkX] = true;
        this.grid[this.gridWalkY - 2][this.gridWalkX] = true;
        this.gridWalkY -= 2;
        this.gridWalk.push([this.gridWalkY, this.gridWalkX]);
        continue;
      }
      if (canWalkDown && r === 3) {
        this.grid[this.gridWalkY + 1][this.gridWalkX] = true;
        this.grid[this.gridWalkY + 2][this.gridWalkX] = true;
        this.gridWalkY += 2;
        this.gridWalk.push([this.gridWalkY, this.gridWalkX]);
        continue;
      }
    }
  }

  grid = new Array<Array<boolean>>();
  gridWalk = new Array<[number, number]>();
  gridWalkX = 1;
  gridWalkY = 1;

  spawnWalker() {
    const isHorizontal = this.random.nextBoolean();
    const walkerIndex = this.random.next() % this.options.pieceCount;

    /*
    if (isHorizontal) {
      return new Walker(
        this.canvas,
        this.random,
        this.options,
        this.grid,
        new Vector2(
          this.random.nextRange(this.options.padding, this.canvas.width - this.options.padding),
          this.options.padding +
            (walkerIndex / (this.options.pieceCount - 1)) *
              (this.canvas.height - this.options.padding * 2),
        ),
        new Vector2(this.random.nextFloat() - 0.5, this.random.nextFloat() - 0.5),
      );
    }

    return new Walker(
      this.canvas,
      this.random,
      this.options,
      this.grid,
      new Vector2(
        (walkerIndex / (this.options.pieceCount - 1)) *
          (this.canvas.width - this.options.padding * 2) +
          this.options.padding,
        this.random.nextRange(this.options.padding, this.canvas.height - this.options.padding),
      ),
      new Vector2(this.random.nextFloat() - 0.5, this.random.nextFloat() - 0.5),
    );
    */

    return new Walker(
      this.canvas,
      this.random,
      this.options,
      this.grid,
      new Vector2(
        this.random.nextRange(this.options.padding, this.canvas.width - this.options.padding),
        this.random.nextRange(this.options.padding, this.canvas.height - this.options.padding),
      ),
      new Vector2(this.random.nextFloat() - 0.5, this.random.nextFloat() - 0.5),
    );
  }

  start() {
    this.paused = false;

    this.canvas.clearWith(
      ((this.options.darkMode ? this.options.canvasColorDark : this.options.canvasColorLight) <<
        2) |
        0xff,
    );
    this.canvas.update();

    this.pieces = new Array<boolean>();
    this.walker = new Array<Walker>();

    const pieceCount = 11;
    for (let pieceIndex = 0; pieceIndex < pieceCount * (pieceCount + 1); ++pieceIndex) {
      this.pieces[pieceIndex] = this.random.nextBoolean();
    }

    for (let walkerIndex = 0; walkerIndex < this.options.particleCount; ++walkerIndex) {
      this.walker.push(this.spawnWalker());
    }

    this.grid = new Array<Array<boolean>>();
    for (let y = 0; y <= Math.trunc(this.canvas.height / 20); ++y) {
      this.grid[y] = new Array<boolean>();
      for (let x = 0; x <= Math.trunc(this.canvas.width / 20); ++x) {
        this.grid[y][x] = false;
      }
    }
    this.grid[1][1] = true;
  }

  pause(paused: boolean): void {
    this.paused = paused;
  }
}

const canvasSandbox = new CanvasSandbox(
  window,
  canvasNode,
  Canvas2D,
  Application,
  applicationOptions,
  {
    devMode,
  },
);
canvasSandbox.run();
