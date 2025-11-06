# -*- coding: utf-8 -*-
import os
import io
import json
import numpy as np
import cv2  # OpenCV
import tensorflow as tf
from flask import Flask, request, jsonify, render_template, send_from_directory
from PIL import Image
import base64

# --- CÀI ĐẶT CỐ ĐỊNH ---
# !!! ĐÃ SỬA LỖI: Tải đúng mô hình v1 theo yêu cầu của bạn
MODEL_PATH = "model_CNN_scratch_v1.h5" 
FOOD_INFO_PATH = "food_info.json"
IMG_WIDTH, IMG_HEIGHT = 128, 128

# --- KHỞI TẠO ỨNG DỤNG FLASK ---
app = Flask(__name__,
            static_folder='public', # Thư mục chứa các tệp tĩnh (CSS, JS, HTML con)
            template_folder='public') # Thư mục chứa các tệp HTML chính (để render_template)

# --- BIẾN TOÀN CỤC ĐỂ LƯU MODEL ---
model = None
food_info_data = {}
CLASS_NAMES = []
initialization_error = None # Biến lưu lỗi nếu có

# --- TẢI MÔ HÌNH VÀ DỮ LIỆU KHI KHỞI ĐỘNG ---
try:
    # 1. Tải mô hình AI
    print(f"--- Đang tải mô hình từ: {MODEL_PATH} ---")
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Không tìm thấy tệp mô hình: {MODEL_PATH}. Vui lòng kiểm tra lại tên tệp.")
        
    model = tf.keras.models.load_model(MODEL_PATH)
    print("--- Tải mô hình thành công! ---")

    # 2. Tải dữ liệu món ăn
    print(f"--- Đang tải dữ liệu món ăn từ: {FOOD_INFO_PATH} ---")
    if not os.path.exists(FOOD_INFO_PATH):
        raise FileNotFoundError(f"Không tìm thấy tệp dữ liệu: {FOOD_INFO_PATH}.")

    with open(FOOD_INFO_PATH, 'r', encoding='utf-8') as f:
        food_info_data = json.load(f)
    print("--- Tải dữ liệu món ăn thành công! ---")

    # 3. Lấy danh sách tên các lớp (keys)
    CLASS_NAMES = list(food_info_data.keys())
    print(f"--- Các lớp được nhận diện: {CLASS_NAMES} ---")

except Exception as e:
    # Ghi lại lỗi nghiêm trọng
    initialization_error = str(e)
    print(f"!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print(f"!!! LỖI NGHIÊM TRỌNG KHI KHỞI ĐỘNG: {e}")
    print(f"!!! Máy chủ Flask SẼ KHÔNG chạy cho đến khi lỗi này được sửa.")
    print(f"!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

# --- HÀM TIỆN ÍCH ---

def preprocess_image(base64_string):
    """
    Chuyển đổi ảnh Base64 (đã cắt) thành mảng numpy 128x128 
    để chuẩn bị cho mô hình AI.
    """
    try:
        # Tách phần header "data:image/jpeg;base64,"
        if "," in base64_string:
            base64_string = base64_string.split(',')[1]
            
        # Giải mã Base64
        img_bytes = base64.b64decode(base64_string)
        
        # Chuyển byte thành mảng numpy
        img_np = np.frombuffer(img_bytes, np.uint8)
        
        # Đọc ảnh bằng OpenCV
        img_cv = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
        
        # 1. Resize ảnh về (128, 128)
        img_resized = cv2.resize(img_cv, (IMG_WIDTH, IMG_HEIGHT))
        
        # 2. Chuẩn hóa (1./255)
        img_normalized = img_resized.astype('float32') / 255.0
        
        # 3. Mở rộng chiều (batch size = 1) -> (1, 128, 128, 3)
        img_batch = np.expand_dims(img_normalized, axis=0)
        
        return img_batch
        
    except Exception as e:
        print(f"Lỗi tiền xử lý ảnh: {e}")
        return None

# --- API ROUTES ---

@app.route('/api/predict', methods=['POST'])
def predict_api():
    """
    Đây là API chính mà JavaScript (camera.js) sẽ gọi đến.
    Nó nhận 5 ảnh Base64 đã cắt và trả về 5 kết quả.
    """
    if model is None:
        return jsonify({"success": False, "error": "Mô hình AI chưa được tải."}), 500

    try:
        # Lấy dữ liệu JSON từ request
        data = request.json
        
        # Lấy danh sách 5 ảnh base64
        cropped_images_base64 = data.get('images', [])
        
        if not cropped_images_base64 or len(cropped_images_base64) != 5:
            return jsonify({"success": False, "error": "Cần 5 ảnh đã cắt."}), 400

        results = []

        # Lặp qua 5 ảnh đã cắt
        for img_base64 in cropped_images_base64:
            # 1. Tiền xử lý ảnh
            processed_img = preprocess_image(img_base64)
            if processed_img is None:
                results.append({"key": "error", "confidence": 0})
                continue

            # 2. Dự đoán bằng mô hình .h5
            prediction = model.predict(processed_img)
            
            # 3. Lấy kết quả
            predicted_index = np.argmax(prediction[0])
            confidence = float(prediction[0][predicted_index])
            predicted_key = CLASS_NAMES[predicted_index] # Lấy key (ví dụ: "ca_hu_kho")

            # Thêm kết quả vào danh sách
            results.append({
                "key": predicted_key,
                "confidence": confidence
            })

        # Trả về kết quả (danh sách 5 món) cho front-end
        return jsonify({"success": True, "predictions": results})

    except Exception as e:
        print(f"Lỗi API /api/predict: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# --- STATIC FILE SERVING (Phục vụ các file HTML) ---

@app.route('/')
def index():
    """
    Route gốc, chuyển hướng đến trang đăng nhập.
    """
    return send_from_directory(os.path.join(app.static_folder, 'web_login'), 'login.html')

@app.route('/<path:path>')
def serve_static(path):
    """
    Phục vụ các file tĩnh khác (như admin.html, kiosk.html, v.v.)
    """
    # Thử phục vụ các file HTML chính
    if path.endswith('.html'):
        # Tách thư mục (ví dụ: "web_admin") và tệp (ví dụ: "admin.html")
        dir_name = os.path.dirname(path)
        file_name = os.path.basename(path)
        if dir_name:
            return send_from_directory(os.path.join(app.static_folder, dir_name), file_name)

    # Phục vụ các file CSS/JS/Images
    return send_from_directory(app.static_folder, path)

# --- CHẠY ỨNG DỤNG ---
if __name__ == '__main__':
    # Kiểm tra xem model đã tải thành công chưa
    if model is None or initialization_error:
        print("\n" + "="*50)
        print("KHÔNG THỂ KHỞI ĐỘNG MÁY CHỦ FLASK.")
        print(f"Lỗi: {initialization_error}")
        print("Vui lòng kiểm tra các tệp .h5 và .json đã đúng vị trí và tên chưa.")
        print("="*50 + "\n")
    else:
        # Chạy ở chế độ debug (chỉ dùng khi phát triển)
        # port=8080 để tránh xung đột với các dịch vụ khác
        print("\n--- Mọi thứ đã sẵn sàng. Khởi động máy chủ Flask ---")
        app.run(debug=True, host='0.0.0.0', port=8080)