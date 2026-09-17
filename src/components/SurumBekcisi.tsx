import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/surum";
import {
  SURUM_YOLU, KONTROL_ARALIGI_MS, surumuAyikla, yeniSurumVarMi,
} from "@/lib/surumKontrol";

/**
 * Açık sekme sunucudaki sürümün gerisinde kaldıysa haber verir.
 *
 * Kullanıcılar sekmeyi günlerce açık tutuyor ve yeni paket kurulduğunu
 * anlamıyorlardı. Burada zorla yenileme YOK: kullanıcı bir cevabın ortasında
 * olabilir, kararı ona bırakıyoruz.
 *
 * Ekranda hiçbir şey çizmiyor; yalnız yan etkisi var.
 */
export function SurumBekcisi() {
  /** Bir kez söylendi mi. Her kontrolde yeni bir bildirim üst üste yığılırdı. */
  const bildirildi = useRef(false);

  useEffect(() => {
    let iptal = false;

    const kontrolEt = async () => {
      if (iptal || bildirildi.current) return;
      try {
        // no-store VE sorgu parametresi: bazı vekiller no-store'u yok sayıyor
        // ve dosyanın kendisi önbellekten dönerse kontrolün hiçbir anlamı kalmaz.
        const yanit = await fetch(`${SURUM_YOLU}?t=${Date.now()}`, { cache: "no-store" });
        if (!yanit.ok) return;
        const uzak = surumuAyikla(await yanit.json());
        if (!yeniSurumVarMi(APP_VERSION, uzak)) return;

        bildirildi.current = true;
        toast("Yeni sürüm yayınlandı", {
          description: `Bu sekmede v${APP_VERSION} çalışıyor, sunucuda v${uzak} var. Yenileyerek güncelleyebilirsiniz.`,
          duration: Infinity,
          action: { label: "Yenile", onClick: () => window.location.reload() },
        });
      } catch {
        // Çevrimdışı, dosya yok (geliştirme) ya da gövde bozuk — sessizce geç.
        // Sürüm kontrolü uğruna kullanıcıya hata göstermenin anlamı yok.
      }
    };

    kontrolEt();
    const zamanlayici = window.setInterval(kontrolEt, KONTROL_ARALIGI_MS);
    // Sekmeye geri dönüldüğünde de bak: bilgisayarı uyandıran kullanıcı
    // aralığın dolmasını beklemesin.
    const gorunurlukDegisti = () => {
      if (document.visibilityState === "visible") kontrolEt();
    };
    document.addEventListener("visibilitychange", gorunurlukDegisti);

    return () => {
      iptal = true;
      window.clearInterval(zamanlayici);
      document.removeEventListener("visibilitychange", gorunurlukDegisti);
    };
  }, []);

  return null;
}
