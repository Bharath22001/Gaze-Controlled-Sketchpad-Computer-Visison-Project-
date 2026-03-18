//Represents individual display panels in the application grid. It handles image display and panel rendering
class ImagePanel {
    constructor(x, y, w, h, title) {
    this.x = x;       // x position of the panel
    this.y = y;       // y position of the panel
    this.w = w;       // width of the panel
    this.h = h;       // height of the panel
    this.title = title; // title of the panel
    this.img = null;  // image to be displayed in the panel
    }
    
    setImage(img) {
    this.img = img;
    }
    

    //Main display function for the panel which renders title, border, and image content
    display() {
        // Draw the title text
        fill(255);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(12);
        text(this.title, this.x, this.y, this.w, 30);
        
        // Draw panel's border
        stroke(100);
        noFill();
        rect(this.x, this.y + 30, this.w, this.h);
        
        // Draw image if assigned
        if (this.img) {
            image(this.img, this.x, this.y + 30, this.w, this.h);
        }
    }
}