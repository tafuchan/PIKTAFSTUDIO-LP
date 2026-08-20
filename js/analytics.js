/* ============================================
   PIKTAF STUDIO - Analytics (GA4 + 同意管理)
   ============================================ */
(function () {
    'use strict';

    // GA4 の測定ID（管理 → データストリーム で発行される G- から始まるID）
    var GA_ID = 'G-M8P9S96EBC';

    var CONSENT_KEY = 'analytics-consent'; // 'granted' | 'denied'

    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;

    // --- 同意の保存・読み出し ---
    function readConsent() {
        try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
    }
    function writeConsent(v) {
        try { localStorage.setItem(CONSENT_KEY, v); } catch (e) { }
    }

    // --- 同意取得が必要な地域か（タイムゾーンによる簡易判定） ---
    // 判定できないときは安全側に倒して同意を求める
    function needsConsent() {
        try {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            if (tz.indexOf('Europe/') === 0) return true;
            return ['Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores'].indexOf(tz) > -1;
        } catch (e) {
            return true;
        }
    }

    // --- Consent Mode v2 の既定値（広告系はこのサイトでは常に拒否） ---
    gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        functionality_storage: 'granted',
        security_storage: 'granted',
        wait_for_update: 500
    });

    // --- GA4 の読み込み（同意後、または同意不要な地域のみ） ---
    var loaded = false;
    function loadGA() {
        if (loaded) return;
        if (!GA_ID || GA_ID.charAt(2) === 'X') return; // 測定ID未設定のうちは何も読み込まない
        loaded = true;
        gtag('consent', 'update', { analytics_storage: 'granted' });
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);
        gtag('js', new Date());
        gtag('config', GA_ID);
    }

    // --- 文言 ---
    var TEXT = {
        ja: {
            msg: 'このサイトでは、アクセス状況の把握のため Google アナリティクス（Cookie）を利用します。同意いただいた場合のみ有効になります。',
            ok: '同意する',
            no: '使用しない',
            settings: 'Cookie設定',
            policy: 'プライバシーポリシー',
            url: '/privacy.html'
        },
        en: {
            msg: 'We use Google Analytics cookies to understand how this site is used. They are enabled only with your consent.',
            ok: 'Accept',
            no: 'Decline',
            settings: 'Cookie settings',
            policy: 'Privacy Policy',
            url: '/privacy-en.html'
        },
        fr: {
            msg: 'Nous utilisons des cookies Google Analytics pour comprendre l\'utilisation de ce site. Ils ne sont activés qu\'avec votre consentement.',
            ok: 'Accepter',
            no: 'Refuser',
            settings: 'Paramètres des cookies',
            policy: 'Politique de confidentialité',
            url: '/privacy-fr.html'
        }
    };
    function t() {
        var l = (document.documentElement.getAttribute('lang') || 'ja').slice(0, 2).toLowerCase();
        return TEXT[l] || TEXT.en;
    }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    // --- 同意撤回時に GA の Cookie を削除する ---
    function clearGACookies() {
        var host = location.hostname;
        var domains = ['', host, '.' + host];
        var parts = host.split('.');
        if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
        document.cookie.split(';').forEach(function (c) {
            var name = c.split('=')[0].trim();
            if (name.indexOf('_ga') !== 0) return;
            domains.forEach(function (d) {
                document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT' + (d ? '; domain=' + d : '');
            });
        });
    }

    // --- 同意バナー ---
    function removeBanner() {
        var b = document.getElementById('consent-banner');
        if (b && b.parentNode) b.parentNode.removeChild(b);
    }

    function showBanner() {
        if (document.getElementById('consent-banner')) return;
        var s = t();

        var box = document.createElement('div');
        box.id = 'consent-banner';
        box.className = 'consent-banner';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-live', 'polite');

        var p = document.createElement('p');
        p.className = 'consent-text';
        p.textContent = s.msg + ' ';

        var policy = document.createElement('a');
        policy.className = 'consent-link';
        policy.href = s.url;
        policy.textContent = s.policy;
        p.appendChild(policy);

        var actions = document.createElement('div');
        actions.className = 'consent-actions';

        var no = document.createElement('button');
        no.type = 'button';
        no.className = 'consent-btn';
        no.textContent = s.no;
        no.addEventListener('click', function () {
            writeConsent('denied');
            gtag('consent', 'update', { analytics_storage: 'denied' });
            clearGACookies();
            removeBanner();
            addSettingsLink();
        });

        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'consent-btn consent-btn-primary';
        ok.textContent = s.ok;
        ok.addEventListener('click', function () {
            writeConsent('granted');
            removeBanner();
            loadGA();
            addSettingsLink();
        });

        actions.appendChild(no);
        actions.appendChild(ok);
        box.appendChild(p);
        box.appendChild(actions);
        document.body.appendChild(box);
    }

    // --- フッターに「Cookie設定」（同意の撤回・変更用） ---
    function addSettingsLink() {
        if (document.getElementById('consent-settings-link')) return;
        var host = document.querySelector('.footer-inner');
        if (!host) return;
        var a = document.createElement('a');
        a.id = 'consent-settings-link';
        a.className = 'consent-settings-link';
        a.href = '#';
        a.textContent = t().settings;
        a.addEventListener('click', function (e) {
            e.preventDefault();
            try { localStorage.removeItem(CONSENT_KEY); } catch (err) { }
            showBanner();
        });
        host.appendChild(a);
    }

    // --- ストアボタンのクリック計測 ---
    function currentApp() {
        var seg = location.pathname.split('/').filter(function (v) { return v; });
        return seg.length ? seg[0] : 'top';
    }

    document.addEventListener('click', function (e) {
        var el = e.target;
        if (!el || typeof el.closest !== 'function') return;
        var a = el.closest('a[href]');
        if (!a) return;
        var href = a.href || '';
        var store = href.indexOf('play.google.com') > -1 ? 'google_play'
            : href.indexOf('apps.apple.com') > -1 ? 'app_store' : '';
        if (!store) return;
        gtag('event', 'store_click', {
            store: store,
            app: currentApp(),
            link_url: href
        });
    }, true);

    // --- 初期化 ---
    var consent = readConsent();
    if (consent === 'denied') {
        onReady(addSettingsLink);
    } else if (consent === 'granted' || !needsConsent()) {
        loadGA();
        onReady(addSettingsLink);
    } else {
        onReady(showBanner);
    }
})();
