// Revenge / Vendetta standart eklenti tanımı
const { metro, patcher, plugin } = window.revenge || window.vendetta || {};

function onLoad() {
    console.log("[Logar] Eklenti basariyla yuklendi!");
    
    // Revenge loglarına düssün diye test uyarısı
    if (metro) {
        try {
            const LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage");
            // Eklenti açıldığında sisteme sadece bir log düsmesi için bos bırakabiliriz
        } catch(e) {
            console.error(e);
        }
    }
}

function onUnload() {
    if (patcher) {
        patcher.unpatchAll();
    }
    console.log("[Logar] Eklenti devre disi birakildi.");
}

// Revenge'in eklentiyi taniyabilmesi için export yapısı
module.exports = {
    onLoad: onLoad,
    onUnload: onUnload
};
