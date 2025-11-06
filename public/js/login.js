// public/js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // Đây là code từ file zip của bạn
    const container = document.querySelector('.container');
    const registerBtn = document.querySelector('.register-btn');
    const loginBtn = document.querySelector('.login-btn');

    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            container.classList.add('active');
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            container.classList.remove('active');
        });
    }

    // Thêm logic xác thực
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Ngăn form gửi đi
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            // Xóa thông báo lỗi cũ
            const errorEl = document.getElementById('loginError');
            if (errorEl) errorEl.classList.add('hidden');

            // 1. Tài khoản Admin
            if (email === 'admin@canteen.ueh' && password === '12345') {
                console.log('Đăng nhập Admin thành công');
                // Lưu trạng thái (nếu cần)
                localStorage.setItem('userRole', 'admin');
                localStorage.setItem('userName', 'Admin');
                // Chuyển hướng đến trang Admin
                window.location.href = '../web_admin/admin.html';
            
            // 2. Tài khoản Khách hàng VIP
            } else if (email === 'khvip@canteen.ueh' && password === '12345') {
                console.log('Đăng nhập KH VIP thành công');
                localStorage.setItem('userRole', 'vip');
                localStorage.setItem('userName', 'Khách hàng VIP');
                // Chuyển hướng đến trang Kiosk
                window.location.href = '../web_kiosk/kiosk.html';

            // 3. Tài khoản Khách hàng thường
            } else if (email === 'kh@canteen.ueh' && password === '12345') {
                console.log('Đăng nhập KH thường thành công');
                localStorage.setItem('userRole', 'customer');
                localStorage.setItem('userName', 'Khách hàng');
                // Chuyển hướng đến trang Kiosk
                window.location.href = '../web_kiosk/kiosk.html';
            
            // 4. Sai thông tin
            } else {
                console.log('Sai thông tin đăng nhập');
                if (errorEl) {
                    errorEl.classList.remove('hidden');
                }
            }
        });
    }
});