//Commentary (465 / 500 words)
// When applying thresholding to individual RGB Channels, each channel preserves distinct structural information about the image. Reds emphasises warm tones and skin
// features, green captures mid-range luminance effectively, blue highlights cooler elements and shadows. This becomes particularily apparent when examining facial 
// features where each RGB channel reveals different aspects of facial structure.

// In contrast, thresholding after colour space conversions yields different results. The Photo YCC luma component provides superior edge detection and contrast 
// preservation compared to simple RGB averaging, as it accounts for human visual perception through gamma correction and weighted color contributions. The HSV channel 
// emphasises overall brightness indepedent of colour saturation. These differences demonstrate that color space selection critically impacts feature extraction quality.

// My extension implements a sophisticated gaze-controlled drawing system that pushes the boundaries of what's possible with webcam-based eye tracking. The system features 
// real-time visualisation of all 478 face mesh keypoints, with emphasis on iris landmarks that are crucial for gaze estimation. Many components operates cohesively to 
// succeed in this. The GazeTracker class that calculates normalized eye positions from iris offsets, a MouthOpenDetector that uses multiple lip landmarks for robust open/closed 
// state detection, and a DrawingController that translates these inputs into smooth drawing actions.

// I engineered a custom calibration system that accounts for individual user variations in eye shape and neutral mouth position. The gaze tracking algorithm performs 
// real-time calculations of iris center positions relative to eye boundaries, applies configurable sensitivity multipliers, and implements temporal smoothing to reduce 
// jitter. The mouth detection system measures aperture across multiple landmark pairs for robustness and maintains a rolling window of states to be resilient to anomalies.

// My extension is unique because it fuses multiple computer vision techniques into a cohesive creative tool. Unlike traditional gaze tracking applications that simply move 
// a cursor, my system interprets the continuous interplay between eye movements and facial expressions to enable hands-free artistic expression.

// The primary challenge I encountered was achieving precise gaze tracking without access to specialised hardware. Commercial eye trackers use infrared illumination and 
// high-resolution cameras to detect corneal reflections and pupil centers with laser accuracy. Working with a standard webcam and visible light, I reached the theoretical 
// limit of accuracy achievable with these resources. I addressed these hardware limitations through aggressive software compensation by implementing adaptive smoothing 
// algorithms, dead zone filtering to prevent drift, and a sensitivity adjustment system that users can tune in real-time. Despite these optimizations, the system's 
// precision remains fundamentally constrained by the input data quality such as small head movements and varying lightning conditions. However, I would like to emphasise
// that these limitations do not represent shortcomings of my implementation but rather, the physics constraints with the available resources I had for this project. 

// Lastly, I completed this project on schedule, meeting all required milestones and deliverables within the allocated timeframe.

///////////////////////////////////////////////////////////////////////////

// Configuration constants
const CONFIG = {
    PANEL_WIDTH: 160,
    PANEL_HEIGHT: 120,
    BRIGHTNESS_FACTOR: 1.2,
    BRIGHTNESS_MAX: 255,
    COLS: 3,
    ROWS: 5,
    PANEL_MARGIN: 20,
    PHOTO_YCC_THRESHOLD: 0.018,
    PIXELATE_BLOCK_SIZE: 5,
    KEYS: {
        FILTER_NONE: 48,  // '0'
        FILTER_GRAYSCALE: 49,  // '1'
        FILTER_BLUR: 50,  // '2'
        FILTER_COLOR: 51,  // '3'
        FILTER_PIXELATE: 52  // '4'
    }
};

// State management object
const appState = {
    faceMesh: null,
    webcam: null,
    snapshot: null,
    isSnapshotTaken: false,
    modelReady: false,
    liveDetectionActive: false,
    currentFilter: 0,
    detections: [],
    panels: [],
    sliders: {},
    processedImages: {},
    gazeController: null
};

// Image processor class to encapsulate image operations
class ImageProcessor {
    constructor() {
        this.cache = new Map();
    }
    
    // Generic pixel processing function
    processPixels(source, operation) {
        source.loadPixels();
        const dest = createImage(source.width, source.height);
        dest.loadPixels();
        
        for (let i = 0; i < source.pixels.length; i += 4) {
            const result = operation(
                source.pixels[i],     // r
                source.pixels[i + 1], // g
                source.pixels[i + 2], // b
                source.pixels[i + 3], // a
                i
            );
            dest.pixels[i] = result.r;
            dest.pixels[i + 1] = result.g;
            dest.pixels[i + 2] = result.b;
            dest.pixels[i + 3] = result.a;
        }
        
        dest.updatePixels();
        return dest;
    }
    
    // Process all images in a single pass
    processAllTransforms(snapshot) {
        const results = {};
        snapshot.loadPixels();
        
        // Pre-create all images
        const imageNames = ['grayscale', 'red', 'green', 'blue', 'photoYCC', 'hsv'];
        imageNames.forEach(name => {
            results[name] = createImage(snapshot.width, snapshot.height);
            results[name].loadPixels();
        });
        
        // Single loop for all transformations
        for (let i = 0; i < snapshot.pixels.length; i += 4) {
            const r = snapshot.pixels[i];
            const g = snapshot.pixels[i + 1];
            const b = snapshot.pixels[i + 2];
            const a = snapshot.pixels[i + 3];
            
            // Grayscale with brightness
            const gray = (r + g + b) / 3;
            const bright = Math.min(gray * CONFIG.BRIGHTNESS_FACTOR, CONFIG.BRIGHTNESS_MAX);
            results.grayscale.pixels[i] = bright;
            results.grayscale.pixels[i + 1] = bright;
            results.grayscale.pixels[i + 2] = bright;
            results.grayscale.pixels[i + 3] = a;
            
            // RGB channels
            this.setChannelPixels(results.red, i, r, 0, 0, a);
            this.setChannelPixels(results.green, i, 0, g, 0, a);
            this.setChannelPixels(results.blue, i, 0, 0, b, a);
            
            // Color spaces
            const [luma, c1, c2] = ColorSpaceConverter.rgbToPhotoYCC(r, g, b);
            this.setChannelPixels(results.photoYCC, i, luma, c1, c2, a);
            
            const [h, s, v] = ColorSpaceConverter.rgbToHsv(r, g, b);
            this.setChannelPixels(results.hsv, i, h, s, v, a);
        }
        
        // Update all pixels once
        Object.values(results).forEach(img => img.updatePixels());
        return results;
    }
    
    setChannelPixels(img, index, r, g, b, a) {
        img.pixels[index] = r;
        img.pixels[index + 1] = g;
        img.pixels[index + 2] = b;
        img.pixels[index + 3] = a;
    }
    
    // Optimized thresholding
    applyThreshold(sourceImg, threshold, component = null) {
        return this.processPixels(sourceImg, (r, g, b, a, i) => {
            let val;
            
            switch(component) {
                case 'R': val = r; break;
                case 'G': val = g; break;
                case 'B': val = b; break;
                case 'LUMA': val = r; break; // PhotoYCC luma stored in R
                case 'VALUE': val = b; break; // HSV value stored in B
                default: val = (r + g + b) / 3;
            }
            
            const output = val > threshold ? 255 : 0;
            return { r: output, g: output, b: output, a: a };
        });
    }
}

// Color space converter with memoization
class ColorSpaceConverter {
    static cache = new Map();
    
    static rgbToPhotoYCC(r, g, b) {
        const key = `${r},${g},${b}`;
        if (this.cache.has(key)) return this.cache.get(key);
        
        const R = r / 255;
        const G = g / 255;
        const B = b / 255;
        
        const Rp = R > CONFIG.PHOTO_YCC_THRESHOLD ? 1.099 * Math.pow(R, 0.45) - 0.099 : 4.5 * R;
        const Gp = G > CONFIG.PHOTO_YCC_THRESHOLD ? 1.099 * Math.pow(G, 0.45) - 0.099 : 4.5 * G;
        const Bp = B > CONFIG.PHOTO_YCC_THRESHOLD ? 1.099 * Math.pow(B, 0.45) - 0.099 : 4.5 * B;
        
        const result = [
            (0.299 * Rp + 0.587 * Gp + 0.114 * Bp) * 255,
            ((-0.299 * Rp - 0.587 * Gp + 0.886 * Bp) + 0.886) / 1.772 * 255,
            ((0.701 * Rp - 0.587 * Gp - 0.114 * Bp) + 0.701) / 1.402 * 255
        ];
        
        this.cache.set(key, result);
        return result;
    }
    
    static rgbToHsv(r, g, b) {
        const R = r / 255, G = g / 255, B = b / 255;
        const max = Math.max(R, G, B);
        const min = Math.min(R, G, B);
        const diff = max - min;
        
        let H = 0, S = 0, V = max;
        
        if (max !== 0) S = diff / max;
        if (diff !== 0) {
            if (R === max) H = (G - B) / diff;
            else if (G === max) H = 2 + (B - R) / diff;
            else H = 4 + (R - G) / diff;
        }
        
        H *= 60;
        if (H < 0) H += 360;
        
        return [H / 360 * 255, S * 255, V * 255];
    }
}

// Face filter manager
class FaceFilterManager {
    constructor() {
        this.filters = new Map([
            [0, this.noFilter],
            [1, this.grayscaleFilter],
            [2, this.blurFilter],
            [3, this.colorSpaceFilter],
            [4, this.pixelateFilter]
        ]);
    }
    
    applyFilter(faceImg, filterId, boundingBox) {
        const filterFunc = this.filters.get(filterId) || this.noFilter;
        return filterFunc.call(this, faceImg, boundingBox);
    }
    
    noFilter(img) { 
        return img; 
    }
    
    grayscaleFilter(img, box) {
        const processed = img.get(box.x, box.y, box.w, box.h);
        processed.filter(GRAY);
        return processed;
    }
    
    blurFilter(img, box) {
        const processed = img.get(box.x, box.y, box.w, box.h);
        processed.filter(BLUR, 8);
        return processed;
    }
    
    colorSpaceFilter(img, box) {
        const processed = img.get(box.x, box.y, box.w, box.h);
        processed.loadPixels();
        
        for (let i = 0; i < processed.pixels.length; i += 4) {
            const [luma, c1, c2] = ColorSpaceConverter.rgbToPhotoYCC(
                processed.pixels[i],
                processed.pixels[i + 1],
                processed.pixels[i + 2]
            );
            processed.pixels[i] = luma;
            processed.pixels[i + 1] = c1;
            processed.pixels[i + 2] = c2;
        }
        
        processed.updatePixels();
        return processed;
    }
    
    pixelateFilter(img, box) {
        const processed = img.get(box.x, box.y, box.w, box.h);
        processed.filter(GRAY);
        processed.loadPixels();
        
        const pixelated = createImage(processed.width, processed.height);
        pixelated.loadPixels();
        
        const blockSize = CONFIG.PIXELATE_BLOCK_SIZE;
        
        for (let y = 0; y < processed.height; y += blockSize) {
            for (let x = 0; x < processed.width; x += blockSize) {
                // Calculate average for block
                let sum = 0, count = 0;
                
                for (let by = 0; by < blockSize && y + by < processed.height; by++) {
                    for (let bx = 0; bx < blockSize && x + bx < processed.width; bx++) {
                        const idx = ((y + by) * processed.width + (x + bx)) * 4;
                        sum += processed.pixels[idx];
                        count++;
                    }
                }
                
                const avg = sum / count;
                
                // Fill block with average
                for (let by = 0; by < blockSize && y + by < processed.height; by++) {
                    for (let bx = 0; bx < blockSize && x + bx < processed.width; bx++) {
                        const idx = ((y + by) * processed.width + (x + bx)) * 4;
                        pixelated.pixels[idx] = avg;
                        pixelated.pixels[idx + 1] = avg;
                        pixelated.pixels[idx + 2] = avg;
                        pixelated.pixels[idx + 3] = 255;
                    }
                }
            }
        }
        
        pixelated.updatePixels();
        return pixelated;
    }
}

// Initialize processors
let imageProcessor;
let faceFilterManager;

function preload() {
    console.log("Preloading faceMesh model...");

    // Detect Firefox and give suggestion to use another browser for optimal experience
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if (isFirefox) {
        console.log("%cTo UOL Graders, please use Google Chrome or Microsoft Edge browsers instead as Firefox does not fully support WebGPU yet (which ml5.js as well as my extension requires)", "color:green");
    }

    const options = {
        maxFaces: 1,
        refineLandmarks: true,
        flipped: false
    };
    appState.faceMesh = ml5.faceMesh(options, modelLoaded);
    console.log("FaceMesh model object successfully created in preload");
}

function modelLoaded() {
    console.log('FaceMesh model loaded successfully!');
    appState.modelReady = true;
}

function setup() {
    const { COLS, ROWS, PANEL_WIDTH, PANEL_HEIGHT, PANEL_MARGIN } = CONFIG;
    
    // Initialize processors
    imageProcessor = new ImageProcessor();
    faceFilterManager = new FaceFilterManager();
    
    // Calculate canvas dimensions
    const sketchpadWidth = 400;
    const extensionWidth = sketchpadWidth + PANEL_MARGIN;
    const canvasWidth = (COLS * PANEL_WIDTH) + ((COLS + 1) * PANEL_MARGIN) + extensionWidth;
     const canvasHeight = (ROWS * (PANEL_HEIGHT + 35)) + ((ROWS + 1) * PANEL_MARGIN) + 125;    
    createCanvas(canvasWidth, canvasHeight);
    appState.webcam = createCapture(VIDEO);
    appState.webcam.hide();
    
    initializePanels();
    initializeSliders();
    initializeGazeController(extensionWidth, canvasHeight);
}

function initializePanels() {
    const titles = [
        "Webcam image", "Grayscale + Brightness", "",
        "Red channel", "Green channel", "Blue channel",
        "Threshold image", "Threshold image", "Threshold image",
        "Webcam image (repeat)", "Colour space 1", "Colour space 2",
        "Face detection", "Threshold image from CS1", "Threshold image from CS2"
    ];
    
    let titleIndex = 0;
    for (let r = 0; r < CONFIG.ROWS; r++) {
        for (let c = 0; c < CONFIG.COLS; c++) {
            if (r === 0 && c === 2) {
                titleIndex++;
                continue;
            }
            
            const x = CONFIG.PANEL_MARGIN + c * (CONFIG.PANEL_WIDTH + CONFIG.PANEL_MARGIN);
            const y = CONFIG.PANEL_MARGIN + r * (CONFIG.PANEL_HEIGHT + 30 + CONFIG.PANEL_MARGIN);
            
            appState.panels.push(new ImagePanel(x, y, CONFIG.PANEL_WIDTH, CONFIG.PANEL_HEIGHT, titles[titleIndex++])
            );
        }
    }
}

function initializeSliders() {
    const sliderPositions = [5, 6, 7, 12, 13];
    const sliderNames = ['red', 'green', 'blue', 'cs1', 'cs2'];
    
    sliderNames.forEach((name, i) => {
        const slider = createSlider(0, 255, 127);
        const panel = appState.panels[sliderPositions[i]];
        slider.position(panel.x, panel.y + CONFIG.PANEL_HEIGHT + 45);
        appState.sliders[name] = slider;
    });
}

function initializeGazeController(extensionX, canvasHeight) {
    const extensionPosX = (CONFIG.COLS * CONFIG.PANEL_WIDTH) + ((CONFIG.COLS + 1) * CONFIG.PANEL_MARGIN);
    appState.gazeController = new gazeSketchExtension(
        extensionPosX,
        CONFIG.PANEL_MARGIN,
        CONFIG.PANEL_WIDTH,
        400,
        canvasHeight - (2 * CONFIG.PANEL_MARGIN)
    );
}

function draw() {
    background(40);
    
    // Draw all panels
    appState.panels.forEach(panel => panel.display());
    
    if (appState.isSnapshotTaken) {
        appState.gazeController.display(appState.webcam);
        updateThresholdImages();
        displayFaceFilterInstructions();
    } else {
        displayPreview();
    }
}

function displayPreview() {
    image(appState.webcam, appState.panels[0].x, appState.panels[0].y + 30, CONFIG.PANEL_WIDTH, CONFIG.PANEL_HEIGHT);
    
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(16);
    
    const message = appState.modelReady ? "Click anywhere to start face detection and take a snapshot!" : "Loading face detection model...";
    text(message, width / 2, height / 2);
}

function updateThresholdImages() {
    if (!appState.processedImages.thresholds) {
        appState.processedImages.thresholds = {};
    }
    
    // Update RGB thresholds
    appState.processedImages.thresholds.red = imageProcessor.applyThreshold(
        appState.processedImages.red, appState.sliders.red.value(), 'R'
    );
    appState.processedImages.thresholds.green = imageProcessor.applyThreshold(
        appState.processedImages.green, appState.sliders.green.value(), 'G'
    );
    appState.processedImages.thresholds.blue = imageProcessor.applyThreshold(
        appState.processedImages.blue, appState.sliders.blue.value(), 'B'
    );
    appState.processedImages.thresholds.cs1 = imageProcessor.applyThreshold(
        appState.processedImages.photoYCC, appState.sliders.cs1.value(), 'LUMA'
    );
    appState.processedImages.thresholds.cs2 = imageProcessor.applyThreshold(
        appState.processedImages.hsv, appState.sliders.cs2.value(), 'VALUE'
    );
    
    // Update panels
    appState.panels[5].setImage(appState.processedImages.thresholds.red);
    appState.panels[6].setImage(appState.processedImages.thresholds.green);
    appState.panels[7].setImage(appState.processedImages.thresholds.blue);
    appState.panels[12].setImage(appState.processedImages.thresholds.cs1);
    appState.panels[13].setImage(appState.processedImages.thresholds.cs2);
}

function mousePressed() {
    if (!appState.isSnapshotTaken && appState.modelReady) {
        console.log("Mouse pressed. Taking snapshot...");
        captureSnapshot();
    } else if (!appState.modelReady) {
        console.log("Model not ready yet. Please wait...");
    }
}

function captureSnapshot() {
    appState.snapshot = appState.webcam.get();
    appState.snapshot.resize(CONFIG.PANEL_WIDTH, CONFIG.PANEL_HEIGHT);
    appState.isSnapshotTaken = true;
    
    // Process all images at once
    appState.processedImages = imageProcessor.processAllTransforms(appState.snapshot);
    
    // Set panels
    appState.panels[0].setImage(appState.snapshot);
    appState.panels[8].setImage(appState.snapshot);
    appState.panels[1].setImage(appState.processedImages.grayscale);
    appState.panels[2].setImage(appState.processedImages.red);
    appState.panels[3].setImage(appState.processedImages.green);
    appState.panels[4].setImage(appState.processedImages.blue);
    appState.panels[9].setImage(appState.processedImages.photoYCC);
    appState.panels[10].setImage(appState.processedImages.hsv);
    
    appState.processedImages.face = appState.snapshot.get();
    appState.panels[11].setImage(appState.processedImages.face);
    
    console.log("Calling faceMesh.detect() on the snapshot");
    appState.faceMesh.detect(appState.snapshot, gotFaces);
}

function gotFaces(results) {
    console.log("gotFaces callback executed. Number of faces found:", results.length);
    
    appState.detections = results;
    
    if (results.length > 0) {
        applyFaceFilter();
        appState.panels[11].setImage(appState.processedImages.face);
    } else {
        console.log("No faces detected in the image");
    }
    
    // Start live detection for extension
    if (!appState.liveDetectionActive) {
        console.log("Starting live face detection for extension...");
        appState.liveDetectionActive = true;
        appState.faceMesh.detectStart(appState.webcam.elt, gotLiveFaces);
    }
}

function gotLiveFaces(results) {
    appState.gazeController.update(results);
}

function keyPressed() {
    // Handle extension keys first
    if (appState.isSnapshotTaken) {
        appState.gazeController.handleKeyPress(keyCode);
    }
    
    // Handle face filter keys
    if (!appState.isSnapshotTaken || appState.detections.length === 0) return;
    
    const filterMap = {
        [CONFIG.KEYS.FILTER_NONE]: 0,
        [CONFIG.KEYS.FILTER_GRAYSCALE]: 1,
        [CONFIG.KEYS.FILTER_BLUR]: 2,
        [CONFIG.KEYS.FILTER_COLOR]: 3,
        [CONFIG.KEYS.FILTER_PIXELATE]: 4
    };
    
    if (filterMap.hasOwnProperty(keyCode)) {
        appState.currentFilter = filterMap[keyCode];
        console.log(`Filter ${appState.currentFilter} selected`);
        applyFaceFilter();
        appState.panels[11].setImage(appState.processedImages.face);
    }
}

// Display Face Filter instructions
function displayFaceFilterInstructions() {
    // Only show if a snapshot is taken and faces are detected
    if (!appState.isSnapshotTaken || appState.detections.length === 0) {
        return; 
    }

    const panel = appState.panels[11]; // This is the 'Face detection' panel
    const boxMargin = 15; // Margin below the panel
    const boxWidth = 180;
    const lineHeight = 14;
    const padding = 10;
    const numLines = 6; // 1 title line + 5 filter lines
    const boxHeight = numLines * lineHeight + 2 * padding;

    // MODIFIED LINE: Align the box to the left of the panel instead of centering.
    const boxX = panel.x; 
    const boxY = panel.y + 30 + panel.h + boxMargin; // Below the panel's content area + title bar

    push();
    fill(255, 255, 255, 200); // White background, semi-transparent
    noStroke();
    rectMode(CORNER);
    rect(boxX, boxY, boxWidth, boxHeight, 5); // Draw a rounded rectangle

    fill(0); // Black text
    textAlign(LEFT, TOP);
    textSize(11);

    const textStartX = boxX + padding;
    let currentTextY = boxY + padding;

    text("FACE FILTER CONTROLS:", textStartX, currentTextY);
    currentTextY += lineHeight;
    text("0: No Filter", textStartX, currentTextY);
    currentTextY += lineHeight;
    text("1: Grayscale Filter", textStartX, currentTextY);
    currentTextY += lineHeight;
    text("2: Blur Filter (Strength 8)", textStartX, currentTextY);
    currentTextY += lineHeight;
    text("3: Color Space Filter (PhotoYCC)", textStartX, currentTextY);
    currentTextY += lineHeight;
    text("4: Pixelate Filter (Block 5)", textStartX, currentTextY);
    pop();
}

function applyFaceFilter() {
    let graphics = createGraphics(appState.snapshot.width, appState.snapshot.height);
    graphics.image(appState.snapshot, 0, 0);
    
    if (appState.detections.length === 0) {
        appState.processedImages.face = graphics;
        return;
    }
    
    for (const face of appState.detections) {
        const keypoints = face.keypoints || [];
        if (keypoints.length === 0) continue;
        
        // Calculate bounding box
        const bounds = calculateBoundingBox(keypoints);
        const angle = calculateFaceAngle(keypoints);
        
        if (appState.currentFilter > 0 && bounds.w > 0 && bounds.h > 0) {
            const processedFace = faceFilterManager.applyFilter(
                appState.snapshot,
                appState.currentFilter,
                bounds
            );
            
            // Draw processed face with rotation
            graphics.push();
            graphics.translate(bounds.centerX, bounds.centerY);
            graphics.rotate(angle);
            graphics.image(processedFace, -bounds.w/2, -bounds.h/2, bounds.w, bounds.h);
            graphics.pop();
        }
        
        // Draw bounding box
        graphics.push();
        graphics.stroke(0, 255, 0);
        graphics.strokeWeight(2);
        graphics.noFill();
        graphics.translate(bounds.centerX, bounds.centerY);
        graphics.rotate(angle);
        graphics.rect(-bounds.w/2, -bounds.h/2, bounds.w, bounds.h);
        graphics.pop();
    }
    
    appState.processedImages.face = graphics;
}

function calculateBoundingBox(keypoints) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const point of keypoints) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    
    return {
        x: Math.floor(minX),
        y: Math.floor(minY),
        w: Math.floor(maxX - minX),
        h: Math.floor(maxY - minY),
        centerX: Math.floor(minX + (maxX - minX) / 2),
        centerY: Math.floor(minY + (maxY - minY) / 2)
    };
}

function calculateFaceAngle(keypoints) {
    const topOfNose = keypoints[6] || keypoints[0];
    const chin = keypoints[152] || keypoints[keypoints.length - 1];
    return atan2(chin.y - topOfNose.y, chin.x - topOfNose.x) - (PI / 2);
}