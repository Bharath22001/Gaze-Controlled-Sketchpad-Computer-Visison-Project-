// I created this class to manage all the drawing operations on the sketchpad.
// It coordinates between the gaze position and the drawing actions.
class DrawingController {
    // This constructor initializes the drawing controller with its default settings.
    constructor(sketchPad) {
        this.sketchPad = sketchPad;
        this.isDrawing = false;
        this.lastDrawPos = null;
        this.strokeWeight = 3;
        this.strokeColor = 0; // black
        // I use this history array to smooth out the jitter from the gaze tracking data.
        this.drawingHistory = [];
        this.maxHistorySize = 5;
    }
    
    // This update function is the core logic loop, which is called on every frame.
    // It takes the current gaze position and smile state to decide what to do.
    update(gazePos, isSmiling) {
        // Here, I convert the normalized gaze position (from 0.0 to 1.0) into actual pixel coordinates for the sketchpad.
        const drawX = gazePos.x * this.sketchPad.w;
        const drawY = gazePos.y * this.sketchPad.h;
        
        // This block adds the latest position to the history and removes the oldest if the array is full.
        this.drawingHistory.push({ x: drawX, y: drawY });
        if (this.drawingHistory.length > this.maxHistorySize) {
            this.drawingHistory.shift();
        }
        
        // To smooth the cursor, I calculate the average of all positions currently in the history.
        let smoothedX = 0, smoothedY = 0;
        for (let point of this.drawingHistory) {
            smoothedX += point.x;
            smoothedY += point.y;
        }
        smoothedX /= this.drawingHistory.length;
        smoothedY /= this.drawingHistory.length;
        
        // This block handles the logic for starting or stopping a drawing stroke.
        if (isSmiling && !this.isDrawing) {
            // If the user starts smiling, the controller begins drawing from the current position.
            this.isDrawing = true;
            this.lastDrawPos = { x: smoothedX, y: smoothedY };
        } else if (!isSmiling && this.isDrawing) {
            // If the user stops smiling, the controller stops drawing.
            this.isDrawing = false;
            this.lastDrawPos = null;
        }
        
        // If the controller is currently in drawing mode, it draws a line from the last point to the new one.
        if (this.isDrawing && this.lastDrawPos) {
            this.drawLine(this.lastDrawPos.x, this.lastDrawPos.y, smoothedX, smoothedY);
            this.lastDrawPos = { x: smoothedX, y: smoothedY };
        }
        
        // Finally, I call the function to draw the cursor, showing where the user is looking.
        this.drawCursor(smoothedX, smoothedY, isSmiling);
    }
    
    // This is a simple helper function I wrote to draw a line segment on the sketchpad's buffer.
    drawLine(x1, y1, x2, y2) {
        this.sketchPad.drawingBuffer.stroke(this.strokeColor);
        this.sketchPad.drawingBuffer.strokeWeight(this.strokeWeight);
        this.sketchPad.drawingBuffer.line(x1, y1, x2, y2);
    }
    
    // This function draws the visual indicator for the cursor on the screen.
    drawCursor(x, y, active) {
        push();
        translate(this.sketchPad.x, this.sketchPad.y + 30);
        
        noFill();
        // I made the cursor's colour change to green if drawing is active (smiling), and red otherwise.
        if (active) {
            stroke(0, 255, 0); 
            strokeWeight(2);
        } else {
            stroke(255, 0, 0); 
            strokeWeight(1);
        }
        
        // This part draws the actual shape of the cursor, which is a circle with a crosshair.
        ellipse(x, y, 15, 15);
        line(x - 10, y, x + 10, y);
        line(x, y - 10, x, y + 10);
        
        pop();
    }
    
    // This function clears the canvas and resets the entire drawing state back to the beginning.
    clear() {
        this.sketchPad.clear();
        this.drawingHistory = [];
        this.lastDrawPos = null;
        this.isDrawing = false;
    }
}