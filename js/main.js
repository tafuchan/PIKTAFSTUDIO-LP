/* ============================================
   PIKTAF STUDIO - Main Script
   ============================================ */

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
        '.section-header, .about-main, .about-card, .app-card, .service-card, .flow-step, .blog-card, .contact-grid, .trust-bar, .cta-box'
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
