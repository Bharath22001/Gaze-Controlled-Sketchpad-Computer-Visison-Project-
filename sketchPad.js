// I created this class to manage the drawing canvas and its dedicated buffer.
class SketchPad {
    // The constructor initialises the sketchpad with its position, size, and title.
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.title = "Gaze-controlled sketchpad";
        
        // Here, I create a dedicated graphics buffer. This is like an 'off-screen' canvas
        // that I can draw on without affecting the main canvas until I'm ready to display it.
        this.drawingBuffer = createGraphics(this.w, this.h);
        this.drawingBuffer.background(255); // I start it with a white background.
    }
    
    // I implemented this simple function to clear the canvas.
    // It works by just drawing a white background over the entire drawing buffer.
    clear() {
        this.drawingBuffer.background(255);
    }
    
    // This function is called every frame to render the entire sketchpad component.
    display() {
        // First, it draws the title text for the panel.
        fill(255);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(12);
        text(this.title, this.x, this.y, this.w, 30);
        
        // Then, it draws the border for the panel.
        stroke(100);
        noFill();
        rect(this.x, this.y + 30, this.w, this.h);
        
        // Finally, it draws the contents of the off-screen buffer onto the main canvas.
        image(this.drawingBuffer, this.x, this.y + 30, this.w, this.h);
    }
}