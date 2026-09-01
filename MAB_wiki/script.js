let clickCount = 0;
const titleElement = document.querySelector('.wiki-header h1');

titleElement.addEventListener('click', () => {
    clickCount++;
    
    if (clickCount >= 5) {
        // bodyに暗転用クラスを付与
        document.body.classList.add('fade-out');
        
        // 1.5秒（暗転アニメーション完了）後に裏ページへリダイレクト
        setTimeout(() => {
            window.location.href = 'secret.html';
        }, 1500);
        
        clickCount = 0; // カウントリセット
    }
});