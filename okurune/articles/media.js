// 楽天リンクのアフィリエイト化。
// RAKUTEN_AFFILIATE_ID を設定すると、data-rakuten の付いたリンクを
// hb.afl.rakuten.co.jp 経由に書き換える。空のままなら素の楽天リンクのまま動く
(function () {
    var RAKUTEN_AFFILIATE_ID = '';
    if (!RAKUTEN_AFFILIATE_ID) return;
    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('a[data-rakuten]').forEach(function (a) {
            var url = encodeURIComponent(a.href);
            a.href = 'https://hb.afl.rakuten.co.jp/hgc/' + RAKUTEN_AFFILIATE_ID +
                '/?pc=' + url + '&m=' + url;
        });
    });
})();
