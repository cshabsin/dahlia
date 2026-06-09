// SVG Dimensions
const SVG_WIDTH = 800;
const SVG_HEIGHT = 1200;

// Default Feininger Colors for fallback/blending
const FEININGER_SLATE = { r: 119, g: 136, b: 153 }; // #778899
const FEININGER_OCHRE = { r: 218, g: 165, b: 32 };  // #DAA520
const FEININGER_SAND = { r: 214, g: 206, b: 173 };  // #d6cead
const FEININGER_PLUM = { r: 74, g: 21, b: 41 };     // #4a1529
const FEININGER_DARK = { r: 20, g: 31, b: 51 };     // #141f33

// App State
const state = {
  seed: 42,
  jitter: 12,
  rings: 10,
  petalsBase: 8,
  scale: 1.1,
  rays: 6,
  rayOpacity: 0.10,
  blendMode: 'overlay',
  grain: true,
  animated: true,
  imageLoaded: false
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
  
  // --- ENFORCE DEEP BLUISH VIOLET SHIFT ---
  // Shift towards bluish violet: boost blue relative to red, and darken overall
  let { r: cr, g: cg, b: cb } = extractedColors.core;
  cb = Math.min(255, Math.max(cb, Math.round(cr * 1.18)));
  cr = Math.round(cr * 0.68);
  cg = Math.round(cg * 0.60);
  cb = Math.round(cb * 0.85);
  extractedColors.core = { r: cr, g: cg, b: cb };
  
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
  
  console.log("Dynamically Extracted Palette (Bluish-Violet Enforced):", extractedColors);
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

// Samples color at (x, y) relative to SVG coordinates (800 x 1200)
function sampleColor(x, y) {
  if (!state.imageLoaded) {
    // Return a default mathematical gradient if image not loaded
    const dist = Math.hypot(x - 400, y - 550);
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

// Stylize a sampled color with Feininger aesthetics (mute it and blend with palette)
function stylizeColor(rgb, type = 'lit') {
  // Convert color to HSL to perform controlled modifications
  let { r, g, b } = rgb;
  
  // Blend with Feininger palette tones (20% blend to give historical feel)
  const blendFactor = 0.22;
  const isWarm = (r > g && r > b); // Is it a reddish/pinkish/yellowish petal color?
  
  const blendTarget = isWarm ? FEININGER_SAND : FEININGER_SLATE;
  
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
    { x: stemTopX - 15 + randomRange(-jit, jit), y: stemTopY },
    { x: stemTopX + 10 + randomRange(-jit, jit), y: stemTopY },
    { x: stemBottomX + 25 + randomRange(-jit, jit), y: stemBottomY },
    { x: stemBottomX - 10 + randomRange(-jit, jit), y: stemBottomY }
  ];
  
  // Sample green tones from stem area
  const stemCol = stylizeColor(sampleColor(cx, (cy + SVG_HEIGHT) / 2), 'shaded');
  elements.push(createPolygonNode(stemPoints1, stemCol, 0.95, 'normal', 'stem-base'));
  
  // 2. Leaves: large shards branching off the stem
  const numLeaves = 4;
  for (let i = 0; i < numLeaves; i++) {
    const side = i % 2 === 0 ? -1 : 1; // alternating left/right
    const leafY = cy + 180 + i * 160;
    const leafStartX = cx + (side * 8);
    const leafEndX = leafStartX + (side * randomRange(120, 220));
    const leafEndY = leafY + randomRange(40, 120);
    
    const leafPoints = [
      { x: leafStartX, y: leafY },
      { x: leafStartX + (side * 40), y: leafY - 30 },
      { x: leafEndX, y: leafEndY },
      { x: leafStartX, y: leafY + 60 }
    ];
    
    // Sample foliage color
    const col = sampleColor(leafStartX + side * 80, leafY + 30);
    const fillLit = stylizeColor(col, 'lit');
    const fillShade = stylizeColor(col, 'shaded');
    
    // Split leaf in two triangles
    const splitLine = [leafPoints[0], leafPoints[2]];
    const tri1 = [leafPoints[0], leafPoints[1], leafPoints[2]];
    const tri2 = [leafPoints[0], leafPoints[3], leafPoints[2]];
    
    const origin = leafPoints[0];
    const dur = randomRange(5, 9);
    
    elements.push(createPolygonNode(tri1, fillLit, 0.85, 'normal', `leaf-${i}-lit`, origin, dur));
    elements.push(createPolygonNode(tri2, fillShade, 0.85, 'normal', `leaf-${i}-shade`, origin, dur));
  }
  
  return elements.join('\n');
}

// Generates concentric layers of Dahlia petals
function generateDahliaPetals(cx, cy) {
  const petals = [];
  const numRings = state.rings;
  const basePetals = state.petalsBase;
  const maxRadius = Math.min(SVG_WIDTH, SVG_HEIGHT) * 0.42 * state.scale;
  
  // Vibrant colors for blending (dynamically sampled from the flower core/highlights)
  const RICH_PURPLE = extractedColors.core; 
  const DEEP_PLUM_VAL = extractedColors.shadow;
  const whiteTarget = extractedColors.highlight;
  
  // We generate petals from outermost ring to innermost, so that inner petals draw on top
  for (let rIndex = numRings - 1; rIndex >= 0; rIndex--) {
    // Rings closer to center are smaller
    const ringRadius = maxRadius * Math.pow((rIndex + 1) / numRings, 1.10);
    // Outer rings have more petals
    const numPetals = Math.floor(basePetals + rIndex * 1.8);
    const angleStep = (Math.PI * 2) / numPetals;
    
    // Alternate rotation offset to interlock petals
    const angleOffset = rIndex * 0.13;
    
    // Normalized distance from center (0 at core, 1 at edge)
    const rPct = (rIndex + 1) / numRings;
    
    // Determine the petal zone
    // Zone 1: Innermost (rPct < 0.28) - bunched up, narrow, almost entirely purple with white fade tip
    // Zone 2: Intermediate Cups (0.28 <= rPct < 0.55) - cups, white rim, purple inside
    // Zone 3: Outermost (rPct >= 0.55) - normal petals, 80% purple, white highlights/borders
    let zone = 3;
    if (rPct < 0.28) {
      zone = 1;
    } else if (rPct < 0.55) {
      zone = 2;
    }
    
    // Customize scale and dimensions depending on zone
    let scaleLen = 2.3;
    let scaleWidth = 0.95;
    
    if (zone === 1) {
      // Innermost: bunched up, narrower and slightly longer pointing out
      scaleLen = 2.4;
      scaleWidth = 0.60;
    } else if (zone === 2) {
      // Intermediate cups: flared out
      scaleLen = 2.2;
      scaleWidth = 1.05;
    } else {
      // Outermost: normal petals
      scaleLen = 2.3;
      scaleWidth = 0.95;
    }
    
    const petalLen = (maxRadius / numRings) * scaleLen * state.scale;
    const petalWidth = ringRadius * (Math.PI * 2 / numPetals) * scaleWidth * state.scale;
    
    for (let pIndex = 0; pIndex < numPetals; pIndex++) {
      const angle = angleStep * pIndex + angleOffset;
      
      // Jitter amount scales down near the center of the flower
      const jit = state.jitter * rPct;
      
      // Rotation & translation helper for polar petal vertices
      const getPt = (rOffset, aOffset) => {
        const x = cx + rOffset * Math.cos(angle + aOffset);
        const y = cy + rOffset * Math.sin(angle + aOffset);
        return {
          x: x + randomRange(-jit, jit),
          y: y + randomRange(-jit, jit)
        };
      };
      
      // Hexagonal approximation of a football/oval petal
      // Point 0: Inner Tip (base)
      const p0 = getPt(ringRadius - petalLen * 0.5, 0);
      
      // Points 1 & 5: Inner Left & Right shoulders (tapered towards base)
      const shoulderAngle = petalWidth / (2 * ringRadius);
      const p1 = getPt(ringRadius - petalLen * 0.15, -shoulderAngle * 0.82);
      const p5 = getPt(ringRadius - petalLen * 0.15, shoulderAngle * 0.82);
      
      // Points 2 & 4: Outer Left & Right shoulders (widest part, near outer half)
      const p2 = getPt(ringRadius + petalLen * 0.18, -shoulderAngle * 1.05);
      const p4 = getPt(ringRadius + petalLen * 0.18, shoulderAngle * 1.05);
      
      // Point 3: Outer Tip
      const p3 = getPt(ringRadius + petalLen * 0.5, 0);
      
      // Point C: Petal Centroid/Center
      const pc = getPt(ringRadius, 0);
      
      // Sway animation setup (anchored at the base inner tip p0)
      const origin = p0;
      const animSpeed = randomRange(4.8, 8.5);
      
      if (zone === 1) {
        // --- ZONE 1: INNERMOST PETALS ---
        // Almost entirely rich purple, small white fade at tip
        const sampleBase = sampleColor(p0.x, p0.y);
        const sampleBody = sampleColor(pc.x, pc.y);
        const sampleTip = sampleColor(p3.x, p3.y);
        
        // Solid rich purple base & body (90% blend)
        const blendR = (s) => s.r * 0.1 + RICH_PURPLE.r * 0.9;
        const blendG = (s) => s.g * 0.1 + RICH_PURPLE.g * 0.9;
        const blendB = (s) => s.b * 0.1 + RICH_PURPLE.b * 0.9;
        
        const fBaseL = stylizeColor({ r: blendR(sampleBase), g: blendG(sampleBase), b: blendB(sampleBase) }, 'lit');
        const fBaseR = stylizeColor({ r: blendR(sampleBase), g: blendG(sampleBase), b: blendB(sampleBase) }, 'shaded');
        
        const fBodyL = stylizeColor({ r: blendR(sampleBody), g: blendG(sampleBody), b: blendB(sampleBody) }, 'lit');
        const fBodyR = stylizeColor({ r: blendR(sampleBody), g: blendG(sampleBody), b: blendB(sampleBody) }, 'shaded');
        
        // Tip fades slightly to white
        const tipBlend = 0.22; // 22% white fade (mostly purple)
        const tr = sampleTip.r * 0.05 + RICH_PURPLE.r * 0.73 + whiteTarget.r * tipBlend;
        const tg = sampleTip.g * 0.05 + RICH_PURPLE.g * 0.73 + whiteTarget.g * tipBlend;
        const tb = sampleTip.b * 0.05 + RICH_PURPLE.b * 0.73 + whiteTarget.b * tipBlend;
        const fTipL = stylizeColor({ r: tr, g: tg, b: tb }, 'lit');
        const fTipR = stylizeColor({ r: tr, g: tg, b: tb }, 'shaded');
        
        // Borders are also purple
        const fBorderL = fBodyL;
        const fBorderR = fBodyR;
        
        // Shards
        petals.push(createPolygonNode([p0, p1, pc], fBaseL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-base-l`, origin, animSpeed));
        petals.push(createPolygonNode([p0, p5, pc], fBaseR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-base-r`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p1, p2], fBodyL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-body-l`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p5, p4], fBodyR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-body-r`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p2, p3], fTipL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-tip-l`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p4, p3], fTipR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-tip-r`, origin, animSpeed));
        petals.push(createPolygonNode([p1, p2, p3], fBorderL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-l`, origin, animSpeed));
        petals.push(createPolygonNode([p5, p4, p3], fBorderR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-r`, origin, animSpeed));
        
      } else if (zone === 2) {
        // --- ZONE 2: INTERMEDIATE CUP PETALS ---
        // A little cup with a distinct white circle rim and a deep purple "inside"
        const sampleBase = sampleColor(p0.x, p0.y);
        
        // Base is deep rich purple
        const baseR = sampleBase.r * 0.1 + RICH_PURPLE.r * 0.9;
        const baseG = sampleBase.g * 0.1 + RICH_PURPLE.g * 0.9;
        const baseB = sampleBase.b * 0.1 + RICH_PURPLE.b * 0.9;
        
        const fBaseL = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'lit');
        const fBaseR = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'shaded');
        
        // Rims (sides & tip of the cup) are bright white/cream
        const fRimL = stylizeColor(whiteTarget, 'lit');
        const fRimR = stylizeColor(whiteTarget, 'shaded');
        
        // Hollow Inside [pc, p2, p4] is deep dark plum/purple
        const fHollow = stylizeColor(DEEP_PLUM_VAL, 'shaded');
        
        // Borders are crisp white highlights
        const fBorderL = 'rgb(255, 255, 253)';
        const fBorderR = 'rgb(230, 230, 225)';
        
        // Base deep purple shards
        petals.push(createPolygonNode([p0, p1, pc], fBaseL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-base-l`, origin, animSpeed));
        petals.push(createPolygonNode([p0, p5, pc], fBaseR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-base-r`, origin, animSpeed));
        
        // White cup rims
        petals.push(createPolygonNode([pc, p1, p2], fRimL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-body-l`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p5, p4], fRimR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-body-r`, origin, animSpeed));
        
        // White tip rims
        petals.push(createPolygonNode([pc, p2, p3], fRimL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-tip-l`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p4, p3], fRimR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-tip-r`, origin, animSpeed));
        
        // Hollow dark center (drawn on top of the rim to sit inside)
        petals.push(createPolygonNode([pc, p2, p4], fHollow, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-hollow`, origin, animSpeed));
        
        // White border highlights
        petals.push(createPolygonNode([p1, p2, p3], fBorderL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-l`, origin, animSpeed));
        petals.push(createPolygonNode([p5, p4, p3], fBorderR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-r`, origin, animSpeed));
        
      } else {
        // --- ZONE 3: OUTERMOST PETALS ---
        // Normal flat petals, where purple is 80% of the length and white highlight at outer end
        const sampleBase = sampleColor(p0.x, p0.y);
        const sampleBody = sampleColor(pc.x, pc.y);
        const sampleTip = sampleColor(p3.x, p3.y);
        
        // Base is 100% rich purple
        const baseR = sampleBase.r * 0.1 + RICH_PURPLE.r * 0.9;
        const baseG = sampleBase.g * 0.1 + RICH_PURPLE.g * 0.9;
        const baseB = sampleBase.b * 0.1 + RICH_PURPLE.b * 0.9;
        
        const fBaseL = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'lit');
        const fBaseR = stylizeColor({ r: baseR, g: baseG, b: baseB }, 'shaded');
        
        // Body is 80% rich purple
        const bodyR = sampleBody.r * 0.1 + RICH_PURPLE.r * 0.9;
        const bodyG = sampleBody.g * 0.1 + RICH_PURPLE.g * 0.9;
        const bodyB = sampleBody.b * 0.1 + RICH_PURPLE.b * 0.9;
        
        const fBodyL = stylizeColor({ r: bodyR, g: bodyG, b: bodyB }, 'lit');
        const fBodyR = stylizeColor({ r: bodyR, g: bodyG, b: bodyB }, 'shaded');
        
        // Tip has the white highlight
        const tipBlend = 0.52; // 52% white highlight (softer fade)
        const tr = sampleTip.r * 0.05 + RICH_PURPLE.r * 0.43 + whiteTarget.r * tipBlend;
        const tg = sampleTip.g * 0.05 + RICH_PURPLE.g * 0.43 + whiteTarget.g * tipBlend;
        const tb = sampleTip.b * 0.05 + RICH_PURPLE.b * 0.43 + whiteTarget.b * tipBlend;
        
        const fTipL = stylizeColor({ r: tr, g: tg, b: tb }, 'lit');
        const fTipR = stylizeColor({ r: tr, g: tg, b: tb }, 'shaded');
        
        // Borders are crisp white highlights
        const fBorderL = 'rgb(255, 255, 253)';
        const fBorderR = 'rgb(230, 230, 225)';
        
        // Base shards
        petals.push(createPolygonNode([p0, p1, pc], fBaseL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-base-l`, origin, animSpeed));
        petals.push(createPolygonNode([p0, p5, pc], fBaseR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-base-r`, origin, animSpeed));
        
        // Body shards
        petals.push(createPolygonNode([pc, p1, p2], fBodyL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-body-l`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p5, p4], fBodyR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-body-r`, origin, animSpeed));
        
        // Tip shards
        petals.push(createPolygonNode([pc, p2, p3], fTipL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-tip-l`, origin, animSpeed));
        petals.push(createPolygonNode([pc, p4, p3], fTipR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-tip-r`, origin, animSpeed));
        
        // Border highlights
        petals.push(createPolygonNode([p1, p2, p3], fBorderL, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-l`, origin, animSpeed));
        petals.push(createPolygonNode([p5, p4, p3], fBorderR, 1.0, 'normal', `petal-r${rIndex}-p${pIndex}-border-r`, origin, animSpeed));
      }
    }
  }
  
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
    let pTip = { x: 400 + randomRange(-150, 150), y: 480 + randomRange(-150, 150) };
    
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
    
    // Animation: sway leaf slightly around its base midpoint
    const midBaseX = (p1.x + p2.x) / 2;
    const midBaseY = (p1.y + p2.y) / 2;
    
    let animElement = '';
    if (state.animated) {
      const dur = randomRange(10, 18);
      animElement = `<animateTransform 
        attributeName="transform" 
        type="rotate" 
        values="-2.2 ${midBaseX.toFixed(1)} ${midBaseY.toFixed(1)}; 2.2 ${midBaseX.toFixed(1)} ${midBaseY.toFixed(1)}; -2.2 ${midBaseX.toFixed(1)} ${midBaseY.toFixed(1)}" 
        dur="${dur.toFixed(2)}s" 
        repeatCount="indefinite" />`;
    }
    
    const pts = [p1, p2, pTip];
    const leafOpacity = Math.min(0.95, state.rayOpacity * 2.8); // make them significantly brighter & more visible
    
    leaves.push(`<polygon points="${pointsToString(pts)}" fill="${fillBase}" opacity="${leafOpacity.toFixed(2)}">${animElement}</polygon>`);
  }
  
  return leaves.join('\n');
}

// Renders the entire SVG scene and updates the DOM
function renderArtboard() {
  const loader = document.getElementById('loader-overlay');
  loader.classList.add('active');
  
  // Set random seed
  setSeed(state.seed);
  
  // Dahlia Core Location (slightly shifted upwards from center for portrait balance)
  const cx = 400;
  const cy = 480;
  
  // Generate parts
  const stemLeavesHTML = generateStemAndLeaves(cx, cy);
  const petalsHTML = generateDahliaPetals(cx, cy);
  const leavesHTML = generatePrismaticRays(); // broad background green leaves
  
  // Canvas Noise filter template
  const filterHTML = state.grain ? `
    <defs>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" result="turbulence" />
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.12 0" in="turbulence" result="coloredNoise" />
      </filter>
    </defs>` : '';
  
  const grainOverlayHTML = state.grain ? `
    <rect width="100%" height="100%" filter="url(#noise)" style="mix-blend-mode: multiply; pointer-events: none;" />` : '';
  
  // Construct the full SVG string
  const svgHTML = `
    <svg 
      id="feininger-dahlia-svg"
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" 
      width="100%" 
      height="100%"
      class="generative-art"
      style="background-color: #0c0f17; width: 100%; height: 100%;"
    >
      ${filterHTML}
      
      <!-- 1. Background foliage green leaves (replacing radial shards) -->
      <g id="g-background">${leavesHTML}</g>
      
      <!-- 2. Stem and Leaves -->
      <g id="g-stem-leaves">${stemLeavesHTML}</g>
      
      <!-- 3. Dahlia Petals -->
      <g id="g-dahlia">${petalsHTML}</g>
      
      <!-- 4. Global Texture overlay -->
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
  statusDisplay.textContent = `SEED: ${state.seed} // PETALS: ${state.rings * state.petalsBase * 2} // MODE: SVG`;
  
  // Fade out loader
  setTimeout(() => {
    loader.classList.remove('active');
  }, 100);
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
    { id: 'ray-opacity', stateKey: 'rayOpacity', displayId: 'val-ray-opacity' }
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
      if (ctrl.id === 'seed' || ctrl.id === 'jitter' || ctrl.id === 'rings' || ctrl.id === 'petals' || ctrl.id === 'rays') {
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
    renderArtboard();
  });
  
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
    const svgEl = document.getElementById('feininger-dahlia-svg');
    if (!svgEl) return;
    
    // Clone SVG element to modify for export
    const clone = svgEl.cloneNode(true);
    
    // Add XML declaration and style tweaks for portability
    clone.setAttribute('width', '800');
    clone.setAttribute('height', '1200');
    
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
    downloadLink.download = `feininger_dahlia_seed_${state.seed}.svg`;
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

// Start Application on load
window.addEventListener('DOMContentLoaded', () => {
  bindUIEvents();
  initImageSampler();
});
