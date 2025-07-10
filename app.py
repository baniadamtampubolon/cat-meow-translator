# File: app.py 
# This file is part of the Cat Meow Translator project.  
from flask import Flask, render_template, request, jsonify, send_from_directory
from tensorflow.keras.models import load_model
import google.generativeai as genai
from dotenv import load_dotenv
from datetime import datetime
import numpy as np
import traceback
import logging
import tempfile
import librosa
import time
import uuid
import wave
import os

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Disable caching untuk static files
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# ========= Konfigurasi Model =========
model_path = "model/cat_meow_classifier.h5"
label_map = {
    0: 'Angry',
    1: 'Brushing',
    2: 'Defense',
    3: 'Fighting',
    4: 'Happy',
    5: 'HuntingMind',
    6: 'Isolation',
    7: 'Mating',
    8: 'MotherCall',
    9: 'Paining',
    10: 'Resting',
    11: 'Waiting_food',
    12: 'Warning'
}

# Global variables
model = None
gemini_model = None

# Initialize Gemini (optional, with error handling)
def initialize_gemini():
    """Initialize Gemini AI with proper error handling"""
    global gemini_model
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            gemini_model = genai.GenerativeModel("gemini-2.5-flash")
            logger.info("Gemini AI initialized successfully")
        else:
            logger.warning("GEMINI_API_KEY not found in environment variables")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini: {e}")
        gemini_model = None

# Load model dengan error handling
def load_ml_model():
    """Load the ML model with comprehensive error handling"""
    global model
    try:
        if not os.path.exists(model_path):
            logger.error(f"Model file not found at: {model_path}")
            return False
            
        model = load_model(model_path)
        logger.info("Model berhasil dimuat")
        logger.info(f"Model input shape: {model.input_shape}")
        return True
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        logger.error(traceback.format_exc())
        model = None
        return False

# Initialize components
initialize_gemini()
model_loaded = load_ml_model()

@app.after_request
def after_request(response):
    """Disable caching untuk semua response"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files dengan no-cache headers"""
    try:
        return send_from_directory('static', filename)
    except Exception as e:
        logger.error(f"Error serving static file {filename}: {e}")
        return "File not found", 404

def validate_wav_file(file_path):
    """Validate WAV file format and structure"""
    try:
        with wave.open(file_path, 'rb') as wav_file:
            frames = wav_file.getnframes()
            sample_rate = wav_file.getframerate()
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            
            logger.info(f"WAV file info - Frames: {frames}, Sample Rate: {sample_rate}, Channels: {channels}, Sample Width: {sample_width}")
            
            # Basic validation
            if frames == 0:
                logger.error("WAV file has no audio frames")
                return False
            
            if sample_rate < 8000:  # Minimum reasonable sample rate
                logger.error(f"Sample rate too low: {sample_rate}")
                return False
            
            duration = frames / sample_rate
            logger.info(f"Audio duration: {duration:.2f} seconds")
            
            # Check if duration is reasonable (0.1s to 30s)
            if duration < 0.1 or duration > 30:
                logger.warning(f"Unusual audio duration: {duration:.2f}s")
            
            return True
            
    except Exception as e:
        logger.error(f"Error validating WAV file: {e}")
        return False

def extract_mfcc(file_path, n_mfcc=40, max_len=130):
    """Extract MFCC features dengan padding/truncation - optimized untuk CNN 2D dengan input shape (40, 130, 1)"""
    try:
        logger.info(f"Ekstraksi MFCC dari: {file_path}")
        
        # Cek apakah file ada dan tidak kosong
        if not os.path.exists(file_path):
            logger.error(f"File tidak ditemukan: {file_path}")
            return None
            
        file_size = os.path.getsize(file_path)
        if file_size == 0:
            logger.error(f"File kosong: {file_path}")
            return None
            
        logger.info(f"File size: {file_size} bytes")
        
        # Validate WAV file structure untuk file .wav
        if file_path.lower().endswith('.wav'):
            if not validate_wav_file(file_path):
                logger.error("Invalid WAV file structure")
                return None
        
        # Load audio dengan librosa - optimized untuk recorder.js output
        try:
            y, sr = librosa.load(file_path, sr=None, mono=True)
            logger.info(f"Audio loaded - duration: {len(y)/sr:.2f}s, sample rate: {sr}")
        except Exception as e:
            logger.error(f"Error loading audio with librosa: {e}")
            # Fallback: try loading with different parameters
            try:
                y, sr = librosa.load(file_path, sr=22050, mono=True)
                logger.info(f"Audio loaded with fallback - duration: {len(y)/sr:.2f}s, sample rate: {sr}")
            except Exception as e2:
                logger.error(f"Fallback audio loading failed: {e2}")
                return None
        
        # Check if audio is not empty
        if len(y) == 0:
            logger.error("Audio data kosong setelah loading")
            return None
        
        # Normalize audio to prevent clipping issues
        if np.max(np.abs(y)) > 0:
            y = y / np.max(np.abs(y))
        
        # Extract MFCC features dengan n_mfcc=40 untuk match model input
        try:
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, hop_length=512, n_fft=2048)
            logger.info(f"MFCC shape sebelum padding: {mfcc.shape}")
        except Exception as e:
            logger.error(f"Error extracting MFCC: {e}")
            return None
        
        # Padding atau truncation untuk konsistensi shape (40, 130)
        if mfcc.shape[1] < max_len:
            pad_width = max_len - mfcc.shape[1]
            mfcc = np.pad(mfcc, pad_width=((0, 0), (0, pad_width)), mode='constant')
            logger.info(f"Padded MFCC shape: {mfcc.shape}")
        else:
            mfcc = mfcc[:, :max_len]
            logger.info(f"Truncated MFCC shape: {mfcc.shape}")
        
        # Pastikan shape adalah (40, 130) untuk model CNN 2D
        logger.info(f"Final MFCC shape: {mfcc.shape}")
        
        return mfcc
        
    except Exception as e:
        logger.error(f"Error ekstraksi MFCC: {e}")
        logger.error(traceback.format_exc())
        return None

def safe_remove_file(filepath):
    """Safely remove file with error handling"""
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"File dihapus: {filepath}")
    except Exception as e:
        logger.error(f"Error menghapus file {filepath}: {e}")

def is_valid_audio_format(filename):
    """Check if file format is supported"""
    if not filename:
        return False
    
    supported_formats = ['.wav', '.mp3', '.webm']
    return any(filename.lower().endswith(fmt) for fmt in supported_formats)

def generate_cat_phrase(label):
    """Buat komentar AI dari hasil prediksi label"""
    if gemini_model is None:
        # Fallback phrases jika Gemini tidak tersedia
        fallback_phrases = {
            'Angry': "Grrr... aku kesal sekali! Meong!",
            'Brushing': "Ahh... sikatan ini enak sekali... meong~",
            'Defense': "Jangan dekati aku! Aku siap bertahan! Meong!",
            'Fighting': "Aku akan melawan! Meong meong!",
            'Happy': "Aku senang sekali! Meong meong~",
            'HuntingMind': "Aku sedang berburu... ssshhh... meong",
            'Isolation': "Aku ingin sendiri dulu... meong...",
            'Mating': "Meong meong~ ada yang menarik perhatianku",
            'MotherCall': "Anak-anakku... kemana kalian? Meong meong",
            'Paining': "Aduh... aku sakit... meong...",
            'Resting': "Zzz... aku mengantuk... meong...",
            'Waiting_food': "Aku lapar! Mana makananku? Meong meong!",
            'Warning': "Awas! Ada bahaya! Meong!"
        }
        return fallback_phrases.get(label, "Meong meong... aku bingung harus bilang apa")
    
    prompt = f"saya memiliki model pendeteksi bahasa kucing, dan dia menunjukan perasaan '{label}', anggaplah diri anda seekor kucing yang merasakan perasaan tersebut, apa kata yang anda katakan, gunakan bahasa inggris dan kata yang lucu (selayaknya kucing lucu) namun tetap buat kata-kata yang hidup, jangan gunakan kata-kata yang panjang cukup 3-4 kata saja, dan jangan gunakan tanda baca *, boleh guanakan emoji"

    try:
        response = gemini_model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.warning(f"[Gemini] Error: {e}")
        return "Aku... bingung harus bilang apa, meong?"

def process_audio_file(file):
    """Process uploaded audio file dan return prediction - optimized untuk CNN 2D"""
    if not file or not file.filename:
        return {"error": "No audio file provided"}
    
    # Check model availability
    if model is None:
        return {"error": "Model tidak tersedia. Pastikan file model ada di folder yang benar."}
    
    # Validate file format
    if not is_valid_audio_format(file.filename):
        return {"error": "Format file tidak didukung. Gunakan WAV, MP3, atau WebM"}
    
    # Generate unique filename untuk mencegah caching
    unique_id = str(uuid.uuid4())
    timestamp = str(int(time.time()))
    
    # Determine file extension
    original_filename = file.filename.lower()
    if original_filename.endswith(".wav"):
        suffix = ".wav"
    elif original_filename.endswith(".webm"):
        suffix = ".webm"
    elif original_filename.endswith(".mp3"):
        suffix = ".mp3"
    else:
        return {"error": "Format file tidak didukung"}
    
    # Create temporary file dengan nama unik
    temp = tempfile.NamedTemporaryFile(
        delete=False, 
        suffix=suffix,
        prefix=f"audio_{timestamp}_{unique_id[:8]}_"
    )
    temp_path = temp.name
    temp.close()
    
    try:
        # Save uploaded file
        file.seek(0)  # Reset file pointer ke awal
        
        # Read file content
        file_content = file.read()
        if len(file_content) == 0:
            return {"error": "File kosong"}
        
        # Write to temporary file
        with open(temp_path, 'wb') as f:
            f.write(file_content)
        
        # Verify file exists and has content
        if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            return {"error": "Gagal menyimpan file audio"}
            
        logger.info(f"File audio disimpan: {temp_path}, size: {os.path.getsize(temp_path)} bytes")
        
        # Process audio file
        logger.info(f"Processing {suffix} file")
        try:
            mfcc_features = extract_mfcc(temp_path, n_mfcc=40, max_len=130)
            processing_method = f"direct_{suffix}"
        except Exception as e:
            logger.error(f"Error processing {suffix} with librosa: {e}")
            safe_remove_file(temp_path)
            return {"error": f"Error processing {suffix} file. Untuk hasil terbaik, gunakan perekaman langsung (WAV)."}
        
        # Cleanup temporary file
        safe_remove_file(temp_path)
        
        # Make prediction
        if mfcc_features is not None:
            try:
                # Pastikan shape MFCC sesuai dengan model CNN 2D
                # Expected shape untuk model: (40, 130, 1) -> input (1, 40, 130, 1)
                # mfcc_features shape: (40, 130) -> reshape ke (1, 40, 130, 1)
                input_data = mfcc_features.reshape(1, 40, 130, 1)
                logger.info(f"Input shape untuk CNN 2D: {input_data.shape}")
                
                # Prediksi tanpa scaling (CNN 2D tidak membutuhkan scaling)
                prediction = model.predict(input_data, verbose=0)
                predicted_class = np.argmax(prediction)
                confidence = float(np.max(prediction))
                
                # Get all probabilities for debugging
                all_probs = prediction[0]
                logger.info(f"All probabilities: {all_probs}")
                
                result = label_map.get(predicted_class, f"unknown_{predicted_class}")
                
                logger.info(f"Prediksi: {result}, Confidence: {confidence:.4f}")

                # Tambahkan AI-generated phrase
                ai_phrase = generate_cat_phrase(result)
                logger.info(f"AI phrase: {ai_phrase}")

                # Build probability dictionary (hanya untuk label yang ada)
                prob_dict = {}
                for i, label in label_map.items():
                    if i < len(all_probs):
                        prob_dict[label.lower()] = float(all_probs[i])

                return {
                    "result": result,
                    "confidence": confidence,
                    "predicted_class": int(predicted_class),
                    "all_probabilities": prob_dict,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "audio_format": suffix,
                    "processed_shape": str(input_data.shape),
                    "processing_method": processing_method,
                    "ai_phrase": ai_phrase
                }
                
            except Exception as e:
                logger.error(f"Error making prediction: {e}")
                logger.error(traceback.format_exc())
                return {"error": f"Error prediksi: {str(e)}"}
        else:
            return {"error": "Gagal ekstraksi fitur audio"}
            
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        logger.error(traceback.format_exc())
        
        # Cleanup on error
        safe_remove_file(temp_path)
            
        return {"error": f"Error processing audio: {str(e)}"}

@app.route("/", methods=["GET", "POST"])
def index():
    """Main index route with error handling"""
    result = None
    timestamp = None
    confidence = None
    
    if request.method == "POST":
        try:
            file = request.files.get("audio_file")
            if not file:
                result = "No audio file provided"
            else:
                prediction_result = process_audio_file(file)
                
                if "error" in prediction_result:
                    result = prediction_result["error"]
                else:
                    result = prediction_result["result"]
                    timestamp = prediction_result["timestamp"]
                    confidence = prediction_result["confidence"]
                    
        except Exception as e:
            logger.error(f"Error in index route: {e}")
            logger.error(traceback.format_exc())
            result = "Server error occurred"
    
    return render_template("index.html", result=result, timestamp=timestamp, confidence=confidence)

@app.route("/predict", methods=["POST"])
def predict_ajax():
    """Endpoint AJAX untuk prediksi tanpa reload halaman - optimized untuk CNN 2D"""
    try:
        file = request.files.get("audio_file")
        if not file:
            return jsonify({"error": "No audio file provided"}), 400
            
        # Log file info
        logger.info(f"Received file: {file.filename}, content-type: {file.content_type}")
        
        prediction_result = process_audio_file(file)
        
        if "error" in prediction_result:
            return jsonify(prediction_result), 400
        else:
            return jsonify(prediction_result), 200
            
    except Exception as e:
        logger.error(f"Error in predict_ajax: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Server error occurred"}), 500

@app.route("/system-status", methods=["GET"])
def system_status():
    """Check system status - untuk CNN 2D model"""
    try:
        return jsonify({
            "status": "OK",
            "model_loaded": model is not None,
            "model_path_exists": os.path.exists(model_path),
            "model_type": "CNN_2D",
            "scaler_required": False,
            "recorder_js_mode": True,
            "optimal_format": "wav",
            "supported_formats": ["wav", "mp3", "webm"],
            "recommended_method": "direct_recording_wav",
            "input_shape": str(model.input_shape) if model else "Model not loaded",
            "gemini_available": gemini_model is not None,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in system_status: {e}")
        return jsonify({"error": "Error checking system status"}), 500

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint untuk debugging"""
    try:
        return jsonify({
            "status": "healthy",
            "model_loaded": model is not None,
            "model_type": "CNN_2D",
            "scaler_required": False,
            "recorder_js_ready": True,
            "librosa_available": True,
            "optimal_workflow": "recorder.js -> WAV -> librosa -> MFCC -> CNN 2D -> prediction",
            "expected_input_shape": "(1, 40, 130, 1)",
            "gemini_initialized": gemini_model is not None,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in health_check: {e}")
        return jsonify({"error": "Health check failed"}), 500

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({"error": "File terlalu besar (maksimal 16MB)"}), 413

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({"error": "Resource not found"}), 404

@app.errorhandler(500)
def internal_error(e):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {e}")
    return jsonify({"error": "Internal server error"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """Handle all other exceptions"""
    logger.error(f"Unhandled exception: {e}")
    logger.error(traceback.format_exc())
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    # Check if model is loaded before starting server
    if not model_loaded:
        logger.error("Failed to load model. Please check if the model file exists.")
        logger.error(f"Expected model path: {os.path.abspath(model_path)}")
    
    # Development server
    app.run(debug=True, host="0.0.0.0", port=5000)