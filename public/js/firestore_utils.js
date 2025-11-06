// public/js/firestore_utils.js

// Import các hàm Firebase (Giả định bạn đã tải chúng qua CDN trong HTML)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- BIẾN TOÀN CỤC (Được cung cấp bởi môi trường Canvas) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-smartmeal-app-id';
const firebaseConfig = (typeof __firebase_config !== 'undefined' && __firebase_config) 
    ? JSON.parse(__firebase_config)
    : {
        // Cấu hình Firebase dự phòng (SỬ DỤNG CẤU HÌNH CỦA BẠN)
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_AUTH_DOMAIN",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_STORAGE_BUCKET",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID"
    };

// --- KHỞI TẠO FIREBASE ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Đăng nhập ẩn danh để truy cập Firestore
signInAnonymously(auth).catch((error) => {
    console.error("Lỗi đăng nhập ẩn danh:", error);
});

// Hàm lấy userId
function getUserId() {
    return auth.currentUser ? auth.currentUser.uid : null;
}

/**
 * Tạo một phiên thanh toán mới (payment session) trong Firestore.
 * @param {number} amount - Tổng số tiền cần thanh toán.
 * @returns {Promise<string>} - Trả về ID của phiên thanh toán (transactionId).
 */
export async function createPaymentSession(amount) {
    const userId = getUserId();
    if (!userId) {
        throw new Error("Người dùng chưa xác thực.");
    }

    try {
        // Sử dụng đường dẫn public (dành cho Kiosk và Điện thoại giao tiếp)
        const collectionPath = `artifacts/${appId}/public/data/payment_sessions`;
        
        const docRef = await addDoc(collection(db, collectionPath), {
            amount: amount,
            isPaid: false,
            createdAt: serverTimestamp(),
            userId: userId
        });
        
        return docRef.id; // Đây là transactionId
    } catch (e) {
        console.error("Lỗi tạo phiên thanh toán: ", e);
        throw e;
    }
}

/**
 * Lắng nghe thay đổi trạng thái của một phiên thanh toán.
 * @param {string} transactionId - ID của phiên thanh toán cần theo dõi.
 * @param {function} callback - Hàm sẽ được gọi khi trạng thái isPaid thay đổi (ví dụ: callback(true)).
 * @returns {function} - Hàm Unsubscribe để dừng lắng nghe.
 */
export function listenToPaymentStatus(transactionId, callback) {
    const docPath = `artifacts/${appId}/public/data/payment_sessions/${transactionId}`;
    
    const unsubscribe = onSnapshot(doc(db, docPath), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log(`Firestore: Trạng thái thanh toán cho ${transactionId} là ${data.isPaid}`);
            
            // Chỉ gọi callback nếu trạng thái là true
            if (data.isPaid === true) {
                callback(true);
            }
        } else {
            console.warn("Không tìm thấy phiên thanh toán!");
        }
    });

    return unsubscribe; // Trả về hàm để dừng lắng nghe
}

/**
 * (Dùng cho web_payment) Cập nhật trạng thái thanh toán thành "true".
 * @param {string} transactionId - ID của phiên thanh toán cần cập nhật.
 * @returns {Promise<void>}
 */
export async function updatePaymentState(transactionId) {
    if (!transactionId) {
        console.error("Thiếu ID giao dịch!");
        return;
    }
    
    const docPath = `artifacts/${appId}/public/data/payment_sessions/${transactionId}`;
    const docRef = doc(db, docPath);

    try {
        await updateDoc(docRef, {
            isPaid: true,
            paidAt: serverTimestamp()
        });
        console.log(`Firestore: Cập nhật thanh toán ${transactionId} thành công.`);
    } catch (e) {
        console.error("Lỗi cập nhật trạng thái thanh toán: ", e);
    }
}

// Xuất các biến đã khởi tạo (nếu các module khác cần)
export { app, db, auth };