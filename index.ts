import * as Phaser from "phaser";

var config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "root",
  width: 800,
  height: 600,
  backgroundColor: "#7FFFD4",
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

var game = new Phaser.Game(config);

function preload(this: Scene) {
  const scene: Scene = this;
  scene.load.atlas(
    "human",
    "/resources/human/human.png",
    "/resources/human/human.json"
  );
  scene.load.image("water", "/resources/textures/water.png");
  // scene.load.glsl("someShader", "/resources/shaders/bundle.glsl");
}

type Direction = "W" | "NW" | "N" | "NE" | "E" | "SE" | "S" | "SW";
// const directions: Direction[] = ["W", "NW", "N", "NE", "E", "SE", "S", "SW"];

type AnimState = {
  frame: number;
  state: "walk" | "idle";
  direction: Direction;
  lastFrameChange: number;
};

const mapInfo = {
  height: 10000,
  width: 10000,
  spawn: { x: 5000, y: 5000 }
};
type MapInfo = typeof mapInfo;
type Model = {
  player: Player;
};
type Vec2D = { x: number; y: number };
type Player = {
  spell: Vec2D[];
};

type Scene = Phaser.Scene & {
  player: Phaser.GameObjects.Sprite;
  moveKeys: Record<"up" | "down" | "right" | "left", { isDown: boolean }>;
  animState: AnimState;
  spell: Spell;
  text: Phaser.GameObjects.Text;
  mapInfo: MapInfo;
  model: Model;
};

class Spell extends Phaser.GameObjects.Polygon {
  private minX: number;
  private minY: number;
  private maxX: number;
  private maxY: number;
  addPoint(x: number, y: number) {
    this.pathData.push(x, y);
    if (this.minX === undefined) {
      this.minX = x;
      this.maxX = x;
      this.minY = y;
      this.maxY = y;
    } else {
      if (x < this.minX) {
        this.minX = x;
      } else if (x > this.maxX) {
        this.maxX = x;
      }
      if (y < this.minY) {
        this.minY = y;
      } else if (y > this.maxY) {
        this.maxY = y;
      }
    }
  }
  get box() {
    return new Phaser.Geom.Rectangle(
      this.minX,
      this.minY,
      this.maxX - this.minX,
      this.maxY - this.minY
    );
  }
}

class GrayscalePipeline extends Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline {
  constructor() {
    super({
      game,
      renderer: game.renderer,
      fragShader: `
            precision mediump float;
            uniform vec2  resolution;
            uniform float tx;
            uniform float ty;
            uniform float r;
            uniform sampler2D aaa;
            varying vec2 outTexCoord;
            vec3 makeCircle(vec2 st,vec2 center, vec3 col){
                float d = distance(st,center);
                float pct = smoothstep(r,r+0.1,d);
                return vec3(1.0-pct)*col;
            } 
            void main(void) {
                    // st is the normalized position of the pixel in the scene
                vec2 st = vec2(gl_FragCoord.x/resolution.x,gl_FragCoord.y/resolution.y);
                vec4 color = texture2D(aaa, outTexCoord);
                gl_FragColor = color;
                gl_FragColor.r = tx;
                gl_FragColor.g = ty;
                gl_FragColor.b = r;
            }
            `
    });
  }
}

function createScene(scene: Scene, map: MapInfo) {
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const pipeline = renderer.addPipeline("Grayscale", new GrayscalePipeline());
  scene.cameras.main.setRenderToTexture(pipeline);

  scene.add.image(0, 0, "water").setScale(100);
  const player = scene.add.sprite(0, 0, "human");
  player.setDepth(1);
  const text = scene.add.text(200, 200, []);
  text.setScrollFactor(0);
  text.setDepth(2);

  player.setOrigin(0.5, 0.5);

  scene.cameras.main.zoom = 1;
  scene.cameras.main.startFollow(player);
  scene.text = text;
  scene.mapInfo = map;
  const moveKeys = scene.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D
  });
  scene.moveKeys = moveKeys as Scene["moveKeys"];
  scene.player = player;
  scene.animState = {
    direction: "N",
    frame: 0,
    lastFrameChange: 0,
    state: "idle"
  };
  scene.input.on("pointerdown", function() {
    const spell = new Spell(scene, 0, 0, [
      scene.input.mousePointer.worldX,
      scene.input.mousePointer.worldY
    ]);
    scene.add.existing(spell);
    scene.spell = spell;
    scene.spell.setStrokeStyle(2, 0xff0000);
  });
  const shader = new Phaser.Display.BaseShader("Plasma", `
precision highp float;
uniform float time;
uniform vec2 resolution;
varying vec2 outTexCoord;

varying vec2 fragCoord;
uniform sampler2D aaa;

// shadertoy globals
#define iTime time
#define iResolution resolution

// Created by inigo quilez - iq/2014
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

const mat2 m = mat2( 0.80,  0.60, -0.60,  0.80 );

float hash( vec2 p )
{
	float h = dot(p,vec2(127.1,311.7));
    return -1.0 + 2.0*fract(sin(h)*43758.5453123);
}

float noise( in vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
	
	vec2 u = f*f*(3.0-2.0*f);

    return mix( mix( hash( i + vec2(0.0,0.0) ), 
                     hash( i + vec2(1.0,0.0) ), u.x),
                mix( hash( i + vec2(0.0,1.0) ), 
                     hash( i + vec2(1.0,1.0) ), u.x), u.y);
}

float fbm( vec2 p )
{
    float f = 0.0;
    f += 0.5000*noise( p ); p = m*p*2.02;
    f += 0.2500*noise( p ); p = m*p*2.03;
    f += 0.1250*noise( p ); p = m*p*2.01;
    f += 0.0625*noise( p );
    return f/0.9375;
}

vec2 fbm2( in vec2 p )
{
    return vec2( fbm(p.xy), fbm(p.yx) );
}

vec3 map( vec2 p )
{   
    p *= 0.7;

    float f = dot( fbm2( 1.0*(0.3*iTime + p + fbm2(-0.3*iTime+2.0*(p + fbm2(4.0*p)))) ), vec2(1.0,-1.0) );

    float bl = smoothstep( -0.8, 0.8, f );

    float ti = smoothstep( -1.0, 1.0, fbm(p) );

    return mix( mix( vec3(0.50,0.00,0.00), 
                     vec3(1.00,0.10,0.35), ti ), 
                     vec3(0.00,0.00,0.02), bl );
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 p = (-iResolution.xy+2.0*fragCoord.xy)/iResolution.y;
    

    float e = 0.0045;

    vec3 colc = map( p               ); float gc = dot(colc,vec3(0.333));
    vec3 cola = map( p + vec2(e,0.0) ); float ga = dot(cola,vec3(0.333));
    vec3 colb = map( p + vec2(0.0,e) ); float gb = dot(colb,vec3(0.333));
    
    vec3 nor = normalize( vec3(ga-gc, e, gb-gc ) );

    vec3 col = colc;
    col += vec3(0.6,0.7,0.6)*8.0*abs(2.0*gc-ga-gb);
    col *= 1.0+0.2*nor.y*nor.y;
    col += 0.05*nor.y*nor.y*nor.y;
    
    
    vec2 q = fragCoord.xy/iResolution.xy;
    col *= pow(16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y),0.1);
    float normDist = length((fragCoord.xy - iResolution.xy*0.5) / (iResolution.xy*0.5));
    float a = -2.901118 + (3.901118)/(1.0 + pow(normDist, 50.15829));
    vec4 color = texture2D(aaa, outTexCoord);
    fragColor = vec4(col * a, a);
}

void main(void)
{
    mainImage(gl_FragColor, fragCoord.xy);
}
    `);
  scene.input.on("pointerup", function() {
    const bounds: Phaser.Geom.Rectangle = scene.spell.box;
    scene.add.shader(shader, bounds.centerX, bounds.centerY, bounds.width, bounds.height);
    console.log(
      "shader",
      scene.spell.box,
      bounds.centerX,
      bounds.centerY,
      bounds.width,
      bounds.height
    );
    scene.spell.destroy();
  });
}

function create(this: Scene) {
  const scene: Scene = this;
  createScene(scene, mapInfo);
}

function getDelta(s: Scene) {
  const y = (s.moveKeys.up.isDown ? -1 : 0) + (s.moveKeys.down.isDown ? 1 : 0);
  const x =
    (s.moveKeys.left.isDown ? -1 : 0) + (s.moveKeys.right.isDown ? 1 : 0);
  const r = new Phaser.Math.Vector2(x, y);
  return r.normalize().scale(5);
}

function getFrame(anim: AnimState) {
  return anim.state === "walk"
    ? `${anim.direction.toLowerCase()}_p${anim.frame + 1}`
    : anim.direction.toLowerCase();
}

const FPS = 15;
const frameInterval = 1000 / FPS;

function getNext(
  anim: AnimState,
  dx: number,
  dy: number,
  time: number
): AnimState {
  const newState = dx !== 0 || dy !== 0 ? "walk" : "idle";
  const frameChange = time - anim.lastFrameChange > frameInterval ? 1 : 0;
  const nextFrame =
    anim.state === newState && newState === "walk"
      ? (anim.frame + frameChange) % 8
      : 0;
  const direction = getClosestDir(dx, dy) || anim.direction;
  return {
    ...anim,
    frame: nextFrame,
    direction,
    state: newState,
    lastFrameChange: nextFrame !== anim.frame ? time : anim.lastFrameChange
  };
}

function getClosestDir(dx: number, dy: number): Direction | null {
  if (dx > 0 && dy === 0) {
    return "E";
  }
  if (dx < 0 && dy === 0) {
    return "W";
  }
  if (dx > 0 && dy > 0) {
    return "SE";
  }
  if (dx > 0 && dy < 0) {
    return "NE";
  }
  if (dx < 0 && dy > 0) {
    return "SW";
  }
  if (dx < 0 && dy < 0) {
    return "NW";
  }
  if (dx === 0 && dy < 0) {
    return "N";
  }
  if (dx === 0 && dy > 0) {
    return "S";
  }
  return null;
}

let lastDrawTime = 0;
const drawInterval = 1000 / 30;
function drawLine(time: number, scene: Scene, x: number, y: number) {
  if (time - lastDrawTime > drawInterval) {
    // console.log("drawing a line to ", x, y);
    scene.spell.addPoint(x, y);
    lastDrawTime = time;
  }
}

function update(this: Scene, time: number) {
  const { text, player, animState, input, cameras }: Scene = this;
  const { x, y } = getDelta(this);
  player.x += x;
  player.y += y;
  text.setText(`coords: ${player.x}, ${player.y}`);
  const newAnimState = getNext(animState, x, y, time);
  player.frame = player.texture.get(getFrame(newAnimState));
  this.animState = newAnimState;

  input.mousePointer.updateWorldPoint(cameras.main);
  if (input.mousePointer.isDown) {
    drawLine(time, this, input.mousePointer.worldX, input.mousePointer.worldY);
  }
}
