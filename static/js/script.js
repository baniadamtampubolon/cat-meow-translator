// Variables
let recorder;
let currentStream = null;
let recordingStartTime = null;
let timerInterval = null;
let isRecording = false;
let currentResult = null;

// DOM Elements
const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");
const timerDisplay = document.getElementById("timer");
const recordingTimer = document.getElementById("recordingTimer");
const browserWarning = document.getElementById("browser-warning");
const dialogBox = document.getElementById("dialogBox");
const dialogText = document.getElementById("dialogText");
const showDetails = document.getElementById("showDetails");
const resultDetails = document.getElementById("resultDetails");
const devToggle = document.getElementById("devToggle");
const devSection = document.getElementById("devSection");
const uploadForm = document.getElementById("uploadForm");

// Emoji mapping for cat emotions
const emojiMap = {
    'angry': '😾',
    'brushing': '🧹',
    'defense': '🛡️',
    'fighting': '🥊',
    'happy': '😺',
    'huntingmind': '🐾',
    'isolation': '😿',
    'mating': '💞',
    'mothercall': '👶',
    'paining': '💢',
    'resting': '🛏️',
    'waiting_food': '🍽️',
    'warning': '⚠️'
};

// Timer functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startTimer() {
    recordingStartTime = Date.now();
    recordingTimer.style.display = 'block';
    
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        timerDisplay.textContent = formatTime(elapsed);
        
        if (elapsed >= 15) {
            stopRecording();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    recordingTimer.style.display = 'none';
    timerDisplay.textContent = '00:00';
}

// Audio functions
function stopAllTracks() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
        currentStream = null;
    }
}

function setStatus(message, type = '') {
    statusText.innerHTML = message;
    statusText.className = type ? `status-${type}` : '';
}

function checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        browserWarning.style.display = 'block';
        return false;
    }
    return true;
}

// Function untuk start recording menggunakan recorder.js
function startRecording() {
    if (isRecording) return; // prevent duplicate start
    if (!checkBrowserSupport()) {
        setStatus('<br>❌ Your browser does not support audio recording', 'error');
        return;
    }

    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    }).then(stream => {
        stopAllTracks(); // clear previous if any
        currentStream = stream;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const input = audioContext.createMediaStreamSource(stream);

        recorder = new Recorder(input, {
            numChannels: 1,
            sampleRate: 44100
        });

        recorder.record();
        isRecording = true;

        recordBtn.classList.add('recording');
        recordBtn.innerHTML = '🔴<br>RECORDING<br>RELEASE';
        setStatus('<br>⏺️ Recording... (Max 15 seconds)<br>', 'recording');
        startTimer();

        console.log("Recording started.");
    }).catch(error => {
        console.error("Mic error:", error);
        setStatus('<br>❌ Cant access microphone', 'error');
        resetUI();
    });
}

function stopRecording() {
    if (!isRecording || !recorder) return;
    isRecording = false;

    setStatus('<br>⏹️ Menghentikan rekaman...', 'processing');
    stopTimer();

    recorder.stop();

    recorder.exportWAV(blob => {
        stopAllTracks();
        recorder.clear();

        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<br>HOLD TO<br>RECORD';

        if (blob.size === 0 || blob.size < 1000) {
            setStatus('<br>❌ Record failed is too short', 'error');
            return;
        }

        predictWithAjax(blob);
    });
}

function resetUI() {
    stopAllTracks();
    if (recorder) recorder.clear();
    isRecording = false;
    stopTimer();
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '<br>HOLD TO<br>RECORD';
}

// AJAX prediction function
async function predictWithAjax(audioBlob) {
    try {
        setStatus('<br>🔄 Analyzing Meow Please Wait...<br>', 'processing');
        
        const formData = new FormData();
        const timestamp = Date.now();
        const filename = `recorded_meow_${timestamp}.wav`;
        formData.append("audio_file", audioBlob, filename);
        
        console.log("Sending WAV audio to server...");
        
        const response = await fetch("/predict", {
            method: "POST",
            body: formData,
            headers: {
                'Cache-Control': 'no-cache',
                'X-Timestamp': timestamp.toString()
            }
        });
        
        const responseText = await response.text();
        console.log("Server response:", responseText);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = responseText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const result = JSON.parse(responseText);
        console.log("Prediction result:", result);
        
        // Display result using renderPredictionResult (for compatibility)
        renderPredictionResult(result);
        
    } catch (error) {
        console.error("Error in AJAX prediction:", error);
        setStatus(`<br>❌ Error: ${error.message}`, 'error');
        resetUI();
    }
}

// Function untuk display result
function renderPredictionResult(result) {
    // Use the new displayResult function instead
    displayResult(result);
}

// Display result in dialog box
function displayResult(result) {
    currentResult = result;
    const emoji = emojiMap[result.result?.toLowerCase()] || '🐱';
    
    // Update cat avatar
    const catAvatar = dialogBox.querySelector('.cat-avatar');
    catAvatar.textContent = emoji;
    
    // Show dialog with typing animation
    dialogBox.style.display = 'block';
    dialogText.innerHTML = '';
    
    // Type out the AI phrase
    const phrase = result.ai_phrase;
    let i = 0;
    const typeInterval = setInterval(() => {
        if (i < phrase.length) {
            dialogText.innerHTML += phrase.charAt(i);
            i++;
        } else {
            clearInterval(typeInterval);
            showDetails.style.display = 'inline-block';
        }
    }, 50);
    
    // Prepare details
    resultDetails.innerHTML = `
        <strong>Emotion:</strong> ${result.result}<br>
        <strong>Confidence:</strong> ${(result.confidence * 100).toFixed(2)}%<br>
        <strong>Timestamp:</strong> ${result.timestamp}
    `;

    setStatus('<br>✅ Analysis Complete!', 'success');
    resetUI();
}

// Mouse Events
recordBtn.addEventListener('mousedown', startRecording);
recordBtn.addEventListener('mouseup', stopRecording);
recordBtn.addEventListener('mouseleave', () => {
    if (isRecording) stopRecording();
});

// Touch Events (untuk mobile)
recordBtn.addEventListener('touchstart', e => {
    e.preventDefault(); // prevent double triggering
    startRecording();
});
recordBtn.addEventListener('touchend', e => {
    e.preventDefault();
    if (isRecording) stopRecording();
});


// Show/hide details
showDetails.addEventListener('click', () => {
    if (resultDetails.style.display === 'none' || !resultDetails.style.display) {
        resultDetails.style.display = 'block';
        showDetails.textContent = 'Hide Details';
    } else {
        resultDetails.style.display = 'none';
        showDetails.textContent = 'Show Details';
    }
});

// Developer mode toggle
devToggle.addEventListener('click', () => {
    devSection.classList.toggle('active');
    devToggle.textContent = devSection.classList.contains('active') ? 'HIDE DEV' : 'DEV MODE';
});

// Upload form handling
uploadForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const fileInput = this.querySelector('input[type="file"]');
    const file = fileInput.files[0];
    if (!file) return;

    setStatus('<br>🔄 Menganalisis file audio...', 'processing');
    
    // Use the same predictWithAjax function for uploaded files
    predictWithAjax(file);
});

// Cleanup
window.addEventListener('beforeunload', () => {
    stopAllTracks();
    stopTimer();
});

// Add script for recorder.js
const script = document.createElement('script');
// script.src = 'https://cdnjs.cloudflare.com/ajax/libs/recorder.js/0.1.0/recorder.min.js';
script.onload = function() {
    console.log('recorder.js loaded');
};
script.onerror = function() {
    console.error('Failed to load recorder.js');
    browserWarning.style.display = 'block';
    browserWarning.innerHTML = '⚠️ Failed to load recorder.js, make sure your internet connection is stable.';
};
document.head.appendChild(script);

// Initialize
console.log("Cat Meow Translator loaded!");
