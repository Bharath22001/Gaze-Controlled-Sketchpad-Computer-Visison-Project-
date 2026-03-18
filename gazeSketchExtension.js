// I created this class to act as the main controller for the entire extension.
// It coordinates the live video feed, gaze tracking, mouth detection, and the drawing canvas.
class gazeSketchExtension {
    // This constructor is responsible for setting up all the main components and their layout on the canvas.
    constructor(x, y, feedWidth, sketchWidth, canvasHeight) {
        // Here, I create an image panel that will display the live video feed from the webcam.
        this.liveFeedPanel = new ImagePanel(x, y, feedWidth, 120, "Live Feed with Keypoints");

        // I implemented this block to dynamically calculate the sketchpad's height.
        // This ensures it fits perfectly on the canvas along with all other UI elements like title bars and the instruction box.
        const liveFeedPanelTotalHeight = 120 + 30; 
        const margin = 20;
        const sketchPadTitleHeight = 30;
        const instructionBoxMaxHeight = 155;

        const totalNonSketchpadHeight = liveFeedPanelTotalHeight + margin + sketchPadTitleHeight + instructionBoxMaxHeight;
        const sketchPadHeight = canvasHeight - totalNonSketchpadHeight;
        
        // I position the sketchpad below the live feed panel.
        const sketchPadY = y + liveFeedPanelTotalHeight + margin;
        this.sketchPad = new SketchPad(x, sketchPadY, sketchWidth, sketchPadHeight);
        
        // Next, I initialise the core tracking and drawing components.
        this.gazeTracker = new GazeTracker();
        this.mouthDetector = new mouthOpenDetector();
        this.drawingController = new DrawingController(this.sketchPad);
        
        // I set up these references so the individual components can communicate back to this main controller if needed.
        this.gazeTracker.setGazeController(this);
        this.mouthDetector.setGazeController(this);
        
        // This property will hold the latest facial detection data from the model.
        this.liveDetections = [];
        
        // This manages the visibility of the on-screen instructions.
        this.showInstructions = true;
        
        // I've set up a state machine to manage the calibration process.
        // It can be "pending", "gaze", "mouth", or "complete".
        this.calibrationMode = "pending"; 
        this.calibrationStep = 0;
        this.calibrationTimer = 0;
        this.calibrationTarget = {x: 0.5, y: 0.5}; // The default target is the center of the screen.
    }

    // This update function is called every time new face detection results are available.
    update(detections) {
        this.liveDetections = detections;

        // First, I check if there are any valid detections to process.
        if (detections && detections.length > 0) {
            const face = detections[0];
            if (face.keypoints && face.keypoints.length > 0) {
                // I pass the keypoints to the individual trackers to update their internal states.
                this.gazeTracker.update(face.keypoints);
                this.mouthDetector.update(face.keypoints);

                // Crucially, the drawing controller is only updated if the calibration process is complete.
                if (this.calibrationMode == "complete") {
                    const gazePos = this.gazeTracker.getGazePosition();
                    const isMouthOpen = this.mouthDetector.getIsMouthOpen();
                    this.drawingController.update(gazePos, isMouthOpen);
                }
            }
        }
    }
    
    // This is the main display method that orchestrates rendering all visual components to the canvas on each frame.
    display(webcamFeed) {
        this.webcamFeed = webcamFeed;

        // I update and display the live feed panel, then draw the keypoints overlay on top.
        this.liveFeedPanel.setImage(webcamFeed);
        this.liveFeedPanel.display();
        this.drawKeypointsOverlay();

        // Then, I display the sketchpad.
        this.sketchPad.display();

        // I use a conditional check to show the calibration UI only when calibration is not yet complete.
        if (this.calibrationMode != "complete") {
            this.displayCalibrationUI();
        }

        // I display the status text panel.
        this.displayStatus();

        // And finally, the instructions are displayed if they haven't been hidden.
        if (this.showInstructions) {
            this.displayInstructions();
        }
    }

    // I created this function to handle all the UI elements specific to the calibration process.
    displayCalibrationUI() {
        push();
        
        // This part draws a semi-transparent overlay to focus the user's attention during calibration.
        fill(0, 0, 0, 100);
        rect(this.sketchPad.x, this.sketchPad.y + 30, this.sketchPad.w, this.sketchPad.h);

        // This block shows different instructions based on the current step of the calibration.
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(16);

        const centerX = this.sketchPad.x + this.sketchPad.w / 2;
        const centerY = this.sketchPad.y + 30 + this.sketchPad.h / 2;
        
        // When waiting to start, it displays instructions on how to begin.
        if (this.calibrationMode == "pending") {
            text("CALIBRATION REQUIRED", centerX, centerY - 40);
            textSize(12);
            text("Follow these steps to calibrate:", centerX, centerY - 10);
            text("1. First, let's calibrate your gaze", centerX, centerY + 10);
            text("2. Then, let's calibrate your mouth", centerX, centerY + 30);
            textSize(14);
            fill(0, 255, 0);
            text("Press 'C' to start calibration", centerX, centerY + 60);
        // During gaze calibration, it shows a target for the user to look at.
        } else if (this.calibrationMode == "gaze") {
            text("GAZE CALIBRATION", centerX, centerY - 60);
            textSize(12);
            text("Look at the green target", centerX, centerY - 30);
            text("Keep your head still and focus on the target", centerX, centerY - 10);

            // Here, I draw the calibration target on the sketchpad.
            const targetX = this.sketchPad.x + this.calibrationTarget.x * this.sketchPad.w;
            const targetY = this.sketchPad.y + 30 + this.calibrationTarget.y * this.sketchPad.h;

            // I added a pulsing animation to make the target more engaging.
            const pulseSize = 20 + sin(frameCount * 0.1) * 5;
            noFill();
            stroke(0, 255, 0);
            strokeWeight(2);
            ellipse(targetX, targetY, pulseSize, pulseSize);

            // I also draw a simple crosshair and a center dot for the target.
            line(targetX - 15, targetY, targetX + 15, targetY);
            line(targetX, targetY - 15, targetX, targetY + 15);
            fill(0, 255, 0);
            noStroke();
            ellipse(targetX, targetY, 5, 5);
            
            fill(0, 255, 0);
            textAlign(CENTER);
            textSize(14);
            text("Press 'C' when looking at the target", centerX, centerY + 80);
        // For mouth calibration, it instructs the user to close their mouth and press a key.
        } else if (this.calibrationMode == "mouth") {
            text("MOUTH CALIBRATION", centerX, centerY - 40);
            textSize(12);
            text("Please CLOSE your mouth", centerX, centerY - 10);
            text("Press 'M' to calibrate closed mouth", centerX, centerY + 40);

            // This part shows the user what the system is currently detecting, for better feedback.
            textSize(12);
            fill(255, 255, 0);
            const mouthStatus = this.mouthDetector.getIsMouthOpen() ? "Currently detecting: OPEN MOUTH" : "Currently detecting: CLOSED MOUTH";
            text(mouthStatus, centerX, centerY + 70);
        }
        pop();
    }

    // This function is responsible for drawing the facial keypoints directly onto the live feed panel.
    drawKeypointsOverlay() {
        if (this.liveDetections.length > 0 && this.webcamFeed) {
            const panel = this.liveFeedPanel;
            const scaleX = panel.w / this.webcamFeed.width;
            const scaleY = panel.h / this.webcamFeed.height;

            // It iterates through each detected face...
            for (const face of this.liveDetections) {
                if (face.keypoints && face.keypoints.length > 0) {
                    // ...and then through each standard facial keypoint.
                    for (let i = 0; i < Math.min(468, face.keypoints.length); i++) {
                        const point = face.keypoints[i];
                        if (!point) continue;
                        const scaledPx = point.x * scaleX;
                        const scaledPy = point.y * scaleY;

                        // I've used different colours to visually distinguish different parts of the face.
                        if (i < 17) fill(255, 0, 0, 150); // Jawline - red
                        else if (i < 36) fill(255, 255, 0, 150); // Eyebrows - yellow  
                        else if (i < 68) fill(0, 255, 0, 150); // Eyes - green
                        else if (i < 91) fill(0, 255, 255, 150); // Nose - cyan
                        else if (i < 120) fill(255, 0, 255, 150); // Lips - magenta
                        else fill(100, 100, 255, 100); // Rest - light blue
                        
                        noStroke();
                        ellipse(panel.x + scaledPx, panel.y + 30 + scaledPy, 2, 2);
                    }
                    
                    // I've added a special section to highlight the iris keypoints with larger, brightly coloured circles.
                    if (face.keypoints.length >= 478) {
                        push();
                        // Left iris (468-472) is drawn in bright yellow.
                        fill(255, 255, 0);
                        noStroke();
                        for (let i = 468; i <= 472; i++) {
                            const point = face.keypoints[i];
                            if (point) {
                                const scaledPx = point.x * scaleX;
                                const scaledPy = point.y * scaleY;
                                ellipse(panel.x + scaledPx, panel.y + 30 + scaledPy, 6, 6);
                                // I also add a label to the center iris point.
                                if (i === 468) {
                                    textSize(8);
                                    text("L", panel.x + scaledPx + 8, panel.y + 30 + scaledPy);
                                }
                            }
                        }

                        // Right iris (473-477) is drawn in bright cyan.
                        fill(0, 255, 255);
                        for (let i = 473; i <= 477; i++) {
                            const point = face.keypoints[i];
                            if (point) {
                                const scaledPx = point.x * scaleX;
                                const scaledPy = point.y * scaleY;
                                ellipse(panel.x + scaledPx, panel.y + 30 + scaledPy, 6, 6);
                                // I add a label to the right one as well.
                                if (i == 473) {
                                    textSize(8);
                                    text("R", panel.x + scaledPx + 8, panel.y + 30 + scaledPy);
                                }
                            }
                        }
                        pop();
                    }
                }

                // If the mouth is detected as open, it draws a green border around the feed as a clear visual indicator.
                if (this.mouthDetector.getIsMouthOpen()) {
                    push();
                    noFill();
                    stroke(0, 255, 0);
                    strokeWeight(2);
                    rect(panel.x + 5, panel.y + 35, panel.w - 10, panel.h - 10);
                    fill(0, 255, 0);
                    noStroke();
                    textAlign(CENTER);
                    textSize(14);
                    text("OPEN MOUTH", panel.x + panel.w/2, panel.y + 20);
                    pop();
                }
            }
        }
    }

    // This function displays the raw status information text, useful for debugging and user feedback.
    displayStatus() {
        push();
        fill(255);
        noStroke();
        textAlign(LEFT, TOP);
        textSize(10);
        const statusX = this.liveFeedPanel.x;
        const statusY = this.liveFeedPanel.y + this.liveFeedPanel.h + 40;

        // I display the overall calibration status, with the text colour changing based on completion.
        const calibStatus = this.calibrationMode == "complete" ? "Calibration Complete" : "Calibration Required (" + this.calibrationMode + ")";
        fill(this.calibrationMode == "complete" ? color(0, 255, 0) : color(255, 255, 0));
        text("Status: " + calibStatus, statusX, statusY);

        // I also show the current mouth state and gaze coordinates.
        fill(255);
        const mouthText = this.mouthDetector.getIsMouthOpen() ? "OPEN" : "CLOSED";
        text("Mouth " + ": " + mouthText + " (Intensity: " + nf(this.mouthDetector.getIntensity(), 0, 2) + ")", statusX, statusY + 15);
        const gazePos = this.gazeTracker.getGazePosition();
        text("Gaze " + ": X=" + nf(gazePos.x, 0, 2) + " Y=" + nf(gazePos.y, 0, 2), statusX, statusY + 30);

        // This block draws a small visual indicator box for the gaze position.
        if (this.calibrationMode == "complete") {
            push();
            stroke(100); noFill();
            rect(statusX, statusY + 50, 100, 60);
            fill(0, 255, 0); noStroke();
            const indicatorX = statusX + gazePos.x * 100;
            const indicatorY = statusY + 50 + gazePos.y * 60;
            ellipse(indicatorX, indicatorY, 6, 6);
            stroke(255, 100, 100, 100); strokeWeight(1);
            line(statusX + 50, statusY + 50, statusX + 50, statusY + 110);
            line(statusX, statusY + 80, statusX + 100, statusY + 80);
            pop();
        }
        pop();
    }

    // This function displays the user-facing instructions and controls in a box.
    displayInstructions() {
        push();
        fill(255, 255, 255, 200);
        noStroke();
        rectMode(CORNER); 

        const boxWidth = 350; 
        const lineHeight = 15; 
        const padding = 10;
        const boxMarginTop = 20;

        // The instruction box is positioned just below the sketchpad.
        const boxX = this.sketchPad.x;
        const boxY = this.sketchPad.y + 30 + this.sketchPad.h + boxMarginTop;

        // The instructions displayed are contextual; they change depending on whether calibration is complete or not.
        let instructionLines;
        if (this.calibrationMode == "complete") {
            instructionLines = 9;
        } else {
            instructionLines = 6;
        }

        const boxHeight = instructionLines * lineHeight + 2 * padding;
        rect(boxX, boxY, boxWidth, boxHeight, 5); 

        fill(0);
        textAlign(LEFT, TOP);
        textSize(11);
        const textStartX = boxX + padding;
        let currentTextY = boxY + padding;

        if (this.calibrationMode == "complete") {
            text("GAZE DRAWING CONTROLS:", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Look around to move cursor", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• OPEN Mouth to start drawing", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• CLOSE Mouth to stop drawing", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Press 'X' to clear canvas", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Press 'H' to hide/show this helper", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Press '+/-' to adjust sensitivity", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Press 'R' to restart calibration", textStartX, currentTextY);
            currentTextY += lineHeight;
            fill(2, 125, 0);
            text("System calibrated and ready!", textStartX, currentTextY);
        } else {
            text("CALIBRATION INSTRUCTIONS:", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Press 'C' to start/continue calibration", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Follow on-screen prompts", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Keep your head still during calibration", textStartX, currentTextY);
            currentTextY += lineHeight;
            text("• Press 'H' to hide/show this help", textStartX, currentTextY);
            currentTextY += lineHeight;
            fill(255, 30, 0)
            text("Complete calibration to start drawing", textStartX, currentTextY);
        }
        pop();
    }
    
    // I've centralized all keyboard event handling in this function.
    handleKeyPress(key) {
        // 'C' or 'c': Handles starting and progressing through the calibration steps.
        if (key == 67 || key == 99) { 
            if (this.calibrationMode == "pending") {
                this.calibrationMode = "gaze";
            } else if (this.calibrationMode == "gaze") {
                if (this.gazeTracker.calibrate()) {
                    this.calibrationMode = "mouth";
                }
            }
        // 'M' or 'm': Calibrates the closed-mouth state.
        } else if (key == 77 || key == 109) {
            if (this.calibrationMode == "mouth") {
                if (this.mouthDetector.calibrate()) {
                    this.calibrationMode = "complete";
                }
            }
        // 'X' or 'x': Clears the drawing canvas.
        } else if (key == 88 || key == 120) {
            if (this.calibrationMode == "complete") {
                this.drawingController.clear();
            }
        // 'H' or 'h': Toggles the visibility of the instruction panel.
        } else if (key == 72 || key == 104) {
            this.showInstructions = !this.showInstructions;
        // 'R' or 'r': Resets the entire calibration process.
        } else if (key == 82 || key == 114) {
            this.calibrationMode = "pending";
            this.gazeTracker.isCalibrated = false;
            this.mouthDetector.isCalibrated = false;
            this.drawingController.clear();
        // '+': Increases the sensitivity of the gaze tracking.
        } else if (key == 187 || key == 107) {
            if (this.calibrationMode == "complete") {
                const currentSensitivity = this.gazeTracker.sensitivity;
                this.gazeTracker.setSensitivity(
                    Math.min(currentSensitivity.x + 1, 25),
                    Math.min(currentSensitivity.y + 1, 30)
                );
            }
        // '-': Decreases the sensitivity of the gaze tracking.
        } else if (key == 189 || key == 109) {
            if (this.calibrationMode == "complete") {
                const currentSensitivity = this.gazeTracker.sensitivity;
                this.gazeTracker.setSensitivity(
                    Math.max(currentSensitivity.x - 1, 1),
                    Math.max(currentSensitivity.y - 1, 1)
                );
            }
        }
    }
}