// public/js/tts_ui.js

/**
 * Sử dụng API Web Speech của trình duyệt để đọc văn bản.
 * @param {string} text - Văn bản cần đọc.
 */
export function speak(text) {
    // Kiểm tra xem trình duyệt có hỗ trợ Web Speech API không
    if (!('speechSynthesis' in window)) {
        console.warn("Trình duyệt này không hỗ trợ Text-to-Speech (Web Speech API).");
        alert("Trình duyệt của bạn không hỗ trợ tính năng đọc giọng nói.");
        return;
    }

    // Hủy bỏ bất kỳ lượt đọc nào trước đó
    window.speechSynthesis.cancel();

    // Tạo một đối tượng SpeechSynthesisUtterance
    const utterance = new SpeechSynthesisUtterance(text);

    // Cấu hình (Tùy chọn)
    utterance.lang = 'vi-VN'; // Đặt ngôn ngữ Tiếng Việt
    utterance.volume = 1;     // Âm lượng (0 đến 1)
    utterance.rate = 1;       // Tốc độ đọc (0.1 đến 10)
    utterance.pitch = 1;      // Cao độ (0 đến 2)

    // (Tùy chọn) Thử tìm giọng đọc Tiếng Việt
    // Phải gọi getVoices() trong sự kiện onvoiceschanged hoặc đợi một chút
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            const vietnameseVoice = voices.find(voice => voice.lang === 'vi-VN');
            if (vietnameseVoice) {
                utterance.voice = vietnameseVoice;
            }
            window.speechSynthesis.speak(utterance);
        };
    } else {
        const vietnameseVoice = voices.find(voice => voice.lang === 'vi-VN');
        if (vietnameseVoice) {
            utterance.voice = vietnameseVoice;
        }
        // Bắt đầu đọc
        window.speechSynthesis.speak(utterance);
    }
}