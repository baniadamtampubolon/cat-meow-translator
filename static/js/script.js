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
    statusText.textContent = message;
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
    if (!checkBrowserSupport()) {
        setStatus('❌ Browser tidak mendukung perekaman audio', 'error');
        return;
    }

    navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1
        }
    }).then(stream => {
        try {
            // Stop any existing streams
            stopAllTracks();
            currentStream = stream;
            
            // Create AudioContext
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const input = audioContext.createMediaStreamSource(stream);
            
            // Create Recorder instance
            recorder = new Recorder(input, { 
                numChannels: 1,
                sampleRate: 44100
            });
            
            // Start recording
            recorder.record();
            
            // Update UI
            isRecording = true;
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '🔴<br>RECORDING<br>RELEASE';
            setStatus('⏺️ Merekam... (maksimal 15 detik)', 'recording');
            
            // Start timer
            startTimer();
            
            console.log('Recording started with recorder.js');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            setStatus(`❌ Error: ${error.message}`, 'error');
            stopAllTracks();
            resetUI();
        }
    }).catch(error => {
        console.error('Error accessing microphone:', error);
        setStatus('❌ Error mengakses mikrofon. Pastikan izin diberikan.', 'error');
        resetUI();
    });
}

// Function untuk stop recording
function stopRecording() {
    if (!recorder || !isRecording) return;
    
    try {
        setStatus('⏹️ Menghentikan rekaman...', 'processing');
        isRecording = false;
        stopTimer();
        
        // Stop recording
        recorder.stop();
        
        // Export WAV and process
        recorder.exportWAV(blob => {
            console.log(`WAV blob size: ${blob.size} bytes`);
            
            // Stop all tracks
            stopAllTracks();
            
            // Clear recorder
            recorder.clear();
            
            // Validate blob
            if (blob.size === 0) {
                setStatus('❌ Rekaman kosong', 'error');
                resetUI();
                return;
            }
            
            if (blob.size < 1000) {
                setStatus('❌ Rekaman terlalu pendek', 'error');
                resetUI();
                return;
            }
            
            // Send to server
            predictWithAjax(blob);
        });
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        setStatus(`❌ Error stopping: ${error.message}`, 'error');
        stopAllTracks();
        resetUI();
    }
}

function resetUI() {
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '🎤<br>HOLD TO<br>RECORD';
    isRecording = false;
    stopTimer();
}

// AJAX prediction function
async function predictWithAjax(audioBlob) {
    try {
        setStatus('🔄 Menganalisis meow...', 'processing');
        
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
        setStatus(`❌ Error: ${error.message}`, 'error');
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
    
    setStatus('✅ Analisis selesai!', 'success');
    resetUI();
}

// Event Listeners
recordBtn.addEventListener('mousedown', startRecording);
recordBtn.addEventListener('mouseup', stopRecording);
recordBtn.addEventListener('mouseleave', stopRecording);

// Touch events for mobile
recordBtn.addEventListener('touchstart', startRecording);
recordBtn.addEventListener('touchend', stopRecording);

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

    setStatus('🔄 Menganalisis file audio...', 'processing');
    
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
    browserWarning.innerHTML = '⚠️ Gagal memuat recorder.js. Pastikan koneksi internet stabil.';
};
document.head.appendChild(script);

// Initialize
console.log("Cat Meow Translator loaded!");
