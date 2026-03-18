// I created this class to detect when the user's mouth is open, which I use to trigger the drawing action.
class mouthOpenDetector {
    // This constructor initialises all the properties needed for the detection logic.
    constructor() {
        this.isMouthOpen = false;
        this.aperture = 0;
        this.smoothedAperture = 0;
        this.smoothingFactor = 0.3;

        // These properties are for storing the calibration data.
        this.neutralAperture = null;
        this.isCalibrated = false;

        // This determines how much larger the mouth opening must be compared to its neutral state to be considered "open".
        this.openThresholdMultiplier = 1.6;

        // I implemented this temporal stability mechanism to prevent the drawing state from flickering.
        // It requires the "open" or "closed" state to be consistent over several frames before changing.
        this.recentStates = [];
        this.maxHistorySize = 5;
        this.requiredConsistency = 3; // For example, 3 out of the last 5 frames must agree.
    }

    // This function is called on every frame to update the mouth's state based on the latest facial landmarks.
    update(keypoints) {
        if (!keypoints || keypoints.length < 468) return;

        // To make the detection more robust, I chose to measure the vertical distance between several pairs of landmarks on the lips.
        const measurementPairs = [
            [13, 14],   // Centre of upper lip to centre of lower lip
            [12, 15],   // Very top to very bottom (outer lips)
            [267, 271], // Left side vertical
            [37, 84]    // Right side vertical
        ];

        // This loop calculates the average vertical opening, or "aperture", from the measurement pairs.
        let totalAperture = 0;
        let validMeasurements = 0;
        for (const [topIdx, bottomIdx] of measurementPairs) {
            const topPoint = keypoints[topIdx];
            const bottomPoint = keypoints[bottomIdx];
            if (topPoint && bottomPoint) {
                totalAperture += Math.abs(bottomPoint.y - topPoint.y);
                validMeasurements++;
            }
        }

        // If not enough landmarks are detected, the function exits to avoid incorrect calculations.
        if (validMeasurements < 2) {
            return
        }

        // The current aperture is the average of the valid measurements.
        const currentAperture = totalAperture / validMeasurements;

        // I apply smoothing here to reduce jitter from minor, frame-to-frame detection inconsistencies.
        this.smoothedAperture = this.smoothingFactor * currentAperture + (1 - this.smoothingFactor) * this.smoothedAperture;
        this.aperture = this.smoothedAperture;

        // The detection logic only runs if the system has been calibrated.
        if (!this.isCalibrated || !this.neutralAperture) {
            this.isMouthOpen = false;
            return;
        }

        // Here, I calculate how large the current opening is relative to the calibrated neutral (closed) position.
        const apertureRatio = this.aperture / this.neutralAperture;

        // This line determines the raw "open" state for the current frame.
        const currentlyOpen = apertureRatio > this.openThresholdMultiplier;

        // This block implements the temporal stability logic.
        // It adds the current state to a short history...
        this.recentStates.push(currentlyOpen);
        if (this.recentStates.length > this.maxHistorySize) {
            this.recentStates.shift();
        }

        // ...then counts how many of the recent frames were in the "open" state.
        const openCount = this.recentStates.filter(state => state).length;

        // The final `isMouthOpen` state is only changed if the count meets the consistency requirement.
        // This prevents a single anomalous frame from flickering the drawing on or off.
        if (openCount >= this.requiredConsistency) {
            this.isMouthOpen = true;
        } else if (openCount <= (this.maxHistorySize - this.requiredConsistency)) {
            this.isMouthOpen = false;
        }
    }

    // I created this function to capture the user's neutral (closed) mouth position as a baseline.
    calibrate() {
        // First, it checks to ensure that valid face detection data is available.
        if (!this.gazeController || !this.gazeController.liveDetections || this.gazeController.liveDetections.length == 0) {
            return false;
        }
        
        const keypoints = this.gazeController.liveDetections[0].keypoints;
        if (!keypoints || keypoints.length < 468) {
            return false;
        }
        
        // It then measures the current mouth aperture using the same logic as the update function.
        // This measurement is assumed to be the "closed mouth" state.
        const measurementPairs = [[13, 14], [12, 15], [267, 271], [37, 84]];
        let totalAperture = 0;
        let validMeasurements = 0;
        for (const [topIdx, bottomIdx] of measurementPairs) {
            const topPoint = keypoints[topIdx];
            const bottomPoint = keypoints[bottomIdx];
            if (topPoint && bottomPoint) {
                totalAperture += Math.abs(bottomPoint.y - topPoint.y);
                validMeasurements++;
            }
        }
        
        if (validMeasurements < 2) {
            return false;
        }
        
        // This baseline measurement is stored as the 'neutralAperture'.
        this.neutralAperture = totalAperture / validMeasurements;
        this.smoothedAperture = this.neutralAperture;
        
        // Finally, it resets the state to calibrated and closed.
        this.isCalibrated = true;
        this.recentStates = [];
        this.isMouthOpen = false;
        
        return true;
    }
    
    // This is a helper function to link this detector back to the main controller class.
    setGazeController(controller) {
        this.gazeController = controller;
    }
    
    // This is a simple getter function to provide the final boolean state to other parts of the application.
    getIsMouthOpen() {
        return this.isMouthOpen;
    }
    
    // I wrote this function to provide a normalised value (from 0 to 1) that is useful for UI feedback.
    // It indicates how close the mouth is to crossing the "open" threshold.
    getIntensity() {
        if (!this.isCalibrated || !this.neutralAperture) return 0;
        return Math.min(1, (this.aperture / this.neutralAperture - 1) / (this.openThresholdMultiplier - 1));
    }
    
    // This function simply checks if the calibration process has been successfully completed.
    isReady() {
        return this.isCalibrated;
    }
    
    // I added this setter so the sensitivity could be adjusted externally if needed.
    setSensitivity(multiplier) {
        this.openThresholdMultiplier = multiplier;
    }
}