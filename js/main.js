// Scroll Management (Header shrink)
window.addEventListener('scroll', () => {
    const nav = document.getElementById('nav');
    if (window.scrollY > 100) {
        nav.classList.add('bg-black/90', 'backdrop-blur-md', 'border-b', 'border-white/5', 'py-3');
        nav.classList.remove('py-5');
    } else {
        nav.classList.remove('bg-black/90', 'backdrop-blur-md', 'border-b', 'border-white/5', 'py-3');
        nav.classList.add('py-5');
    }
});

// Intersection Observer for Reveal Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
}, observerOptions);

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Feather Animation Logic
function createFeather() {
    const feather = document.createElement('div');
    // アイコンを内包する要素で変形（細長く）を適用
    // scale(0.5, 1.3) で横を半分、縦を1.3倍にして細長く見せる
    feather.innerHTML = '<i class="fas fa-feather" style="display:block; transform: scale(0.5, 1.3);"></i>';
    feather.classList.add('feather');

    // Random properties
    const size = Math.random() * 20 + 20; // 少し大きめに調整 20px - 40px (細くしたので視認性確保)
    const left = Math.random() * 100; // 0% - 100vw
    const fallDuration = Math.random() * 10 + 15; // 15s - 25s (よりゆっくりに)
    const swayDuration = Math.random() * 3 + 3; // 3s - 6s (ゆったり揺れる)
    const delay = Math.random() * 5; // 0s - 5s delay

    feather.style.fontSize = `${size}px`;
    feather.style.left = `${left}vw`;
    feather.style.animation = `
        feather-fall ${fallDuration}s linear forwards,
        feather-sway ${swayDuration}s ease-in-out infinite alternate
    `;

    document.body.appendChild(feather);

    // Cleanup
    setTimeout(() => {
        feather.remove();
    }, fallDuration * 1000);
}

// Start feather animation loop
setInterval(createFeather, 2000); // 生成頻度を少し上げる

// Mobile Menu Toggle Logic
const menuToggle = document.getElementById('menu-toggle');
const menuClose = document.getElementById('menu-close');
const mobileMenu = document.getElementById('mobile-menu');

menuToggle.addEventListener('click', () => {
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
});

menuClose.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
});

// Close menu on link click
mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
    });
});

// FAQ Toggle Logic
function toggleFaq(button) {
    const item = button.parentElement;
    const isOpen = item.classList.contains('open');

    if (isOpen) {
        item.classList.remove('open');
    } else {
        item.classList.add('open');
    }
}
