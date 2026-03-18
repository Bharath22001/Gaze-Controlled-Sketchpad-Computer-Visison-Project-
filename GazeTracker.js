// I created this class to handle the calculation and smoothing of the user's eye gaze position.
// It uses facial landmarks, specifically the irises and eye corners, to determine where on the screen the user is looking.
class GazeTracker {
    // This constructor initialises the default values and properties for the gaze tracker.
    constructor() {
        this.leftEyeGaze = {x: 0.5, y: 0.5};
        this.rightEyeGaze = {x: 0.5, y: 0.5};
        this.combinedGaze = {x: 0.5, y: 0.5};
        this.smoothedGaze = {x: 0.5, y: 0.5};
        // I set a smoothing factor to reduce jitter in the final output, making the cursor movement smoother.
        this.smoothingFactor = 0.15;
        
        // These properties are related to the calibration process.
        this.calibrationData = null;
        this.isCalibrated = false;

        // I've added a sensitivity property to control how much iris movement translates into cursor movement.
        this.sensitivity = {x: 15, y: 22};
        // This 'dead zone' helps prevent minor, unintentional drifts when the user is trying to look straight ahead.
        this.deadZone = 0.02; 
    }
    
    // This is the main update loop for the tracker. It takes the latest facial keypoints and calculates the gaze position from them.
    update(keypoints) {
        // I first check to ensure I have enough keypoints to track the irises.
        if (!keypoints || keypoints.length < 478) {
            return;
        }
        
        // Here, I extract the specific landmark points for the iris centres and the corners of the eyes.
        const leftIrisCenter = keypoints[468];
        const rightIrisCenter = keypoints[473];
        const leftEyeInner = keypoints[133];
        const leftEyeOuter = keypoints[33];
        const rightEyeInner = keypoints[362];
        const rightEyeOuter = keypoints[263];
        
        // Another check to make sure all necessary keypoints were found.
        if (!leftIrisCenter || !rightIrisCenter || !leftEyeInner || !leftEyeOuter || !rightEyeInner || !rightEyeOuter) {
            return;
        }
        
        // I calculate the width of each eye to use as a normalisation factor.
        // This makes the tracking more consistent, regardless of the user's distance from the camera.
        const leftEyeWidth = dist(leftEyeInner.x, leftEyeInner.y, leftEyeOuter.x, leftEyeOuter.y);
        const rightEyeWidth = dist(rightEyeInner.x, rightEyeInner.y, rightEyeOuter.x, rightEyeOuter.y);
        
        // I find the centre point of each eye by averaging the inner and outer corner positions.
        const leftEyeCenter = {
            x: (leftEyeInner.x + leftEyeOuter.x) / 2,
            y: (leftEyeInner.y + leftEyeOuter.y) / 2
        };
        const rightEyeCenter = {
            x: (rightEyeInner.x + rightEyeOuter.x) / 2,
            y: (rightEyeInner.y + rightEyeOuter.y) / 2
        };
        
        // Here, I calculate the raw, normalised offset of the iris from the centre of the eye.
        const leftIrisOffset = {
            x: (leftIrisCenter.x - leftEyeCenter.x) / leftEyeWidth,
            y: (leftIrisCenter.y - leftEyeCenter.y) / leftEyeWidth
        };
        const rightIrisOffset = {
            x: (rightIrisCenter.x - rightEyeCenter.x) / rightEyeWidth,
            y: (rightIrisCenter.y - rightEyeCenter.y) / rightEyeWidth
        };
        
        // I average the offsets from both eyes to get a more stable and reliable result.
        let avgIrisOffset = {
            x: (leftIrisOffset.x + rightIrisOffset.x) / 2,
            y: (leftIrisOffset.y + rightIrisOffset.y) / 2
        };
        
        // If the system has been calibrated, I subtract the stored 'centre' offset from the current offset.
        if (this.isCalibrated && this.calibrationData) {
            avgIrisOffset.x -= this.calibrationData.offsetX;
            avgIrisOffset.y -= this.calibrationData.offsetY;
        }
        
        // I apply the dead zone here to eliminate small, noisy movements around the centre.
        if (Math.abs(avgIrisOffset.x) < this.deadZone) avgIrisOffset.x = 0;
        if (Math.abs(avgIrisOffset.y) < this.deadZone) avgIrisOffset.y = 0;
        
        // This is where I apply the sensitivity factor and convert the offset into a screen position (from 0.0 to 1.0).
        const rawGazeX = 0.5 - (avgIrisOffset.x * this.sensitivity.x);
        const rawGazeY = 0.5 + (avgIrisOffset.y * this.sensitivity.y);
        
        // I apply exponential smoothing to the raw gaze position. This makes the cursor movement feel less erratic.
        this.smoothedGaze.x = this.smoothingFactor * rawGazeX + (1 - this.smoothingFactor) * this.smoothedGaze.x;
        this.smoothedGaze.y = this.smoothingFactor * rawGazeY + (1 - this.smoothingFactor) * this.smoothedGaze.y;
        
        // Finally, I use constrain() to ensure the final gaze coordinates stay within the valid 0-to-1 range.
        this.smoothedGaze.x = constrain(this.smoothedGaze.x, 0, 1);
        this.smoothedGaze.y = constrain(this.smoothedGaze.y, 0, 1);
        
        // I store the result for potential debugging purposes.
        this.combinedGaze = {...this.smoothedGaze};
    }

    // I implemented this function to set the 'centre' or reference point for the gaze.
    // It's called when the user looks at the calibration target and presses a key.
    calibrate() {
        if (!this.gazeController || !this.gazeController.liveDetections || 
            this.gazeController.liveDetections.length === 0) {
            console.log("No face detected for gaze calibration");
            return false;
        }
        
        const keypoints = this.gazeController.liveDetections[0].keypoints;
        if (!keypoints || keypoints.length < 478) {
            console.log("Insufficient keypoints for gaze calibration");
            return false;
        }
        
        // I fetch the current positions of the iris and eye landmarks.
        const leftIrisCenter = keypoints[468];
        const rightIrisCenter = keypoints[473];
        const leftEyeInner = keypoints[133];
        const leftEyeOuter = keypoints[33];
        const rightEyeInner = keypoints[362];
        const rightEyeOuter = keypoints[263];
        
        if (!leftIrisCenter || !rightIrisCenter || 
            !leftEyeInner || !leftEyeOuter || 
            !rightEyeInner || !rightEyeOuter) {
            return false;
        }
        
        // The core of calibration is to calculate the current iris offsets while the user is looking at the centre.
        const leftEyeWidth = dist(leftEyeInner.x, leftEyeInner.y, leftEyeOuter.x, leftEyeOuter.y);
        const rightEyeWidth = dist(rightEyeInner.x, rightEyeInner.y, rightEyeOuter.x, rightEyeOuter.y);
        const leftEyeCenter = {
            x: (leftEyeInner.x + leftEyeOuter.x) / 2,
            y: (leftEyeInner.y + leftEyeOuter.y) / 2
        };
        const rightEyeCenter = {
            x: (rightEyeInner.x + rightEyeOuter.x) / 2,
            y: (rightEyeInner.y + rightEyeOuter.y) / 2
        };
        const leftIrisOffset = {
            x: (leftIrisCenter.x - leftEyeCenter.x) / leftEyeWidth,
            y: (leftIrisCenter.y - leftEyeCenter.y) / leftEyeWidth
        };
        const rightIrisOffset = {
            x: (rightIrisCenter.x - rightEyeCenter.x) / rightEyeWidth,
            y: (rightIrisCenter.y - rightEyeOuter.y) / rightEyeWidth
        };
        
        // I store these offsets in 'calibrationData'. From now on, this specific iris position will be treated as the centre.
        this.calibrationData = {
            offsetX: (leftIrisOffset.x + rightIrisOffset.x) / 2,
            offsetY: (leftIrisOffset.y + rightIrisOffset.y) / 2
        };
        
        this.isCalibrated = true;
        
        // I also reset the smoothed gaze position back to the centre to prevent it from jumping after calibration.
        this.smoothedGaze = {x: 0.5, y: 0.5};
        return true;
    }

    // This is a helper function to link this tracker back to the main controller class.
    setGazeController(controller) {
        this.gazeController = controller;
    }

    // This getter function provides the final, smoothed gaze position to other parts of the application.
    getGazePosition() {
        return {...this.smoothedGaze};
    }

    // I created this setter so that the sensitivity can be adjusted externally, for example, with keyboard controls.
    setSensitivity(x, y) {
        this.sensitivity.x = x;
        this.sensitivity.y = y;
    }

    // This function simply checks if the calibration process has been successfully completed.
    isReady() {
        return this.isCalibrated;
    }
}