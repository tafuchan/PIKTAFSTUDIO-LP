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
// 画像やWebフォントの読み込み完了(load)を待たず、DOM が組み上がった時点で外す。
// load 待ち + 待機時間だと、内容が用意できているのに数秒ローディングが残るため。
(function () {
    const hide = () => {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hide, { once: true });
    } else {
        hide();
    }
})();

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

    // スクロールのたびにスタイルを書き換えず、状態が変わったときだけクラスを付け替える
    let scrolled = null;
    const sync = () => {
        const next = window.scrollY > 50;
        if (next !== scrolled) {
            scrolled = next;
            nav.classList.toggle('scrolled', next);
        }
    };

    window.addEventListener('scroll', sync, { passive: true });
    sync();
})();
