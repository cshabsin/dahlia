// SVG Dimensions
const SVG_WIDTH = 1000;
const SVG_HEIGHT = 1500;

// Default Prismatic Colors for fallback/blending
const PRISMATIC_SLATE = { r: 119, g: 136, b: 153 }; // #778899
const PRISMATIC_OCHRE = { r: 218, g: 165, b: 32 };  // #DAA520
const PRISMATIC_SAND = { r: 214, g: 206, b: 173 };  // #d6cead
const PRISMATIC_PLUM = { r: 74, g: 21, b: 41 };     // #4a1529
const PRISMATIC_DARK = { r: 20, g: 31, b: 51 };     // #141f33

// App State
const state = {
  seed: 42,
  jitter: 12,
  rings: 9,
  petalsBase: 7,
  scale: 1.3,
  rays: 11,
  rayOpacity: 0.08,
  blendMode: 'overlay',
  grain: true,
  animated: true,
  imageLoaded: false,
  isCustomUpload: false,
  layoutMode: 'spiral',
  wedges: 5,
  armature: false,
  petalStyle: 'curved',
  facetResolution: 6,
  animatedObjects: [],
  animationFrameId: null
};

// Seedable PRNG (Linear Congruential Generator)
let currentSeed = 42;
function setSeed(s) {
  currentSeed = s;
}
function random() {
  const a = 1664525;
  const c = 1013904223;
  const m = 4294967296; // 2^32
  currentSeed = (a * currentSeed + c) % m;
  return currentSeed / m;
}
function randomRange(min, max) {
  return min + random() * (max - min);
}
function randomChoice(arr) {
  return arr[Math.floor(random() * arr.length)];
}

// 3D Projection & Lighting Utilities
const LIGHT_DIR = { x: -0.4, y: -0.4, z: 0.82 };

function rotate3DPoint(x, y, z, thetaX, thetaY) {
  const cx = 500;
  const cy = 600;

  let dx = x - cx;
  let dy = y - cy;
  let dz = z;

  const cosY = Math.cos(thetaY);
  const sinY = Math.sin(thetaY);
  const rx = dx * cosY + dz * sinY;
  const rz = -dx * sinY + dz * cosY;

  const cosX = Math.cos(thetaX);
  const sinX = Math.sin(thetaX);
  const ry = dy * cosX - rz * sinX;
  const rz2 = dy * sinX + rz * cosX;

  return { x: cx + rx, y: cy + ry, z: rz2 };
}

function projectRotatedPoint(rotatedPt) {
  const cx = 500;
  const cy = 600;
  const cameraDistance = 1500;

  let dx = rotatedPt.x - cx;
  let dy = rotatedPt.y - cy;
  let dz = rotatedPt.z;

  const f = cameraDistance / (cameraDistance - dz);

  return { x: cx + dx * f, y: cy + dy * f, z: dz };
}

function project3DPoint(x, y, z, thetaX = 0, thetaY = 0) {
  const rotated = rotate3DPoint(x, y, z, thetaX, thetaY);
  return projectRotatedPoint(rotated);
}

function calculateNormal(A, B, C) {
  const ux = B.x - A.x;
  const uy = B.y - A.y;
  const uz = B.z - A.z;
  const vx = C.x - A.x;
  const vy = C.y - A.y;
  const vz = C.z - A.z;
  
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  
  const len = Math.hypot(nx, ny, nz);
  if (len < 0.0001) return { x: 0, y: 0, z: 1 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

function adjustColorLighting(colorStr, intensity) {
  let r = 128, g = 128, b = 128;
  
  if (colorStr.startsWith('rgb')) {
    const matches = colorStr.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0], 10);
      g = parseInt(matches[1], 10);
      b = parseInt(matches[2], 10);
    }
  } else if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else {
    return colorStr;
  }
  
  const scale = 1 + intensity * 0.7;
  
  const newR = Math.min(255, Math.max(0, Math.round(r * scale)));
  const newG = Math.min(255, Math.max(0, Math.round(g * scale)));
  const newB = Math.min(255, Math.max(0, Math.round(b * scale)));
  
  return `rgb(${newR}, ${newG}, ${newB})`;
}

// Color Sampling Setup
const sourceImg = document.getElementById('reference-img');
const samplerCanvas = document.createElement('canvas');
const samplerCtx = samplerCanvas.getContext('2d');

// Dynamically extracted color palette from the image
const extractedColors = {
  core: { r: 168, g: 10, b: 110 },    // Vibrant violet/purple (core)
  shadow: { r: 75, g: 3, b: 45 },     // Deep dark violet/plum (hollows)
  highlight: { r: 248, g: 248, b: 243 } // White/cream (borders/highlights)
};

// Extracts core and border colors by analyzing pixels
function extractFlowerColors() {
  if (!state.imageLoaded) return;
  
  const w = samplerCanvas.width;
  const h = samplerCanvas.height;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h * 0.44); // Dahlia core is usually slightly above center
  
  // 1. Core Sampling: We look for the most vibrant violet/purple pixel in a central grid
  let bestCore = null;
  let maxSaturation = -1;
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  
  const sampleGridSize = 13;
  const stepX = Math.floor((w * 0.12) / sampleGridSize);
  const stepY = Math.floor((h * 0.12) / sampleGridSize);
  
  for (let x = -6; x <= 6; x++) {
    for (let y = -6; y <= 6; y++) {
      const px = cx + x * stepX;
      const py = cy + y * stepY;
      
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const pixel = samplerCtx.getImageData(px, py, 1, 1).data;
        const r = pixel[0], g = pixel[1], b = pixel[2];
        
        // Saturation estimate
        const minVal = Math.min(r, g, b);
        const maxVal = Math.max(r, g, b);
        const sat = maxVal - minVal;
        
        // Is it purple/violet? (Red and Blue are high, Green is lower)
        const isPurpleish = (r > g * 1.15 && b > g * 0.85);
        
        if (isPurpleish && sat > maxSaturation) {
          maxSaturation = sat;
          bestCore = { r, g, b };
        }
        
        sumR += r;
        sumG += g;
        sumB += b;
        count++;
      }
    }
  }
  
  // Use the best purple pixel found, otherwise average of core region
  if (bestCore) {
    extractedColors.core = bestCore;
  } else if (count > 0) {
    extractedColors.core = {
      r: Math.floor(sumR / count),
      g: Math.floor(sumG / count),
      b: Math.floor(sumB / count)
    };
  }
  
  if (!state.isCustomUpload) {
    // --- ENFORCE DEEP BLUISH VIOLET SHIFT (Default Image Only) ---
    // Shift towards bluish violet: boost blue relative to red, and darken overall
    let { r: cr, g: cg, b: cb } = extractedColors.core;
    cb = Math.min(255, Math.max(cb, Math.round(cr * 1.18)));
    cr = Math.round(cr * 0.68);
    cg = Math.round(cg * 0.60);
    cb = Math.round(cb * 0.85);
    extractedColors.core = { r: cr, g: cg, b: cb };
  }
  
  // Create deep rich plum shadow from the core violet/purple (make it dark but saturated)
  extractedColors.shadow = {
    r: Math.max(10, Math.floor(extractedColors.core.r * 0.38)),
    g: Math.max(2, Math.floor(extractedColors.core.g * 0.28)),
    b: Math.max(15, Math.floor(extractedColors.core.b * 0.46))
  };
  
  // 2. Highlight Sampling: Sample along a circle of outer petals to find white/cream
  const rOuter = Math.floor(w * 0.28);
  let bestHighlight = { r: 248, g: 248, b: 243 };
  let maxBrightness = -1;
  
  for (let i = 0; i < 36; i++) {
    const angle = (i * 10) * Math.PI / 180;
    const px = Math.floor(cx + rOuter * Math.cos(angle));
    const py = Math.floor(cy + rOuter * Math.sin(angle));
    
    if (px >= 0 && px < w && py >= 0 && py < h) {
      const pixel = samplerCtx.getImageData(px, py, 1, 1).data;
      const r = pixel[0], g = pixel[1], b = pixel[2];
      
      const brightness = r + g + b;
      if (brightness > maxBrightness) {
        maxBrightness = brightness;
        bestHighlight = { r, g, b };
      }
    }
  }
  
  // Apply a fallback if outer petals are dark, otherwise use the sampled light color
  if (maxBrightness > 450) {
    extractedColors.highlight = bestHighlight;
  } else {
    extractedColors.highlight = { r: 248, g: 248, b: 243 };
  }
  
  if (state.isCustomUpload) {
    console.log("Dynamically Extracted Palette (Custom Upload - Pure Samples):", extractedColors);
  } else {
    console.log("Dynamically Extracted Palette (Bluish-Violet Enforced):", extractedColors);
  }
}

function initImageSampler() {
  if (sourceImg.complete && sourceImg.naturalWidth > 0) {
    samplerCanvas.width = sourceImg.naturalWidth;
    samplerCanvas.height = sourceImg.naturalHeight;
    samplerCtx.drawImage(sourceImg, 0, 0);
    state.imageLoaded = true;
    extractFlowerColors();
    renderArtboard();
  } else {
    sourceImg.onload = () => {
      samplerCanvas.width = sourceImg.naturalWidth;
      samplerCanvas.height = sourceImg.naturalHeight;
      samplerCtx.drawImage(sourceImg, 0, 0);
      state.imageLoaded = true;
      extractFlowerColors();
      document.getElementById('loader-overlay').classList.remove('active');
      renderArtboard();
    };
  }
}

// Samples color at (x, y) relative to SVG coordinates (1000 x 1500)
function sampleColor(x, y) {
  if (!state.imageLoaded) {
    // Return a default mathematical gradient if image not loaded
    const dist = Math.hypot(x - 500, y - 600);
    if (dist < 250) {
      return { r: 196, g: 40, b: 31, a: 1 }; // Dahlia Red
    } else {
      return { r: 30, g: 60, b: 50, a: 1 }; // Leaf Green
    }
  }
  
  // Map SVG coordinates to image coordinates
  const imgX = Math.min(samplerCanvas.width - 1, Math.max(0, Math.floor((x / SVG_WIDTH) * samplerCanvas.width)));
  const imgY = Math.min(samplerCanvas.height - 1, Math.max(0, Math.floor((y / SVG_HEIGHT) * samplerCanvas.height)));
  
  try {
    const pixel = samplerCtx.getImageData(imgX, imgY, 1, 1).data;
    return {
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      a: pixel[3] / 255
    };
  } catch (e) {
    // Fallback in case of CORS or browser issues
    return { r: 120, g: 120, b: 120, a: 1 };
  }
}

// Stylize a sampled color with Prismatic aesthetics (mute it and blend with palette)
function stylizeColor(rgb, type = 'lit') {
  // Convert color to HSL to perform controlled modifications
  let { r, g, b } = rgb;
  
  // Blend with Prismatic palette tones (22% blend to give cohesive feel)
  const blendFactor = 0.22;
  const isWarm = (r > g && r > b); // Is it a reddish/pinkish/yellowish petal color?
  
  const blendTarget = isWarm ? PRISMATIC_SAND : PRISMATIC_SLATE;
  
  r = Math.round(r * (1 - blendFactor) + blendTarget.r * blendFactor);
  g = Math.round(g * (1 - blendFactor) + blendTarget.g * blendFactor);
  b = Math.round(b * (1 - blendFactor) + blendTarget.b * blendFactor);
  
  // Apply Lit vs Shaded splits
  if (type === 'lit') {
    // Shift slightly warmer and brighter
    r = Math.min(255, Math.round(r * 1.15));
    g = Math.min(255, Math.round(g * 1.08));
    b = Math.min(255, Math.round(b * 0.95));
  } else {
    // Shift cooler and darker (shade side)
    r = Math.max(0, Math.round(r * 0.75));
    g = Math.max(0, Math.round(g * 0.78));
    b = Math.min(255, Math.round(b * 1.05)); // keep/boost blue slightly
  }
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Convert points array to SVG points string
function pointsToString(pts) {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// Helper to construct a single polygon SVG node
function createPolygonNode(points, fill, opacity, blendMode, id, transformOrigin = null, animSpeed = 0) {
  const pointsStr = pointsToString(points);
  
  let animElement = '';
  if (state.animated && animSpeed > 0 && transformOrigin) {
    // Sway animation (rotate -1.5deg to 1.5deg around origin)
    animElement = `<animateTransform 
      attributeName="transform" 
      type="rotate" 
      values="-1.5 ${transformOrigin.x.toFixed(1)} ${transformOrigin.y.toFixed(1)}; 1.5 ${transformOrigin.x.toFixed(1)} ${transformOrigin.y.toFixed(1)}; -1.5 ${transformOrigin.x.toFixed(1)} ${transformOrigin.y.toFixed(1)}" 
      dur="${animSpeed.toFixed(2)}s" 
      repeatCount="indefinite" />`;
  }
  
  const styleStr = blendMode !== 'normal' ? ` style="mix-blend-mode: ${blendMode};"` : '';
  
  return `<polygon id="${id}" points="${pointsStr}" fill="${fill}" opacity="${opacity.toFixed(2)}"${styleStr}>${animElement}</polygon>`;
}

// Helper to construct a single path SVG node
function createPathNode(d, fill, opacity, blendMode, id, transformOrigin = null, animSpeed = 0) {
  let animElement = '';
  if (state.animated && animSpeed > 0 && transformOrigin) {
    // Sway animation (rotate -1.5deg to 1.5deg around origin)
    animElement = `<animateTransform 
      attributeName="transform" 
      type="rotate" 
      values="-1.5 ${transformOrigin.x.toFixed(1)} ${transformOrigin.y.toFixed(1)}; 1.5 ${transformOrigin.x.toFixed(1)} ${transformOrigin.y.toFixed(1)}; -1.5 ${transformOrigin.x.toFixed(1)} ${transformOrigin.y.toFixed(1)}" 
      dur="${animSpeed.toFixed(2)}s" 
      repeatCount="indefinite" />`;
  }
  
  const styleStr = blendMode !== 'normal' ? ` style="mix-blend-mode: ${blendMode};"` : '';
  
  return `<path id="${id}" d="${d}" fill="${fill}" opacity="${opacity.toFixed(2)}"${styleStr}>${animElement}</path>`;
}

// 3D Animated Objects registration and rendering
function registerAnimatedObject(id, type, pts3D, baseColor = null, layerLabel = null) {
  state.animatedObjects.push({
    id,
    type,
    pts3D,
    baseColor,
    layerLabel
  });
}

function createAnimatedPolygon(points3D, fill, opacity, blendMode, id) {
  registerAnimatedObject(id, 'polygon', points3D, fill);

  const projected = points3D.map(p => project3DPoint(p.x, p.y, p.z, 0, 0));
  const pointsStr = pointsToString(projected);
  
  const styleStr = blendMode !== 'normal' ? ` style="mix-blend-mode: ${blendMode};"` : '';
  return `<polygon id="${id}" points="${pointsStr}" fill="${fill}" opacity="${opacity.toFixed(2)}"${styleStr}></polygon>`;
}

function createAnimatedPath(points3D, fill, opacity, blendMode, id, layerLabel) {
  registerAnimatedObject(id, 'path', points3D, fill, layerLabel);

  const projected = points3D.map(p => project3DPoint(p.x, p.y, p.z, 0, 0));
  const [p0, c1, c2, p3, pc] = projected;
  
  const d = `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} ` +
            `C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ` +
            `${c2.x.toFixed(1)},${c2.y.toFixed(1)} ` +
            `${p3.x.toFixed(1)},${p3.y.toFixed(1)} ` +
            `L ${pc.x.toFixed(1)},${pc.y.toFixed(1)} Z`;
            
  const styleStr = blendMode !== 'normal' ? ` style="mix-blend-mode: ${blendMode};"` : '';
  return `<path id="${id}" d="${d}" fill="${fill}" opacity="${opacity.toFixed(2)}"${styleStr}></path>`;
}



// Generates stem and foliage
function generateStemAndLeaves(cx, cy) {
  const elements = [];
  const jit = state.jitter;
  
  // 1. Stem: represented by long overlapping shards going down
  const stemTopX = cx;
  const stemTopY = cy + 50;
  const stemBottomX = cx - 20;
  const stemBottomY = SVG_HEIGHT;
  
  const stemPoints1 = [
    { x: stemTopX - 15 + randomRange(-jit, jit), y: stemTopY, z: -20 },
    { x: stemTopX + 10 + randomRange(-jit, jit), y: stemTopY, z: -20 },
    { x: stemBottomX + 25 + randomRange(-jit, jit), y: stemBottomY, z: -60 },
    { x: stemBottomX - 10 + randomRange(-jit, jit), y: stemBottomY, z: -60 }
  ];
  
  // Sample green tones from stem area
  const stemCol = stylizeColor(sampleColor(cx, (cy + SVG_HEIGHT) / 2), 'shaded');
  elements.push(createAnimatedPolygon(stemPoints1, stemCol, 0.95, 'normal', 'stem-base'));
  
  // 2. Leaves: large shards branching off the stem
  const numLeaves = 4;
  for (let i = 0; i < numLeaves; i++) {
    const side = i % 2 === 0 ? -1 : 1; // alternating left/right
    const leafY = cy + 180 + i * 160;
    const leafStartX = cx + (side * 8);
    const leafEndX = leafStartX + (side * randomRange(120, 220));
    const leafEndY = leafY + randomRange(40, 120);
    
    const leafPoints = [
      { x: leafStartX, y: leafY, z: -30 },
      { x: leafStartX + (side * 40), y: leafY - 30, z: -40 },
      { x: leafEndX, y: leafEndY, z: -50 },
      { x: leafStartX, y: leafY + 60, z: -30 }
    ];
    
    // Sample foliage color
    const col = sampleColor(leafStartX + side * 80, leafY + 30);
    const fillLit = stylizeColor(col, 'lit');
    const fillShade = stylizeColor(col, 'shaded');
    
    // Split leaf in two triangles
    const tri1 = [leafPoints[0], leafPoints[1], leafPoints[2]];
    const tri2 = [leafPoints[0], leafPoints[3], leafPoints[2]];
    
    elements.push(createAnimatedPolygon(tri1, fillLit, 0.85, 'normal', `leaf-${i}-lit`));
    elements.push(createAnimatedPolygon(tri2, fillShade, 0.85, 'normal', `leaf-${i}-shade`));
  }
  
  return elements.join('\n');
}

// Generates concentric layers or Fibonacci spiral of Dahlia petals
function generateDahliaPetals(cx, cy) {
  const petals = [];
  const numRings = state.rings;
  const basePetals = state.petalsBase;
  const maxRadius = Math.min(SVG_WIDTH, SVG_HEIGHT) * 0.36 * state.scale;
  
  // Vibrant colors for blending (dynamically sampled from the flower core/highlights)
  const RICH_PURPLE = extractedColors.core; 
  const DEEP_PLUM_VAL = extractedColors.shadow;
  const whiteTarget = extractedColors.highlight;

  // Gather list of petals to render
  const petalList = [];

  if (state.layoutMode === 'spiral') {
    // 1. FIBONACCI SPIRAL LAYOUT
    let totalPetals = 0;
    for (let r = 0; r < numRings; r++) {
      totalPetals += Math.floor(basePetals + r * 1.8);
    }

    const goldenAngle = 137.507764 * Math.PI / 180;

    // Generate from outer (largest) to inner (smallest)
    for (let pIndex = totalPetals - 1; pIndex >= 0; pIndex--) {
      const t = pIndex / (totalPetals - 1);
      const rPct = Math.sqrt(t);
      const ringRadius = maxRadius * Math.pow(t, 0.55);
      
      const baseAngle = pIndex * goldenAngle + state.seed * 0.08;
      
      let zone = 3;
      if (rPct < 0.28) {
        zone = 1;
      } else if (rPct < 0.55) {
        zone = 2;
      }

      let scaleLen = 2.3;
      let scaleWidth = 0.95;
      
      if (zone === 1) {
        scaleLen = 2.4;
        scaleWidth = 0.60;
      } else if (zone === 2) {
        scaleLen = 2.2;
        scaleWidth = 1.05;
      } else {
        scaleLen = 2.3;
        scaleWidth = 0.95;
      }

      const petalLen = (maxRadius / numRings) * scaleLen * state.scale;
      const equivNumPetals = basePetals + (rPct * numRings - 1) * 1.8;
      const numPetalsAtRadius = Math.max(basePetals, equivNumPetals);
      const petalWidth = ringRadius * (Math.PI * 2 / numPetalsAtRadius) * scaleWidth * state.scale;

      petalList.push({
        ringRadius,
        baseAngle,
        rPct,
        zone,
        petalLen,
        petalWidth,
        rIndex: Math.floor(rPct * numRings),
        pIndex
      });
    }
  } else {
    // 2. CONCENTRIC RINGS LAYOUT
    for (let rIndex = numRings - 1; rIndex >= 0; rIndex--) {
      const ringRadius = maxRadius * Math.pow((rIndex + 1) / numRings, 1.10);
      const numPetals = Math.floor(basePetals + rIndex * 1.8);
      const angleStep = (Math.PI * 2) / numPetals;
      const angleOffset = rIndex * 0.13 + state.seed * 0.08;
      const rPct = (rIndex + 1) / numRings;

      let zone = 3;
      if (rPct < 0.28) {
        zone = 1;
      } else if (rPct < 0.55) {
        zone = 2;
      }

      let scaleLen = 2.3;
      let scaleWidth = 0.95;
      
      if (zone === 1) {
        scaleLen = 2.4;
        scaleWidth = 0.60;
      } else if (zone === 2) {
        scaleLen = 2.2;
        scaleWidth = 1.05;
      } else {
        scaleLen = 2.3;
        scaleWidth = 0.95;
      }

      const petalLen = (maxRadius / numRings) * scaleLen * state.scale;
      const petalWidth = ringRadius * (Math.PI * 2 / numPetals) * scaleWidth * state.scale;

      for (let pIndex = 0; pIndex < numPetals; pIndex++) {
        const baseAngle = angleStep * pIndex + angleOffset;
        petalList.push({
          ringRadius,
          baseAngle,
          rPct,
          zone,
          petalLen,
          petalWidth,
          rIndex,
          pIndex
        });
      }
    }
  }

  // Draw petals
  petalList.forEach(p => {
    const { ringRadius, baseAngle, rPct, zone, petalLen, petalWidth, rIndex, pIndex } = p;

    // Seeded scale and angle jitter to break mechanical symmetry
    const localScale = randomRange(0.92, 1.08);
    const localAngleJitter = randomRange(-0.04, 0.04);
    
    const angle = baseAngle + localAngleJitter;
    const pLen = petalLen * localScale;
    const pWidth = petalWidth * localScale;

    // Jitter scales down near the center of the flower
    const jit = state.jitter * rPct;
    
    const zRing = 60 * (1 - rPct) - 30 * rPct;
    
    // Orthonormal Basis setup for this petal
    // Pitch angle: steep at center (Zone 1), cup-angled in Zone 2, flatter in Zone 3
    const phi = (65 * Math.pow(1 - rPct, 0.8) + 12 * rPct) * Math.PI / 180;
    
    const cosT = Math.cos(angle);
    const sinT = Math.sin(angle);
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    
    const ux = cosT * cosP, uy = sinT * cosP, uz = sinP;
    const vx = -sinT, vy = cosT, vz = 0;
    const wx = -cosT * sinP, wy = -sinT * sinP, wz = cosP;
    
    const rBase = ringRadius - pLen * 0.5;
    
    const x0 = cx + rBase * cosT;
    const y0 = cy + rBase * sinT;
    const z0 = zRing;

    const getPtOrthonormal = (u, v, h) => {
      const x = x0 + u * ux + v * vx + h * wx;
      const y = y0 + u * uy + v * vy + h * wy;
      const z = z0 + u * uz + v * vz + h * wz;
      return {
        x: x + randomRange(-jit, jit),
        y: y + randomRange(-jit, jit),
        z: z
      };
    };
    
    let hPc = 0;
    let hEdge = 0;
    if (zone === 1) {
      hPc = -8;
      hEdge = 4;
    } else if (zone === 2) {
      hPc = -25;
      hEdge = 15;
    } else { // zone === 3
      hPc = -12;
      hEdge = 10;
    }

    const animSpeed = randomRange(4.8, 8.5);

    // Compute basic colors and targets
    const p0_sample = getPtOrthonormal(0, 0, 0);
    const p3_sample = getPtOrthonormal(pLen, 0, 0);
    const pc_sample = getPtOrthonormal(pLen * 0.5, 0, hPc);

    const sampleBase = sampleColor(p0_sample.x, p0_sample.y);
    const sampleBody = sampleColor(pc_sample.x, pc_sample.y);
    const sampleTip = sampleColor(p3_sample.x, p3_sample.y);

    let fBaseL, fBaseR, fBodyL, fBodyR, fTipL, fTipR, fBorderL, fBorderR, fRimL, fRimR, fHollow;

    if (zone === 1) {
      const blendR = (s) => s.r * 0.1 + RICH_PURPLE.r * 0.9;
      const blendG = (s) => s.g * 0.1 + RICH_PURPLE.g * 0.9;
      const blendB = (s) => s.b * 0.1 + RICH_PURPLE.b * 0.9;
      
      fBaseL = stylizeColor({ r: blendR(sampleBase), g: blendG(sampleBase), b: blendB(sampleBase) }, 'lit');
      fBaseR = stylizeColor({ r: blendR(sampleBase), g: blendG(sampleBase), b: blendB(sampleBase) }, 'shaded');
      fBodyL = stylizeColor({ r: blendR(sampleBody), g: blendG(sampleBody), b: blendB(sampleBody) }, 'lit');
      fBodyR = stylizeColor({ r: blendR(sampleBody), g: blendG(sampleBody), b: blendB(sampleBody) }, 'shaded');
      
      const tipBlend = 0.22;
      const tr = sampleTip.r * 0.05 + RICH_PURPLE.r * 0.73 + whiteTarget.r * tipBlend;
      const tg = sampleTip.g * 0.05 + RICH_PURPLE.g * 0.73 + whiteTarget.g * tipBlend;
      const tb = sampleTip.b * 0.05 + RICH_PURPLE.b * 0.73 + whiteTarget.b * tipBlend;
      fTipL = stylizeColor({ r: tr, g: tg, b: tb }, 'lit');
      fTipR = stylizeColor({ r: tr, g: tg, b: tb }, 'shaded');
      
      fBorderL = fBodyL;
      fBorderR = fBodyR;
    } else if (zone === 2) {
      const baseR = sampleBase.r * 0.1 + RICH_PURPLE.r * 0.9;
      const baseG = sampleBase.g * 0.1 + RICH_PURPLE.g * 0.9;
      const baseB = sampleBase.b * 0.1 + RICH_PURPLE.b * 0.9;
      
      fBaseL = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'lit');
      fBaseR = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'shaded');
      
      // Middle wall color: intermediate between deep plum shadow and core purple
      const wallR = DEEP_PLUM_VAL.r * 0.5 + RICH_PURPLE.r * 0.5;
      const wallG = DEEP_PLUM_VAL.g * 0.5 + RICH_PURPLE.g * 0.5;
      const wallB = DEEP_PLUM_VAL.b * 0.5 + RICH_PURPLE.b * 0.5;
      
      fRimL = stylizeColor({ r: wallR, g: wallG, b: wallB }, 'lit');
      fRimR = stylizeColor({ r: wallR, g: wallG, b: wallB }, 'shaded');
      fHollow = stylizeColor(DEEP_PLUM_VAL, 'shaded');
      fBorderL = 'rgb(255, 255, 253)';
      fBorderR = 'rgb(230, 230, 225)';
    } else { // zone === 3
      const baseR = sampleBase.r * 0.1 + RICH_PURPLE.r * 0.9;
      const baseG = sampleBase.g * 0.1 + RICH_PURPLE.g * 0.9;
      const baseB = sampleBase.b * 0.1 + RICH_PURPLE.b * 0.9;
      fBaseL = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'lit');
      fBaseR = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'shaded');
      
      const bodyR = sampleBody.r * 0.1 + RICH_PURPLE.r * 0.9;
      const bodyG = sampleBody.g * 0.1 + RICH_PURPLE.g * 0.9;
      const bodyB = sampleBody.b * 0.1 + RICH_PURPLE.b * 0.9;
      fBodyL = stylizeColor({ r: bodyR, g: bodyG, b: bodyB }, 'lit');
      fBodyR = stylizeColor({ r: bodyR, g: bodyG, b: bodyB }, 'shaded');
      
      const tipBlend = 0.52;
      const tr = sampleTip.r * 0.05 + RICH_PURPLE.r * 0.43 + whiteTarget.r * tipBlend;
      const tg = sampleTip.g * 0.05 + RICH_PURPLE.g * 0.43 + whiteTarget.g * tipBlend;
      const tb = sampleTip.b * 0.05 + RICH_PURPLE.b * 0.43 + whiteTarget.b * tipBlend;
      fTipL = stylizeColor({ r: tr, g: tg, b: tb }, 'lit');
      fTipR = stylizeColor({ r: tr, g: tg, b: tb }, 'shaded');
      
      fBorderL = 'rgb(255, 255, 253)';
      fBorderR = 'rgb(230, 230, 225)';
    }

    if (state.petalStyle === 'curved') {
      // --- CURVED BÉZIER MODE ---
      const getPetalPoints3D = (lenFactor, widthFactor) => {
        const curLen = pLen * lenFactor;
        const curWidth = pWidth * widthFactor;
        const curHPc = hPc * lenFactor;
        const curHEdge = hEdge * lenFactor;
        
        const p0_layer = getPtOrthonormal(0, 0, 0);
        const p1_layer = getPtOrthonormal(curLen * 0.35, -curWidth * 0.41, curHEdge * 0.7);
        const p5_layer = getPtOrthonormal(curLen * 0.35, curWidth * 0.41, curHEdge * 0.7);
        const p2_layer = getPtOrthonormal(curLen * 0.68, -curWidth * 0.525, curHEdge);
        const p4_layer = getPtOrthonormal(curLen * 0.68, curWidth * 0.525, curHEdge);
        const p3_layer = getPtOrthonormal(curLen, 0, 0);
        const pc_layer = getPtOrthonormal(curLen * 0.5, 0, curHPc);
        
        return {
          p0: p0_layer,
          p1: p1_layer,
          p2: p2_layer,
          p3: p3_layer,
          p4: p4_layer,
          p5: p5_layer,
          pc: pc_layer
        };
      };

      const drawCurvedLayer = (lenFactor, widthFactor, fillL, fillR, opacity, label) => {
        const pts = getPetalPoints3D(lenFactor, widthFactor);
        
        const leftPts3D = [pts.p0, pts.p1, pts.p2, pts.p3, pts.pc];
        const rightPts3D = [pts.p0, pts.p5, pts.p4, pts.p3, pts.pc];
                          
        petals.push(createAnimatedPath(leftPts3D, fillL, opacity, 'normal', `petal-r${rIndex}-p${pIndex}-${label}-l`, label));
        petals.push(createAnimatedPath(rightPts3D, fillR, opacity, 'normal', `petal-r${rIndex}-p${pIndex}-${label}-r`, label));
      };

      if (zone === 1) {
        // Layer 1: Full tip color
        drawCurvedLayer(1.0, 1.0, fTipL, fTipR, 1.0, 'base');
        // Layer 2: Inner purple body
        drawCurvedLayer(0.7, 0.8, fBaseL, fBaseR, 1.0, 'body');
      } else if (zone === 2) {
        // Layer 1: Full border
        drawCurvedLayer(1.0, 1.0, fBorderL, fBorderR, 1.0, 'border');
        // Layer 2: Middle purple body
        drawCurvedLayer(0.88, 0.82, fRimL, fRimR, 1.0, 'body');
        // Layer 3: Inner dark hollow
        const fHollowL = stylizeColor(DEEP_PLUM_VAL, 'lit');
        const fHollowR = stylizeColor(DEEP_PLUM_VAL, 'shaded');
        drawCurvedLayer(0.65, 0.55, fHollowL, fHollowR, 1.0, 'hollow');
      } else { // zone === 3
        // Layer 1: Full border
        drawCurvedLayer(1.0, 1.0, fBorderL, fBorderR, 1.0, 'border');
        // Layer 2: Middle tip highlight
        drawCurvedLayer(0.94, 0.9, fTipL, fTipR, 1.0, 'tip');
        // Layer 3: Inner purple body
        drawCurvedLayer(0.80, 0.8, fBaseL, fBaseR, 1.0, 'body');
      }

    } else {
      // --- FACETED MODE (POLYGONS) ---
      const M = state.facetResolution / 2; // e.g. 2, 3, 4, 5, 6
      
      const leftPts = [];
      const rightPts = [];
      const centerPts = [];
      
      for (let j = 0; j <= M; j++) {
        const u_j = (j / M) * pLen;
        const w_j = pWidth * Math.sin((j / M) * Math.PI);
        const v_j = w_j / 2;
        const h_j = hEdge * Math.sin((j / M) * Math.PI);
        
        leftPts.push(getPtOrthonormal(u_j, -v_j, h_j));
        rightPts.push(getPtOrthonormal(u_j, v_j, h_j));
        centerPts.push(getPtOrthonormal(u_j, 0, 0));
      }
      
      const pc = getPtOrthonormal(pLen * 0.5, 0, hPc);

      for (let j = 0; j < M; j++) {
        let fillL, fillR;
        if (zone === 1) {
          if (j === 0) {
            fillL = fBaseL; fillR = fBaseR;
          } else if (j === M - 1) {
            fillL = fTipL; fillR = fTipR;
          } else {
            fillL = fBodyL; fillR = fBodyR;
          }
        } else if (zone === 2) {
          if (j === 0) {
            fillL = fBaseL; fillR = fBaseR;
          } else {
            fillL = fRimL; fillR = fRimR;
          }
        } else { // zone === 3
          if (j === 0) {
            fillL = fBaseL; fillR = fBaseR;
          } else if (j === M - 1) {
            fillL = fTipL; fillR = fTipR;
          } else {
            fillL = fBodyL; fillR = fBodyR;
          }
        }

        petals.push(createAnimatedPolygon([pc, leftPts[j], leftPts[j+1]], fillL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-seg${j}-l`));
        petals.push(createAnimatedPolygon([pc, rightPts[j], rightPts[j+1]], fillR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-seg${j}-r`));
      }

      // Hollow overlay for Zone 2
      if (zone === 2) {
        petals.push(createAnimatedPolygon([pc, leftPts[M-1], rightPts[M-1]], fHollow, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-hollow`));
      }

      // Border triangles
      for (let j = 1; j <= M - 2; j++) {
        petals.push(createAnimatedPolygon([leftPts[j], leftPts[j+1], leftPts[M]], fBorderL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-l-${j}`));
        petals.push(createAnimatedPolygon([rightPts[j], rightPts[j+1], rightPts[M]], fBorderR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-r-${j}`));
      }
    }
  });

  return petals.join('\n');
}

// Generates background leaf shards (instead of abstract rays)
function generatePrismaticRays() {
  const leaves = [];
  const count = state.rays;
  if (count === 0) return '';
  
  const leafGreens = [
    { r: 28, g: 85, b: 48 },   // Vibrant forest green (#1c5530)
    { r: 38, g: 95, b: 53 },   // Rich leaf green (#265f35)
    { r: 20, g: 68, b: 35 },   // Deep green (#144423)
    { r: 52, g: 110, b: 68 }   // Light foliage green (#346e44)
  ];
  
  for (let i = 0; i < count; i++) {
    // Distribute all around the 4 edges: 0 = Top, 1 = Right, 2 = Bottom, 3 = Left
    const edge = i % 4;
    const leafWidth = randomRange(160, 320);
    
    let p1, p2;
    let pTip = { x: 500 + randomRange(-150, 150), y: 600 + randomRange(-150, 150) };
    
    if (edge === 0) {
      // Top edge
      const xStart = randomRange(-50, SVG_WIDTH - leafWidth + 50);
      p1 = { x: xStart, y: 0 };
      p2 = { x: xStart + leafWidth, y: 0 };
    } else if (edge === 1) {
      // Right edge
      const yStart = randomRange(-50, SVG_HEIGHT - leafWidth + 50);
      p1 = { x: SVG_WIDTH, y: yStart };
      p2 = { x: SVG_WIDTH, y: yStart + leafWidth };
    } else if (edge === 2) {
      // Bottom edge
      const xStart = randomRange(-50, SVG_WIDTH - leafWidth + 50);
      p1 = { x: xStart, y: SVG_HEIGHT };
      p2 = { x: xStart + leafWidth, y: SVG_HEIGHT };
    } else {
      // Left edge
      const yStart = randomRange(-50, SVG_HEIGHT - leafWidth + 50);
      p1 = { x: 0, y: yStart };
      p2 = { x: 0, y: yStart + leafWidth };
    }
    
    // Centroid of the leaf triangle
    const cx = (p1.x + p2.x + pTip.x) / 3;
    const cy = (p1.y + p2.y + pTip.y) / 3;
    
    // Sample color from image at centroid
    const colSample = sampleColor(cx, cy);
    
    // Shift color to make it a brighter, richer foliage green
    let r = colSample.r;
    let g = colSample.g;
    let b = colSample.b;
    
    // If sampled color isn't green (e.g. background is grey or leaf is dark), blend with rich foliage green
    const isGreen = (g > r * 0.75 && g > b * 0.75);
    if (!isGreen) {
      const leafGreen = randomChoice(leafGreens);
      const blend = 0.72;
      r = r * (1 - blend) + leafGreen.r * blend;
      g = g * (1 - blend) + leafGreen.g * blend;
      b = b * (1 - blend) + leafGreen.b * blend;
    }
    
    // Boost overall brightness and green component
    r = Math.min(255, Math.round(r * 1.30));
    g = Math.min(255, Math.round(g * 1.45)); // boost green most
    b = Math.min(255, Math.round(b * 1.25));
    
    const fillBase = stylizeColor({ r, g, b }, i % 2 === 0 ? 'lit' : 'shaded');
    
    const pts = [
      { x: p1.x, y: p1.y, z: -120 },
      { x: p2.x, y: p2.y, z: -120 },
      { x: pTip.x, y: pTip.y, z: -80 }
    ];
    const leafOpacity = Math.min(0.95, state.rayOpacity * 2.8); // make them significantly brighter & more visible
    
    leaves.push(createAnimatedPolygon(pts, fillBase, leafOpacity, 'normal', `bg-leaf-${i}`));
  }
  
  return leaves.join('\n');
}

// Generates global prismatic slicing wedges radiating from the center
function generatePrismaticWedges(cx, cy) {
  const count = state.wedges;
  if (!count || count === 0) return '';
  
  const wedges = [];
  const R = 1800; // large enough to cover the canvas and bleed out
  
  // Set deterministic PRNG seed based on current seed + 101
  setSeed(state.seed + 101);
  
  const gradientTypes = ['url(#fadeWhite)', 'url(#fadePurple)', 'url(#fadeDark)'];
  const blendModes = ['overlay', 'screen', 'multiply'];
  const opacities = [0.22, 0.35, 0.55]; // corresponding base opacities for white, purple, dark
  
  for (let i = 0; i < count; i++) {
    // Generate randomized angles
    const startAngle = random() * Math.PI * 2;
    const widthAngle = randomRange(20, 50) * Math.PI / 180;
    const endAngle = startAngle + widthAngle;
    
    const p0 = { x: cx, y: cy };
    const p1 = { x: cx + R * Math.cos(startAngle), y: cy + R * Math.sin(startAngle) };
    const p2 = { x: cx + R * Math.cos(endAngle), y: cy + R * Math.sin(endAngle) };
    
    // Choose gradient type based on index
    const gradIndex = i % 3;
    const fill = gradientTypes[gradIndex];
    const blendMode = blendModes[gradIndex];
    const opacity = opacities[gradIndex] * randomRange(0.8, 1.2);
    
    // Create animated sway for the wedge
    let animElement = '';
    if (state.animated) {
      const dur = randomRange(12, 22);
      animElement = `<animateTransform 
        attributeName="transform" 
        type="rotate" 
        values="-1.5 ${cx} ${cy}; 1.5 ${cx} ${cy}; -1.5 ${cx} ${cy}" 
        dur="${dur.toFixed(2)}s" 
        repeatCount="indefinite" />`;
    }
    
    const ptsStr = `${p0.x.toFixed(1)},${p0.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    const styleStr = ` style="mix-blend-mode: ${blendMode}; pointer-events: none;"`;
    
    wedges.push(`<polygon points="${ptsStr}" fill="${fill}" opacity="${opacity.toFixed(2)}"${styleStr}>${animElement}</polygon>`);
  }
  
  return wedges.join('\n');
}

// Generates crystalline armature lines and light node circles
function generateArmatureLines(cx, cy) {
  if (!state.armature) return '';
  
  const elements = [];
  setSeed(state.seed + 202);
  
  const lineColors = ['#ffffff', '#ffffff', 'rgb(255, 255, 253)', 'rgb(240, 230, 250)'];
  const lineCount = 5;
  const points = [];
  
  // 1. Generate randomized lines slicing across the canvas
  for (let i = 0; i < lineCount; i++) {
    let p1, p2;
    if (i % 2 === 0) {
      // Horizontal-ish: Left to Right
      p1 = { x: 0, y: randomRange(100, SVG_HEIGHT - 100) };
      p2 = { x: SVG_WIDTH, y: randomRange(100, SVG_HEIGHT - 100) };
    } else {
      // Vertical-ish: Top to Bottom
      p1 = { x: randomRange(100, SVG_WIDTH - 100), y: 0 };
      p2 = { x: randomRange(100, SVG_WIDTH - 100), y: SVG_HEIGHT };
    }
    
    points.push({ p1, p2 });
    
    const color = randomChoice(lineColors);
    const strokeWidth = i === 0 ? 1.5 : 1;
    const opacity = randomRange(0.12, 0.28);
    
    const p1_3d = { x: p1.x, y: p1.y, z: 0 };
    const p2_3d = { x: p2.x, y: p2.y, z: 0 };
    const lineId = `armature-line-${i}`;
    registerAnimatedObject(lineId, 'line', [p1_3d, p2_3d]);
    
    elements.push(`<line id="${lineId}" x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity.toFixed(2)}" style="pointer-events: none;" />`);
  }
  
  // 2. Draw glowing light nodes (stars) at select intersection coordinates
  const intersect = (l1, l2) => {
    const x1 = l1.p1.x, y1 = l1.p1.y, x2 = l1.p2.x, y2 = l1.p2.y;
    const x3 = l2.p1.x, y3 = l2.p1.y, x4 = l2.p2.x, y4 = l2.p2.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1) return null;
    
    const x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
    const y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;
    
    if (x >= 0 && x <= SVG_WIDTH && y >= 0 && y <= SVG_HEIGHT) {
      return { x, y };
    }
    return null;
  };
  
  for (let i = 0; i < points.length - 1; i++) {
    const pt = intersect(points[i], points[i + 1]);
    if (pt) {
      const radius = randomRange(1.8, 3.2);
      const opacity = randomRange(0.4, 0.75);
      const pt_3d = { x: pt.x, y: pt.y, z: 0 };
      const circleId = `armature-node-${i}`;
      registerAnimatedObject(circleId, 'circle', [pt_3d]);
      elements.push(`<circle id="${circleId}" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="#ffffff" opacity="${opacity.toFixed(2)}" style="pointer-events: none;" />`);
    }
  }
  
  // Add symmetric nodes around center
  const centerNodes = 5;
  const radiusFromCenter = 300;
  for (let i = 0; i < centerNodes; i++) {
    const angle = (i * (360 / centerNodes) + randomRange(-10, 10)) * Math.PI / 180;
    const px = cx + radiusFromCenter * Math.cos(angle);
    const py = cy + radiusFromCenter * Math.sin(angle);
    const r = randomRange(1.2, 2.2);
    const pt_3d = { x: px, y: py, z: 0 };
    const circleId = `armature-center-node-${i}`;
    registerAnimatedObject(circleId, 'circle', [pt_3d]);
    elements.push(`<circle id="${circleId}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffffff" opacity="0.5" style="pointer-events: none;" />`);
  }
  
  return elements.join('\n');
}

// Renders the entire SVG scene and updates the DOM
function renderArtboard() {
  const loader = document.getElementById('loader-overlay');
  loader.classList.add('active');
  
  // Cancel existing animation frame and clear registry cache
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
  state.animatedObjects = [];
  
  // Set random seed
  setSeed(state.seed);
  
  // Dahlia Core Location (slightly shifted upwards from center for portrait balance)
  const cx = 500;
  const cy = 600;
  
  // Generate parts
  const stemLeavesHTML = generateStemAndLeaves(cx, cy);
  const petalsHTML = generateDahliaPetals(cx, cy);
  const leavesHTML = generatePrismaticRays(); // broad background green leaves
  const wedgesHTML = generatePrismaticWedges(cx, cy); // global slicing wedges
  const armatureHTML = generateArmatureLines(cx, cy); // geometric armature lines & stars
  
  // Canvas Noise filter template
  const noiseFilter = state.grain ? `
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" result="turbulence" />
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.12 0" in="turbulence" result="coloredNoise" />
      </filter>` : '';
  
  // Linear Gradients using dynamic colors
  const defsHTML = `
    <defs>
      ${noiseFilter}
      <linearGradient id="fadeWhite" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="fadePurple" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${stylizeColor(extractedColors.core)}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${stylizeColor(extractedColors.shadow)}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="fadeDark" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0a1210" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#0a1210" stop-opacity="0"/>
      </linearGradient>
    </defs>
  `;
  
  const grainOverlayHTML = state.grain ? `
    <rect width="100%" height="100%" filter="url(#noise)" style="mix-blend-mode: multiply; pointer-events: none;" />` : '';
  
  // Construct the full SVG string
  const svgHTML = `
    <svg 
      id="prismatic-dahlia-svg"
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" 
      width="100%" 
      height="100%"
      class="generative-art"
      style="background-color: #0c0f17; width: 100%; height: 100%;"
    >
      ${defsHTML}
      
      <!-- 1. Background foliage green leaves -->
      <g id="g-background">${leavesHTML}</g>
      
      <!-- 2. Stem and Leaves -->
      <g id="g-stem-leaves">${stemLeavesHTML}</g>
      
      <!-- 3. Dahlia Petals -->
      <g id="g-dahlia">${petalsHTML}</g>

      <!-- 4. Crystalline Armature Lines & Light Nodes -->
      <g id="g-armature">${armatureHTML}</g>
      
      <!-- 5. Prismatic Wedges (Slicing Overlays) -->
      <g id="g-wedges">${wedgesHTML}</g>
      
      <!-- 6. Global Texture overlay -->
      ${grainOverlayHTML}
    </svg>
  `;
  
  // Inject into DOM
  const artboard = document.getElementById('artboard');
  
  // Remove existing SVG
  const oldSvg = artboard.querySelector('svg');
  if (oldSvg) {
    oldSvg.remove();
  }
  
  // Insert new SVG
  artboard.insertAdjacentHTML('afterbegin', svgHTML);
  
  // Update status message
  const statusDisplay = document.getElementById('status-display');
  const totalPetalsText = state.layoutMode === 'spiral' ? 'SPIRAL' : 'RINGS';
  statusDisplay.textContent = `SEED: ${state.seed} // LAYOUT: ${totalPetalsText} // MODE: SVG`;
  
  // Fade out loader
  setTimeout(() => {
    loader.classList.remove('active');
  }, 100);

  // Start 3D perspective pivoting loop if enabled
  if (state.animated) {
    startAnimation();
  } else {
    stopAnimation();
  }
}

// Binds UI events to the app state
function bindUIEvents() {
  const controls = [
    { id: 'seed', stateKey: 'seed', displayId: 'val-seed' },
    { id: 'jitter', stateKey: 'jitter', displayId: 'val-jitter' },
    { id: 'rings', stateKey: 'rings', displayId: 'val-rings' },
    { id: 'petals', stateKey: 'petalsBase', displayId: 'val-petals' },
    { id: 'scale', stateKey: 'scale', displayId: 'val-scale' },
    { id: 'rays', stateKey: 'rays', displayId: 'val-rays' },
    { id: 'ray-opacity', stateKey: 'rayOpacity', displayId: 'val-ray-opacity' },
    { id: 'wedges', stateKey: 'wedges', displayId: 'val-wedges' }
  ];
  
  // Slide controls
  controls.forEach(ctrl => {
    const input = document.getElementById(`input-${ctrl.id}`);
    const display = document.getElementById(ctrl.displayId);
    
    // Set initial input value from state
    input.value = state[ctrl.stateKey];
    display.textContent = state[ctrl.stateKey];
    
    input.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (ctrl.id === 'seed' || ctrl.id === 'jitter' || ctrl.id === 'rings' || ctrl.id === 'petals' || ctrl.id === 'rays' || ctrl.id === 'wedges') {
        val = parseInt(val, 10);
      }
      state[ctrl.stateKey] = val;
      display.textContent = val;
      
      // Debounce render slightly for smooth sliding
      if (this.renderTimeout) clearTimeout(this.renderTimeout);
      this.renderTimeout = setTimeout(renderArtboard, 20);
    });
  });
  
  // Select control for blend mode
  const blendSelect = document.getElementById('input-blend');
  blendSelect.value = state.blendMode;
  blendSelect.addEventListener('change', (e) => {
    state.blendMode = e.target.value;
    renderArtboard();
  });

  // Select control for layout mode
  const layoutSelect = document.getElementById('input-layout');
  layoutSelect.value = state.layoutMode;
  layoutSelect.addEventListener('change', (e) => {
    state.layoutMode = e.target.value;
    renderArtboard();
  });

  // Select control for petal style type
  const styleSelect = document.getElementById('input-style-type');
  const resolutionContainer = document.getElementById('container-resolution');
  const resolutionInput = document.getElementById('input-resolution');
  const resolutionVal = document.getElementById('val-resolution');
  
  styleSelect.value = state.petalStyle;
  resolutionInput.value = state.facetResolution;
  resolutionVal.textContent = state.facetResolution;
  
  const toggleResolutionVisibility = () => {
    if (state.petalStyle === 'curved') {
      resolutionContainer.style.display = 'none';
    } else {
      resolutionContainer.style.display = 'block';
    }
  };
  
  toggleResolutionVisibility();
  
  styleSelect.addEventListener('change', (e) => {
    state.petalStyle = e.target.value;
    toggleResolutionVisibility();
    renderArtboard();
  });
  
  resolutionInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.facetResolution = val;
    resolutionVal.textContent = val;
    
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(renderArtboard, 20);
  });
  
  // Checkbox controls
  const grainCheckbox = document.getElementById('input-grain');
  grainCheckbox.checked = state.grain;
  grainCheckbox.addEventListener('change', (e) => {
    state.grain = e.target.checked;
    renderArtboard();
  });
  
  const animatedCheckbox = document.getElementById('input-animated');
  animatedCheckbox.checked = state.animated;
  animatedCheckbox.addEventListener('change', (e) => {
    state.animated = e.target.checked;
    if (state.animated) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });

  // Armature checkbox control
  const armatureCheckbox = document.getElementById('input-armature');
  armatureCheckbox.checked = state.armature;
  armatureCheckbox.addEventListener('change', (e) => {
    state.armature = e.target.checked;
    renderArtboard();
  });
  
  // Settings Panel Toggle Button (Gear Icon)
  const toggleSettingsBtn = document.getElementById('btn-toggle-settings');
  const sidebar = document.querySelector('.sidebar');
  if (toggleSettingsBtn && sidebar) {
    if (!sidebar.classList.contains('hidden')) {
      toggleSettingsBtn.classList.add('active');
    }
    toggleSettingsBtn.addEventListener('click', () => {
      const isHidden = sidebar.classList.toggle('hidden');
      if (isHidden) {
        toggleSettingsBtn.classList.remove('active');
      } else {
        toggleSettingsBtn.classList.add('active');
      }
    });
  }
  
  // Regenerate Button
  document.getElementById('btn-regenerate').addEventListener('click', () => {
    const newSeed = Math.floor(Math.random() * 1000) + 1;
    state.seed = newSeed;
    
    // Update slider UI
    const seedInput = document.getElementById('input-seed');
    const seedVal = document.getElementById('val-seed');
    seedInput.value = newSeed;
    seedVal.textContent = newSeed;
    
    renderArtboard();
  });
  
  // Download Button
  document.getElementById('btn-download').addEventListener('click', () => {
    const svgEl = document.getElementById('prismatic-dahlia-svg');
    if (!svgEl) return;
    
    // Clone SVG element to modify for export
    const clone = svgEl.cloneNode(true);
    
    // Add XML declaration and style tweaks for portability
    clone.setAttribute('width', '1000');
    clone.setAttribute('height', '1500');
    
    // Convert SVG to text
    const serializer = new XMLSerializer();
    let svgText = serializer.serializeToString(clone);
    
    // Add namespace if missing
    if (!svgText.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgText = svgText.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    
    // Prepend XML header
    const blobText = '<?xml version="1.0" standalone="no"?>\r\n' + svgText;
    
    // Create Blob
    const blob = new Blob([blobText], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    
    // Create temporary download link
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = `prismatic_dahlia_seed_${state.seed}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    
    // Clean up
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(blobUrl);
  });
  
  // Custom File Upload
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  
  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-orange)';
    dropzone.style.background = 'rgba(240, 73, 41, 0.08)';
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-color)';
    dropzone.style.background = 'rgba(0, 0, 0, 0.2)';
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-color)';
    dropzone.style.background = 'rgba(0, 0, 0, 0.2)';
    
    if (e.dataTransfer.files.length > 0) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
    }
  });
}

// Reads uploaded image and sets it as the sampler source
function handleImageUpload(file) {
  state.isCustomUpload = true;
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file (PNG, JPG, WEBP).');
    return;
  }
  
  const loader = document.getElementById('loader-overlay');
  loader.querySelector('.loader-text').textContent = 'Loading custom image...';
  loader.classList.add('active');
  
  const reader = new FileReader();
  reader.onload = (e) => {
    // Set both the source reference element and load it into the sampler
    sourceImg.src = e.target.result;
    
    // Also update reference view image
    const refImg = document.getElementById('reference-img');
    refImg.src = e.target.result;
    
    // Trigger canvas draw and regenerate on load
    sourceImg.onload = () => {
      samplerCanvas.width = sourceImg.naturalWidth;
      samplerCanvas.height = sourceImg.naturalHeight;
      samplerCtx.drawImage(sourceImg, 0, 0);
      state.imageLoaded = true;
      extractFlowerColors();
      
      loader.querySelector('.loader-text').textContent = 'Analyzing Dahlia & Building SVG...';
      renderArtboard();
    };
  };
  reader.readAsDataURL(file);
}

// --- 3D PERSPECTIVE PIVOTING ANIMATION LOOP ---

function startAnimation() {
  if (state.animationFrameId) return;
  state.animationFrameId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
  resetToFlatProjection();
}

function animate(timestamp) {
  if (!state.animated) return;

  const thetaY = 0.05 * Math.cos(timestamp * 0.0008);
  const thetaX = 0.04 * Math.sin(timestamp * 0.0006);

  state.animatedObjects.forEach(obj => {
    const el = document.getElementById(obj.id);
    if (!el) return;

    const rotated = obj.pts3D.map(p => rotate3DPoint(p.x, p.y, p.z, thetaX, thetaY));
    const projected = rotated.map(p => projectRotatedPoint(p));

    if (obj.baseColor && (obj.type === 'polygon' || obj.type === 'path')) {
      let A, B, C;
      if (obj.type === 'polygon' && rotated.length >= 3) {
        A = rotated[0];
        B = rotated[1];
        C = rotated[2];
      } else if (obj.type === 'path' && rotated.length >= 4) {
        A = rotated[0];
        B = rotated[1];
        C = rotated[3];
      }
      if (A && B && C) {
        const normal = calculateNormal(A, B, C);
        const dot = normal.x * LIGHT_DIR.x + normal.y * LIGHT_DIR.y + normal.z * LIGHT_DIR.z;
        const intensity = Math.min(0.3, Math.max(-0.3, dot));
        el.setAttribute('fill', adjustColorLighting(obj.baseColor, intensity));
      }
    }

    if (obj.type === 'polygon') {
      el.setAttribute('points', pointsToString(projected));
    } else if (obj.type === 'path') {
      const [p0, c1, c2, p3, pc] = projected;
      const d = `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} ` +
                `C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ` +
                `${c2.x.toFixed(1)},${c2.y.toFixed(1)} ` +
                `${p3.x.toFixed(1)},${p3.y.toFixed(1)} ` +
                `L ${pc.x.toFixed(1)},${pc.y.toFixed(1)} Z`;
      el.setAttribute('d', d);
    } else if (obj.type === 'line') {
      const [p1, p2] = projected;
      el.setAttribute('x1', p1.x.toFixed(1));
      el.setAttribute('y1', p1.y.toFixed(1));
      el.setAttribute('x2', p2.x.toFixed(1));
      el.setAttribute('y2', p2.y.toFixed(1));
    } else if (obj.type === 'circle') {
      const [pt] = projected;
      el.setAttribute('cx', pt.x.toFixed(1));
      el.setAttribute('cy', pt.y.toFixed(1));
    }
  });

  state.animationFrameId = requestAnimationFrame(animate);
}

function resetToFlatProjection() {
  state.animatedObjects.forEach(obj => {
    const el = document.getElementById(obj.id);
    if (!el) return;

    const rotated = obj.pts3D.map(p => rotate3DPoint(p.x, p.y, p.z, 0, 0));
    const projected = rotated.map(p => projectRotatedPoint(p));

    if (obj.baseColor && (obj.type === 'polygon' || obj.type === 'path')) {
      let A, B, C;
      if (obj.type === 'polygon' && rotated.length >= 3) {
        A = rotated[0];
        B = rotated[1];
        C = rotated[2];
      } else if (obj.type === 'path' && rotated.length >= 4) {
        A = rotated[0];
        B = rotated[1];
        C = rotated[3];
      }
      if (A && B && C) {
        const normal = calculateNormal(A, B, C);
        const dot = normal.x * LIGHT_DIR.x + normal.y * LIGHT_DIR.y + normal.z * LIGHT_DIR.z;
        const intensity = Math.min(0.3, Math.max(-0.3, dot));
        el.setAttribute('fill', adjustColorLighting(obj.baseColor, intensity));
      }
    }

    if (obj.type === 'polygon') {
      el.setAttribute('points', pointsToString(projected));
    } else if (obj.type === 'path') {
      const [p0, c1, c2, p3, pc] = projected;
      const d = `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} ` +
                `C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ` +
                `${c2.x.toFixed(1)},${c2.y.toFixed(1)} ` +
                `${p3.x.toFixed(1)},${p3.y.toFixed(1)} ` +
                `L ${pc.x.toFixed(1)},${pc.y.toFixed(1)} Z`;
      el.setAttribute('d', d);
    } else if (obj.type === 'line') {
      const [p1, p2] = projected;
      el.setAttribute('x1', p1.x.toFixed(1));
      el.setAttribute('y1', p1.y.toFixed(1));
      el.setAttribute('x2', p2.x.toFixed(1));
      el.setAttribute('y2', p2.y.toFixed(1));
    } else if (obj.type === 'circle') {
      const [pt] = projected;
      el.setAttribute('cx', pt.x.toFixed(1));
      el.setAttribute('cy', pt.y.toFixed(1));
    }
  });
}

// Start Application on load
window.addEventListener('DOMContentLoaded', () => {
  bindUIEvents();
  initImageSampler();
});
