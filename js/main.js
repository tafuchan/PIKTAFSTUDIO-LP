/* ============================================
   PIKTAF STUDIO - Main Script
   ============================================ */

// --- Theme toggle ---
(function () {
    const THEME_KEY = 'theme';
    const root = document.documentElement;

    // 初期テーマは <head> のインラインスクリプトで既に設定されているため、ここでは未設定時のみ補正
    if (!root.getAttribute('data-theme')) {
        const saved = localStorage.getItem(THEME_KEY);
        const initial = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        root.setAttribute('data-theme', initial);
    }

    const btn = document.querySelector('.theme-toggle');
    if (btn) {
        const updateLabel = () => {
            const cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            btn.setAttribute('aria-pressed', cur === 'dark' ? 'true' : 'false');
            btn.setAttribute('title', cur === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え');
        };
        updateLabel();

        btn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            localStorage.setItem(THEME_KEY, next);
            updateLabel();
        });
    }

    // OS のテーマ変更を反映（ユーザーが明示的に切り替えていない場合のみ）
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
            root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
})();

// --- Loader ---
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => loader.classList.add('hidden'), 600);
    }
});

// --- Mobile Navigation Toggle ---
(function () {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
        links.classList.toggle('active');
    });

    links.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => {
            links.classList.remove('active');
        });
    });
})();

// --- Scroll Fade-in Animation ---
(function () {
    const targets = document.querySelectorAll(
        '.section-header, .about-block, .about-main, .about-card, .app-card, .service-card, .flow-step, .blog-card, .contact-grid, .contact-simple, .trust-bar, .cta-box'
    );

    targets.forEach((el) => el.classList.add('fade-in'));

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    targets.forEach((el) => observer.observe(el));
})();

// --- Navbar style on scroll ---
(function () {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.style.boxShadow = '0 2px 12px rgba(0, 128, 128, 0.06)';
        } else {
            nav.style.boxShadow = 'none';
        }
    });
})();
