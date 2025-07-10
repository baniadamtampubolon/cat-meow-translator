
// Variables untuk recorder.js
let recorder;
let currentStream = null;
let recordingStartTime = null;
let timerInterval = null;

const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const statusText = document.getElementById("status");
const timerDisplay = document.getElementById("timer");
const recordingTimer = document.getElementById("recordingTimer");
const browserWarning = document.getElementById("browser-warning");

// Function untuk format timer
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Function untuk start timer
function startTimer() {
    recordingStartTime = Date.now();
    recordingTimer.style.display = 'block';
    
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        timerDisplay.textContent = formatTime(elapsed);
        
        // Auto-stop setelah 15 detik
        if (elapsed >= 15) {
            stopRecording();
        }
    }, 1000);
}

// Function untuk stop timer
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    recordingTimer.style.display = 'none';
    timerDisplay.textContent = '00:00';
}

// Function untuk stop semua media tracks
function stopAllTracks() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            console.log(`Stopping track: ${track.kind}, state: ${track.readyState}`);
            track.stop();
        });
        currentStream = null;
    }
}

// Function untuk reset UI
function resetUI() {
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.className = '';
    stopTimer();
}

// Function untuk set status dengan styling
function setStatus(message, type = '') {
    statusText.textContent = message;
    statusText.className = type ? `status-${type}` : '';
}

// Function untuk validasi browser support
function checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        browserWarning.style.display = 'block';
        return false;
    }
    if (!window.AudioContext && !window.webkitAudioContext) {
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
            recordBtn.disabled = true;
            stopBtn.disabled = false;
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
    if (!recorder) return;
    
    try {
        setStatus('⏹️ Menghentikan rekaman...', 'processing');
        stopBtn.disabled = true;
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
        
        // Display result
        renderPredictionResult(result);
        
    } catch (error) {
        console.error("Error in AJAX prediction:", error);
        setStatus(`❌ Error: ${error.message}`, 'error');
        resetUI();
    }
}

// Function untuk display result
function renderPredictionResult(result) {
    const resultDiv = document.getElementById('result-container');
    if (!resultDiv) return;

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

    const emoji = emojiMap[result.result?.toLowerCase()] || '🐱';

    resultDiv.innerHTML = `
        <h2>${emoji} Hasil: ${result.result}</h2>
        <p><strong>AI Kucing bilang:</strong> ${result.ai_phrase}</p>
        <p><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(2)}%</p>
        <p><small>Waktu: ${result.timestamp}</small></p>
    `;
}


// Event listeners
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// Cleanup saat halaman di-unload
window.addEventListener('beforeunload', () => {
    console.log("Page unloading, cleaning up...");
    stopAllTracks();
    stopTimer();
});

// Handle visibility change untuk cleanup
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log("Page hidden, cleaning up...");
        stopAllTracks();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        if (!recordBtn.disabled) {
            startRecording();
        } else if (!stopBtn.disabled) {
            stopRecording();
        }
    }
});

document.querySelector('form').addEventListener('submit', async function(e) {
    e.preventDefault(); // prevent form reload
    const fileInput = this.querySelector('input[type="file"]');
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("audio_file", file);

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        renderPredictionResult(result);
    } catch (err) {
        console.error('Upload prediction failed:', err);
    }
});


// Debug: Log saat script dimuat
console.log("Cat Meow Translator with recorder.js loaded at:", new Date().toISOString());
console.log("Recorder.js available:", typeof Recorder !== 'undefined');
console.log("AudioContext supported:", !!(window.AudioContext || window.webkitAudioContext));
