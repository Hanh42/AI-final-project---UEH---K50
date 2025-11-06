// public/js/camera.js

// Import các hàm tiện ích từ các file khác
import { initializeApp, db, auth, createPaymentSession, listenToPaymentStatus, updatePaymentState } from './firestore_utils.js';
import { speak } from './tts_ui.js';

// --- ĐỊNH NGHĨA BIẾN TOÀN CỤC VÀ DOM ELEMENTS ---
let videoStream = null;
let currentTransactionId = null;
let currentTransactionAmount = 0;
let currentUserRole = 'customer'; // Mặc định là khách thường
let FOOD_INFO = {}; // Dữ liệu món ăn sẽ được load
let currentUnsubscribe = null; // Biến lưu hàm dừng lắng nghe Firestore

// Tọa độ cắt ảnh (phân đoạn) - Tỷ lệ % (x, y, width, height)
// [Ô canh lớn, Ô cơm, Ô nhỏ 1, Ô nhỏ 2, Ô nhỏ 3]
const CROP_AREAS_NORMALIZED = [
    [0.02, 0.03, 0.45, 0.45], // Ô canh lớn (trái trên)
    [0.55, 0.03, 0.43, 0.45], // Ô cơm (phải trên)
    [0.02, 0.53, 0.28, 0.44], // Ô nhỏ 1 (trái dưới)
    [0.35, 0.53, 0.28, 0.44], // Ô nhỏ 2 (giữa dưới)
    [0.68, 0.53, 0.28, 0.44]  // Ô nhỏ 3 (phải dưới)
];

// Trạng thái của ứng dụng
const AppState = {
    LOADING: 'LOADING',
    READY: 'READY',
    PREDICTING: 'PREDICTING',
    RESULTS: 'RESULTS',
    PAYMENT: 'PAYMENT',
    SUCCESS: 'SUCCESS'
};

// --- KHỞI TẠO ỨNG DỤNG ---

// Chạy khi toàn bộ trang đã tải
document.addEventListener('DOMContentLoaded', () => {
    // 1. Lấy dữ liệu món ăn
    loadFoodInfo();

    // 2. Kiểm tra phân quyền
    checkUserRole();
    
    // 3. Khởi động Camera
    switchInputMode('camera'); // Mặc định mở camera

    // 4. Gán sự kiện cho các nút
    bindEvents();

    // 5. Đặt trạng thái ban đầu
    setUIState(AppState.READY);
});

// Tải dữ liệu food_info.json
async function loadFoodInfo() {
    try {
        const response = await fetch('../food_info.json'); // Đường dẫn tương đối
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        FOOD_INFO = await response.json();
        console.log("Dữ liệu món ăn đã tải thành công.");
    } catch (e) {
        console.error("Lỗi tải dữ liệu food_info.json:", e);
        // Sử dụng dữ liệu dự phòng nếu tải lỗi
        FOOD_INFO = {
          "com_trang": { "name": "Cơm trắng (Dự phòng)", "price": 2000, "nutrition": { "calories": 200, "protein": 4.0, "fat": 0.4, "carbs": 45.0, "description": "Cung cấp tinh bột", "ingredients": "Gạo trắng" } },
          "ca_hu_kho": { "name": "Cá hú kho (Dự phòng)", "price": 15000, "nutrition": { "calories": 250, "protein": 35.0, "fat": 8.0, "carbs": 5.0, "description": "Giàu protein, ít béo", "ingredients": "Cá hú, nước mắm, tiêu, hành, ớt" } }
        };
    }
}

// Kiểm tra quyền của người dùng (VIP hay thường)
function checkUserRole() {
    currentUserRole = localStorage.getItem('userRole') || 'customer';
    const userName = localStorage.getItem('userName') || 'Khách hàng';

    const userDisplay = document.getElementById('userDisplay');
    const userIcon = document.getElementById('userIcon');

    if (currentUserRole === 'vip') {
        userDisplay.textContent = userName;
        userIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`;
    } else {
        userDisplay.textContent = userName;
        userIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>`;
    }
}

// Gán sự kiện cho các nút
function bindEvents() {
    // Nút Camera / Photo
    document.getElementById('btnCameraMode').addEventListener('click', () => switchInputMode('camera'));
    document.getElementById('btnPhotoMode').addEventListener('click', () => switchInputMode('photo'));

    // Nút chụp (Camera) và tải ảnh (Photo)
    document.getElementById('btnSnapshot').addEventListener('click', handleSnapshotPrediction);
    document.getElementById('btnUpload').addEventListener('click', handleUploadPrediction);
    document.getElementById('fileUpload').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.getElementById('imagePreview');
                img.src = event.target.result;
                img.classList.remove('hidden');
                document.getElementById('cameraFeed').classList.add('hidden'); // Ẩn video
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // Nút "Về Chúng Tôi" (Modal)
    document.getElementById('btnAboutUs').addEventListener('click', () => document.getElementById('aboutUsModal').classList.remove('hidden'));
    document.getElementById('btnCloseModal').addEventListener('click', () => document.getElementById('aboutUsModal').classList.add('hidden'));

    // Nút Đăng xuất
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '../web_login/login.html';
    });

    // Nút "Phục vụ khách tiếp theo"
    document.getElementById('btnReset').addEventListener('click', resetKiosk);

    // Nút TTS (Hỗ trợ khiếm thị)
    document.getElementById('btnTTS').addEventListener('click', () => {
        const text = document.getElementById('tts-content').textContent;
        speak(text || "Chưa có thông tin để đọc.");
    });

    // Gán sự kiện cho các nút Voucher (nếu là VIP)
    document.querySelectorAll('.voucher-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const discount = parseFloat(e.currentTarget.dataset.discount);
            // Xóa active class cũ
            document.querySelectorAll('.voucher-btn').forEach(b => b.classList.remove('glass-button-active'));
            // Thêm active class mới
            e.currentTarget.classList.add('glass-button-active');
            
            // Tính toán lại tổng tiền
            const originalTotal = parseFloat(document.getElementById('finalPrice').dataset.originalPrice);
            const newTotal = originalTotal * (1 - discount);
            
            document.getElementById('finalPrice').textContent = `${newTotal.toLocaleString('vi-VN')} VNĐ`;
            currentTransactionAmount = newTotal; // Cập nhật tổng tiền cuối cùng
            
            // Cập nhật lại QR Code với số tiền mới
            generatePaymentQRCode();
        });
    });
}

// --- LOGIC XỬ LÝ CAMERA VÀ ẢNH ---

// Khởi động Camera
async function startCamera() {
    try {
        // Dừng stream cũ (nếu có)
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }
        
        document.getElementById('cameraSpinner').classList.remove('hidden');
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        const videoEl = document.getElementById('cameraFeed');
        videoEl.srcObject = videoStream;
        videoEl.classList.remove('hidden');
        document.getElementById('imagePreview').classList.add('hidden');
        document.getElementById('cameraSpinner').classList.add('hidden');
    } catch (err) {
        console.error("Lỗi bật camera:", err);
        document.getElementById('cameraSpinner').innerHTML = "Lỗi Camera";
    }
}

// Chuyển đổi giữa chế độ Camera và Photo
function switchInputMode(mode) {
    if (mode === 'camera') {
        // Bật chế độ Camera
        document.getElementById('btnCameraMode').classList.add('glass-button-active');
        document.getElementById('btnPhotoMode').classList.remove('glass-button-active');
        document.getElementById('cameraActions').classList.remove('hidden');
        document.getElementById('photoActions').classList.add('hidden');
        startCamera(); // Khởi động lại camera
    } else {
        // Bật chế độ Photo
        document.getElementById('btnCameraMode').classList.remove('glass-button-active');
        document.getElementById('btnPhotoMode').classList.add('glass-button-active');
        document.getElementById('cameraActions').classList.add('hidden');
        document.getElementById('photoActions').classList.remove('hidden');
        // Tắt camera
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        document.getElementById('cameraFeed').classList.add('hidden');
        document.getElementById('imagePreview').src = 'https://placehold.co/640x480/png?text=Ch%E1%BB%8Dn+%E1%BA%A3nh+%C4%91%E1%BB%83+t%E1%BA%A3i+l%C3%AAn';
        document.getElementById('imagePreview').classList.remove('hidden');
        document.getElementById('cameraSpinner').classList.add('hidden');
    }
}

// Xử lý khi nhấn nút Chụp ảnh (Camera)
function handleSnapshotPrediction() {
    const videoEl = document.getElementById('cameraFeed');
    if (!videoStream || videoEl.paused || videoEl.ended) {
        alert("Camera chưa sẵn sàng. Vui lòng thử lại.");
        return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    
    // Lấy ảnh Base64
    const imageDataUrl = canvas.toDataURL('image/jpeg');
    
    // Gửi đi dự đoán
    runPrediction(imageDataUrl);
}

// Xử lý khi nhấn nút Tải ảnh lên (Photo)
function handleUploadPrediction() {
    const imgEl = document.getElementById('imagePreview');
    if (imgEl.src && !imgEl.src.startsWith('https://placehold.co')) {
        // Gửi ảnh Base64 (đã có sẵn trong imgEl.src)
        runPrediction(imgEl.src);
    } else {
        alert("Vui lòng chọn một ảnh trước khi tải lên.");
    }
}

// --- LOGIC XỬ LÝ AI VÀ HIỂN THỊ KẾT QUẢ ---

/**
 * Hàm chính chạy luồng dự đoán
 * @param {string} fullImageBase64 - Ảnh Base64 của toàn bộ khay cơm
 */
async function runPrediction(fullImageBase64) {
    setUIState(AppState.PREDICTING);
    
    // 1. Phân đoạn ảnh
    const croppedImages = await segmentImage(fullImageBase64);

    // 2. Gửi từng ảnh đi dự đoán (REAL API CALL)
    // const predictionPromises = croppedImages.map(imgBase64 => mockSinglePrediction(imgBase64));
    // const predictionResults = await Promise.all(predictionPromises);

    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ images: croppedImages }),
        });

        if (!response.ok) {
            throw new Error(`Lỗi API: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            // 3. Tổng hợp kết quả
            updateUIWithTotalResults(data.predictions);
        } else {
            throw new Error(`Lỗi từ API: ${data.error}`);
        }

    } catch (error) {
        console.error("Lỗi khi gọi API /api/predict:", error);
        alert(`Không thể kết nối với máy chủ AI. Vui lòng thử lại. Lỗi: ${error.message}`);
        setUIState(AppState.READY); // Trả về trạng thái sẵn sàng
    }
}

// Cắt ảnh toàn khay thành 5 ảnh nhỏ
async function segmentImage(fullImageBase64) {
    return new Promise((resolve) => {
        const fullImg = new Image();
        fullImg.onload = () => {
            const croppedImagesBase64 = [];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            for (const area of CROP_AREAS_NORMALIZED) {
                const [x_norm, y_norm, w_norm, h_norm] = area;
                
                // Tính tọa độ pixel
                const sx = Math.floor(x_norm * fullImg.width);
                const sy = Math.floor(y_norm * fullImg.height);
                const sWidth = Math.floor(w_norm * fullImg.width);
                const sHeight = Math.floor(h_norm * fullImg.height);

                // Cài đặt canvas
                canvas.width = sWidth;
                canvas.height = sHeight;

                // Cắt ảnh
                ctx.drawImage(fullImg, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
                
                // Lấy Base64 của ảnh đã cắt
                croppedImagesBase64.push(canvas.toDataURL('image/jpeg'));
            }
            
            // Hiển thị ảnh đã cắt (để debug)
            displayCroppedImages(croppedImagesBase64);
            resolve(croppedImagesBase64);
        };
        fullImg.src = fullImageBase64;
    });
}

// Hiển thị 5 ảnh đã cắt (debug)
function displayCroppedImages(images) {
    const container = document.getElementById('segmentationResults');
    container.innerHTML = ''; // Xóa ảnh cũ
    images.forEach((imgBase64, index) => {
        const imgEl = document.createElement('img');
        imgEl.src = imgBase64;
        imgEl.className = 'w-1/5 rounded-md border border-gray-400';
        imgEl.title = `Ô ${index + 1}`;
        container.appendChild(imgEl);
    });
}

/**
 * Mô phỏng API AI (Back-end) - (HÀM NÀY GIỜ ĐÃ ĐƯỢC THAY THẾ BẰNG fetch('/api/predict'))
 * Nhận 1 ảnh Base64 (đã cắt) và trả về thông tin 1 món ăn
 */
// async function mockSinglePrediction(imageBase64) {
//     ... (Hàm này không còn được sử dụng) ...
// }

// Cập nhật giao diện với kết quả tổng hợp
async function updateUIWithTotalResults(results) {
    const resultsContainer = document.getElementById('predictionResultsList');
    resultsContainer.innerHTML = ''; // Xóa kết quả cũ
    
    let totalPrice = 0;
    let totalNutrition = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    let ttsText = "Khay cơm của bạn có: ";

    results.forEach((result, index) => {
        // 'result' bây giờ là { key: "ca_hu_kho", confidence: 0.9 }
        const dish = FOOD_INFO[result.key]; 
        
        if (!dish) {
            console.warn(`Không tìm thấy món với key: ${result.key}`);
            return; // Bỏ qua nếu không tìm thấy món (ví dụ: AI nhận diện nhầm)
        }

        totalPrice += dish.price;
        totalNutrition.calories += dish.nutrition.calories;
        totalNutrition.protein += dish.nutrition.protein;
        totalNutrition.fat += dish.nutrition.fat;
        totalNutrition.carbs += dish.nutrition.carbs;

        // Thêm món ăn vào danh sách
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center py-3 border-b border-white/10';
        li.innerHTML = `
            <div>
                <h4 class="font-semibold text-lg">${dish.name}</h4>
                <p class="text-xs text-gray-300">
                    (${Math.round(result.confidence * 100)}%) 
                    ${dish.nutrition.ingredients}
                </p>
            </div>
            <span class="font-bold text-lg text-white">${dish.price.toLocaleString('vi-VN')} VNĐ</span>
        `;
        resultsContainer.appendChild(li);

        // Chuẩn bị text cho TTS
        ttsText += `${dish.name}, `;
    });

    // Cập nhật tổng tiền và tổng dinh dưỡng
    const finalPriceEl = document.getElementById('finalPrice');
    finalPriceEl.textContent = `${totalPrice.toLocaleString('vi-VN')} VNĐ`;
    finalPriceEl.dataset.originalPrice = totalPrice; // Lưu giá gốc cho logic Voucher
    currentTransactionAmount = totalPrice; // Đặt giá trị giao dịch ban đầu

    document.getElementById('totalCalories').textContent = `${totalNutrition.calories.toFixed(0)} kcal`;
    document.getElementById('totalProtein').textContent = `${totalNutrition.protein.toFixed(1)}g`;
    document.getElementById('totalFat').textContent = `${totalNutrition.fat.toFixed(1)}g`;
    document.getElementById('totalCarbs').textContent = `${totalNutrition.carbs.toFixed(1)}g`;

    // Cập nhật khuyến nghị (Logic đơn giản)
    let recommendation = "Bữa ăn cân đối, phù hợp cho mọi hoạt động.";
    if (totalNutrition.calories > 800) recommendation = "Bữa ăn giàu năng lượng, phù hợp cho người lao động nặng.";
    if (totalNutrition.calories < 400) recommendation = "Bữa ăn nhẹ nhàng, có thể cần bổ sung thêm năng lượng.";
    document.getElementById('nutritionRecommendation').textContent = recommendation;

    // Cập nhật nội dung TTS
    ttsText += `Tổng cộng ${totalPrice.toLocaleString('vi-VN')} đồng. ${recommendation}`;
    document.getElementById('tts-content').textContent = ttsText;

    // Xử lý logic VIP và Voucher
    handleVipUI(totalPrice);

    // Đặt trạng thái UI
    setUIState(AppState.RESULTS);
}

// --- LOGIC THANH TOÁN VÀ TRẠNG THÁI UI ---

// Xử lý hiển thị Voucher (nếu là VIP) và tạo QR
async function handleVipUI(totalPrice) {
    if (currentUserRole === 'vip') {
        document.getElementById('voucherSection').classList.remove('hidden');
        // Reset voucher
        document.querySelectorAll('.voucher-btn').forEach(b => b.classList.remove('glass-button-active'));
    } else {
        document.getElementById('voucherSection').classList.add('hidden');
    }

    // (Tiếp tục) Tạo phiên thanh toán và QR
    await generatePaymentQRCode();
}

// Tạo phiên thanh toán trên Firestore và tạo QR
async function generatePaymentQRCode() {
    // 1. Tạo phiên thanh toán mới
    try {
        // Dừng lắng nghe phiên cũ (nếu có)
        if (currentUnsubscribe) {
            currentUnsubscribe();
            currentUnsubscribe = null;
        }

        currentTransactionId = await createPaymentSession(currentTransactionAmount);
        console.log(`Tạo phiên thanh toán: ${currentTransactionId} với số tiền ${currentTransactionAmount} VNĐ`);
        
        // 2. Tạo QR Code
        const qrCanvas = document.getElementById('qrCodeCanvas');
        // Lấy origin (ví dụ: http://127.0.0.1:8080) và đảm bảo đường dẫn chính xác
        const paymentUrl = `${window.location.origin}/web_payment/mock_payment.html?id=${currentTransactionId}&amount=${currentTransactionAmount}`;
        
        // Sử dụng thư viện QRCode.js (đã import qua CDN)
        QRCode.toCanvas(qrCanvas, paymentUrl, { width: 180, margin: 2 }, (error) => {
            if (error) console.error(error);
            console.log('Tạo QR thành công!');
        });
        
        document.getElementById('qrCodeContainer').classList.remove('hidden');
        setUIState(AppState.PAYMENT); // Đảm bảo UI ở trạng thái thanh toán

        // 3. Bắt đầu lắng nghe trạng thái thanh toán
        currentUnsubscribe = listenToPaymentStatus(currentTransactionId, (isPaid) => {
            if (isPaid) {
                handlePaymentSuccess();
            }
        });

    } catch (e) {
        console.error("Lỗi khi tạo phiên thanh toán:", e);
        alert("Không thể tạo phiên thanh toán. Vui lòng thử lại.");
    }
}

// Xử lý khi thanh toán thành công
function handlePaymentSuccess() {
    console.log("Thanh toán thành công!");
    setUIState(AppState.SUCCESS);
    
    // Dừng lắng nghe
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }

    const successMessage = "Thanh toán thành công! Chúc quý khách ngon miệng!";
    document.getElementById('tts-content').textContent = successMessage;
    speak(successMessage);
    
    // Tùy chọn: Phát âm thanh thành công
    // const audio = new Audio('../sounds/success.mp3');
    // audio.play();
}

// Reset Kiosk về trạng thái ban đầu
function resetKiosk() {
    setUIState(AppState.READY);
    currentTransactionId = null;
    currentTransactionAmount = 0;

    // Dừng lắng nghe (nếu còn)
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }

    // Reset các nút voucher
    document.querySelectorAll('.voucher-btn').forEach(b => b.classList.remove('glass-button-active'));
    
    // Xóa ảnh cắt (debug)
    document.getElementById('segmentationResults').innerHTML = '';

    // Khởi động lại camera
    switchInputMode('camera');
}

// Quản lý trạng thái hiển thị của các Panel
function setUIState(state) {
    // Ẩn tất cả các panel chính
    document.getElementById('predictionWaiting').classList.add('hidden');
    document.getElementById('predictionLoading').classList.add('hidden');
    document.getElementById('predictionResults').classList.add('hidden');
    document.getElementById('paymentSuccess').classList.add('hidden');
    
    // Ẩn/Hiện các nút điều khiển
    document.getElementById('mainControls').classList.add('hidden'); // Ẩn "CAMERA" và "PHOTO"
    document.getElementById('btnReset').classList.add('hidden');

    switch (state) {
        case AppState.READY:
            document.getElementById('predictionWaiting').classList.remove('hidden');
            document.getElementById('mainControls').classList.remove('hidden');
            break;
            
        case AppState.PREDICTING:
            document.getElementById('predictionLoading').classList.remove('hidden');
            break;
            
        case AppState.RESULTS:
        case AppState.PAYMENT:
            document.getElementById('predictionResults').classList.remove('hidden');
            break;
            
        case AppState.SUCCESS:
            document.getElementById('paymentSuccess').classList.remove('hidden');
            document.getElementById('btnReset').classList.remove('hidden');
            break;
    }
}