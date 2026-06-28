(() => {
    // Revenge / Vendetta global API'lerini güvenli sekilde yakalıyoruz
    const { metro, patcher, plugin } = window.revenge || window.vendetta || {};

    // Eklentinin ana fonksiyonları
    function onLoad() {
        console.log("[Logar] Eklenti basariyla tetiklendi!");
    }

    function onUnload() {
        if (patcher) {
            patcher.unpatchAll();
        }
        console.log("[Logar] Eklenti deaktif edildi.");
    }

    // Revenge eklenti motorunun geri dönüs (export) bekledigi alan
    const pluginObject = {
        onLoad: onLoad,
        onUnload: onUnload
    };

    // Sistemi sisteme register ediyoruz (Revenge / Vendetta uyumlulugu)
    if (typeof module !== "undefined" && module.exports) {
        module.exports = pluginObject;
    } else {
        return pluginObject;
    }
})();
