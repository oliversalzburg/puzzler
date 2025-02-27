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
import { TWO_PI, clamp, distance } from "@oliversalzburg/js-utils/math/core.js";
import { Vector2, subtractVector2 } from "@oliversalzburg/js-utils/math/vector2.js";

const canvasNode = getDocumentElementTypeByIdStrict(document, "main", HTMLCanvasElement);

// ----------------------- Non-boilerplate code starts here -----------------------

const urlParameters = new URLSearchParams(document.location.search);
const devMode = urlParameters.get("devMode") !== null;

const applicationOptions = {
  blendingAdditive: false,
  blendingSubtractive: false,
  canvasColorDark: fromRGBA(0, 0, 0, 1),
  canvasColorLight: fromRGBA(255, 255, 255, 5),
  darkMode: true,
  /**
   * Instead of drawing a perfect line, offset each pixel slightly.
   */
  fuzzyness: 0,
  iterationsPerUpdate: 1,
  padding: 20,
  pieceCount: 12,
  particleCount: 1000,
  sandPainterGrains: 50,
  scale: 1,
  seed: seedFromString("gencha"),
  useSandPainter: true,

  viewport: {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
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
  readonly sandPainter: SandPainter;

  readonly pieceEdgeLength: number;
  readonly pieces: Array<boolean>;
  position: Vector2;
  direction: Vector2;
  readonly directionOriginal: Vector2;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly pieceCount: number;
  readonly variance: number;
  readonly flipIndex: number;

  drawKnob: boolean;
  knobDirection: Vector2;
  knobDirectionTarget: Vector2;
  knobRotation: number;
  knobStep: number;

  /**
   * Constructs a new {@link Walker}.
   * @param canvas - The canvas to interact with.
   * @param random - The PRNG to use.
   * @param options -
   * @param position - The position to start from.
   * @param direction - The direction of the walker.
   * @param isFirst - Is this the first row or column?
   * @param isLast - Is this the last row or column?
   * @param pieceCount - How many pieces are there per row/column?
   * @param pieceEdgeLength - How long is each piece edge?
   * @param pieces -
   * @param flipIndex -
   */
  constructor(
    canvas: Canvas2D,
    random: Random,
    options: ApplicationOptions,
    position: Vector2,
    direction: Vector2,
    isFirst: boolean,
    isLast: boolean,
    pieceCount: number,
    pieceEdgeLength: number,
    pieces: Array<boolean>,
    flipIndex: number,
  ) {
    this.canvas = canvas;
    this.random = random;
    this.options = options;
    this.sandPainter = new SandPainter(this.canvas, this.random, this.options);

    this.pieceEdgeLength = pieceEdgeLength;
    this.pieces = pieces;
    this.position = position;
    this.direction = direction;
    this.directionOriginal = new Vector2(0, 0);
    this.isFirst = isFirst;
    this.isLast = isLast;
    this.pieceCount = pieceCount;
    this.variance = random.nextFloat();
    this.flipIndex = flipIndex;

    this.drawKnob = false;
    this.knobDirection = new Vector2(0, 0);
    this.knobDirectionTarget = new Vector2(0, 0);
    this.knobRotation = 0;
    this.knobStep = 0;
  }

  walk() {
    const halfStep = this.pieceEdgeLength / 2;
    //const halfStep2 = halfStep / 2;
    //const halfStep4 = halfStep / 4;

    this.position.addMultiply(this.direction, 0.35);

    if (this.drawKnob) {
      this.direction.add(this.knobDirection).normalize();
      //this.direction.lerp(this.knobDirectionTarget,0.1);

      const knobSign = 0 < this.knobRotation ? 1 : -1;
      const knobScale = 1 / this.options.scale;
      if (this.directionOriginal.y === 0) {
        this.knobDirection.rotate(5 * knobSign * knobScale);
      } else {
        this.knobDirection.rotate(5 * knobSign * knobScale);
      }
      this.knobRotation += knobSign;

      const l = subtractVector2(this.position, this.knobDirectionTarget).length();
      if (l < 2 || 60 * this.options.scale < ++this.knobStep) {
        this.drawKnob = false;
        this.position.set(this.knobDirectionTarget);
        this.direction.set(this.directionOriginal);
      }
    } else {
      if (this.isFirst || this.isLast) {
        return;
      }

      if (this.direction.y === 0) {
        const directionSign = 0 < this.direction.x ? 1 : -1;
        const relativeX = (this.position.x - this.options.padding) % this.pieceEdgeLength;
        const currentPieceMiddleX = this.position.x - relativeX + halfStep - 5 * directionSign;
        const target = new Vector2(currentPieceMiddleX, this.position.y);
        const distanceX = Vector2.fromVector2(target).subtract(this.position).length();

        if (distanceX < 1) {
          this.drawKnob = true;
          this.knobStep = 0;
          this.position = target;
          const y = Math.trunc((this.position.y - this.options.padding) / this.pieceEdgeLength);
          const x = Math.trunc((this.position.x - this.options.padding) / this.pieceEdgeLength);
          const pieceIndex = x + y * this.options.pieceCount;
          this.knobRotation = this.pieces[pieceIndex] ? directionSign : -directionSign;
          this.directionOriginal.set(this.direction);
          this.knobDirection.set(this.direction).rotate(this.knobRotation === 1 ? 140 : 240);
          this.knobDirectionTarget.set(this.position).addMultiply(this.direction, 10);
        }
      } else {
        const directionSign = 0 < this.direction.y ? 1 : -1;
        const relativeY = (this.position.y - this.options.padding) % this.pieceEdgeLength;
        const currentPieceMiddleY = this.position.y - relativeY + halfStep - 5 * directionSign;
        const target = new Vector2(this.position.x, currentPieceMiddleY);
        const distanceY = Vector2.fromVector2(target).subtract(this.position).length();

        if (distanceY < 1) {
          this.drawKnob = true;
          this.knobStep = 0;
          this.position = target;
          const y = Math.trunc((this.position.y - this.options.padding) / this.pieceEdgeLength);
          const x = Math.trunc((this.position.x - this.options.padding) / this.pieceEdgeLength);
          const pieceIndex = x + y * this.options.pieceCount;
          this.knobRotation = this.pieces[pieceIndex] ? directionSign : -directionSign;
          this.directionOriginal.set(this.direction);
          this.knobDirection.set(this.direction).rotate(this.knobRotation === 1 ? 240 : 140);
          this.knobDirectionTarget.set(this.position).addMultiply(this.direction, 10);
        }
      }
    }
  }

  /**
   * Draw the walker.
   * @param timestamp -
   * @param skipSandpainter -
   */
  drawWalker(timestamp: number, skipSandpainter: boolean) {
    let cx = this.position.x + randomRange(-this.options.fuzzyness, this.options.fuzzyness);
    let cy = this.position.y + randomRange(-this.options.fuzzyness, this.options.fuzzyness);

    const center = new Vector2(this.canvas.width / 2, this.canvas.height / 2);
    const vectorCenter = new Vector2(
      center.x - this.position.x + Math.sin(timestamp / 6000) * this.pieceEdgeLength,
      center.y - this.position.y + Math.cos(timestamp / 3000) * this.pieceEdgeLength * 2,
    );
    const length = distance(this.position.x, this.position.y, center.x, center.y);
    const vectorCenterNormalized = new Vector2(vectorCenter.x / length, vectorCenter.y / length);

    const noise = this.random.simplex3(
      this.position.x / this.canvas.width,
      this.position.y / this.canvas.height,
      timestamp / 10000,
    );

    cx = Math.trunc(
      cx +
        noise *
          (Math.max(0, center.x - length - 50) *
            Math.sin((length / center.x) * -TWO_PI) *
            ((this.position.x - center.x) / center.x)),
    );
    cy = Math.trunc(
      cy +
        noise *
          (Math.max(0, center.y - length - 50) *
            Math.sin((length / center.y) * -TWO_PI) *
            ((this.position.y - center.y) / center.y)),
    );

    if (this.options.useSandPainter && !skipSandpainter) {
      const finalVector = new Vector2(
        vectorCenterNormalized.x * this.pieceEdgeLength,
        vectorCenterNormalized.y * this.pieceEdgeLength,
      );
      this.sandPainter.renderSandpainter(cx + finalVector.x, cy + finalVector.y, cx, cy);
    }

    putPixel32(this.canvas, cx, cy, this.sandPainter.color, 255);
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

    this.canvas.fade(
      this.options.darkMode ? this.options.canvasColorDark : this.options.canvasColorLight,
    );

    for (const index of toReplace.reverse()) {
      this.walker[index] = this.spawnWalker();
    }
  }

  spawnWalker() {
    const isHorizontal = this.random.nextBoolean();
    const flipIndex = this.random.next() % this.pieces.length;
    const isFlipped = this.pieces[flipIndex];
    const walkerIndex = this.random.next() % this.options.pieceCount;

    if (isHorizontal) {
      return new Walker(
        this.canvas,
        this.random,
        this.options,
        new Vector2(
          this.random.nextRange(this.options.padding, this.canvas.width - this.options.padding),
          this.options.padding +
            (walkerIndex / (this.options.pieceCount - 1)) *
              (this.canvas.height - this.options.padding * 2),
        ),
        isFlipped ? new Vector2(-1, 0) : new Vector2(1, 0),
        walkerIndex === 0,
        walkerIndex === this.options.pieceCount - 1,
        this.options.pieceCount,
        (this.canvas.width - this.options.padding * 2) / (this.options.pieceCount - 1),
        this.pieces,
        flipIndex,
      );
    }

    return new Walker(
      this.canvas,
      this.random,
      this.options,
      new Vector2(
        (walkerIndex / (this.options.pieceCount - 1)) *
          (this.canvas.width - this.options.padding * 2) +
          this.options.padding,
        this.random.nextRange(this.options.padding, this.canvas.height - this.options.padding),
      ),
      isFlipped ? new Vector2(0, -1) : new Vector2(0, 1),
      walkerIndex === 0,
      walkerIndex === this.options.pieceCount - 1,
      this.options.pieceCount,
      (this.canvas.height - this.options.padding * 2) / (this.options.pieceCount - 1),
      this.pieces,
      flipIndex,
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
