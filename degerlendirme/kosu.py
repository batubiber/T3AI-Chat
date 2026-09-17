#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
T3AI harness değerlendirmesi — gerçek modele karşı.

Ölçtüğü şey: modelin ARAÇ ÇAĞIRMA kararı. "Bana Word ver" deyince belge_uret
çağrılıyor mu, "bu belge ne anlatıyor" deyince çağrılMIYOR mu, ekli belgede
"yazım hatalarını düzelt" deyince belge_duzenle geliyor mu.

Neden bu: bu kararlar v2.40 ve v2.43'te ayrı kapı modellerinden ANA MODELE
taşındı. Ünite testlerimiz araç tanımlarının şeklini kilitliyor ama modelin o
tanımlarla ne yaptığını kilitleyemiyor — onu bugüne kadar elle test ediyorduk.

Ölçüt nesnel: hakem model yok, yalnız "araç çağrıldı mı, hangisi, hangi
argümanla" bakılıyor.

Bağımlılık YOK — yalnız Python standart kütüphanesi. Windows'ta `pip install`
gerekmez.

Kullanım (Windows PowerShell / cmd):

    python kosu.py --url https://t3ai.example.com --model glm-5.2 -k

    python kosu.py --url https://t3ai.example.com --model gemma-4-31b ^
        --yol /vllm-8000/v1/chat/completions -k

Seçenekler için: python kosu.py --help
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

# Windows konsolu varsayılan olarak cp857/cp1254 kullanıyor ve Türkçe karakter
# basmak UnicodeEncodeError atıyor. Betiğin ilk işi bunu kapatmak.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

BURASI = os.path.dirname(os.path.abspath(__file__))

# Gateway reddetme kipinde; bu başlık olmadan istek 400 dönüyor. Değer
# uygulamada konuşma kimliğinden türetiliyor, burada sabit: aynı anahtar
# değerlendirme boyunca aynı vLLM düğümüne gider ve prefix cache tutar.
OTURUM_BASLIGI = "X-Claude-Code-Session-Id"


def kaynagi_oku(ad):
    with open(os.path.join(BURASI, ad), "r", encoding="utf-8") as f:
        return json.load(f)


def istek_at(url, govde, baslik, dogrula, zaman_asimi):
    veri = json.dumps(govde, ensure_ascii=False).encode("utf-8")
    istek = urllib.request.Request(url, data=veri, method="POST")
    for k, v in baslik.items():
        istek.add_header(k, v)
    baglam = None
    if url.startswith("https") and not dogrula:
        baglam = ssl.create_default_context()
        baglam.check_hostname = False
        baglam.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(istek, timeout=zaman_asimi, context=baglam) as y:
        return json.loads(y.read().decode("utf-8"))


def cagriyi_coz(yanit):
    """Yanıttan (araç_adı, argümanlar) çıkarır; araç çağrılmadıysa (None, {})."""
    try:
        mesaj = yanit["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return None, {}
    cagrilar = mesaj.get("tool_calls") or []
    if not cagrilar:
        return None, {}
    fn = cagrilar[0].get("function", {})
    ad = fn.get("name")
    try:
        argumanlar = json.loads(fn.get("arguments") or "{}")
    except (ValueError, TypeError):
        argumanlar = {}
    return ad, argumanlar


def vakayi_degerlendir(beklenen, arac, argumanlar):
    """(gecti, sebep) — sebep yalnız kaldıysa dolu."""
    beklenen_arac = beklenen.get("arac")
    if beklenen_arac is None:
        if arac is None:
            return True, ""
        return False, "araç çağrılmamalıydı, %s çağrıldı" % arac
    if arac != beklenen_arac:
        return False, "%s bekleniyordu, %s geldi" % (beklenen_arac, arac or "hiç araç yok")
    for anahtar, deger in (beklenen.get("argumanlar") or {}).items():
        if argumanlar.get(anahtar) != deger:
            return False, "%s=%s bekleniyordu, %s geldi" % (
                anahtar, deger, argumanlar.get(anahtar))
    return True, ""


def main():
    a = argparse.ArgumentParser(description="T3AI harness değerlendirmesi")
    a.add_argument("--url", default="https://t3ai.example.com",
                   help="Sunucu kökü (varsayılan: https://t3ai.example.com)")
    a.add_argument("--yol", default="/vllm-8001/v1/chat/completions",
                   help="Model yolu. GLM: /vllm-8001/..., Gemma: /vllm-8000/...")
    a.add_argument("--model", default="glm-5.2", help="model adı")
    a.add_argument("--tekrar", type=int, default=3,
                   help="Her vaka kaç kez koşsun (varsayılan 3). Araç çağırma "
                        "olasılıksal; tek koşu yanıltıcı olur.")
    a.add_argument("--sicaklik", type=float, default=0.6, help="temperature")
    a.add_argument("--zaman-asimi", type=int, default=120, help="saniye")
    a.add_argument("--oturum", default="degerlendirme-sabit-anahtar",
                   help="Oturum başlığı değeri")
    a.add_argument("--vaka", default=None, help="Yalnız bu id'li vakayı koş")
    a.add_argument("-k", "--guvensiz", action="store_true",
                   help="TLS sertifikasını doğrulama (kendi imzalı sertifika)")
    a.add_argument("--cikti", default="sonuc.json", help="Sonuç dosyası")
    s = a.parse_args()

    araclar = kaynagi_oku("araclar.json")
    veri = kaynagi_oku("vakalar.json")
    vakalar = veri["vakalar"]
    if s.vaka:
        vakalar = [v for v in vakalar if v["id"] == s.vaka]
        if not vakalar:
            print("Böyle bir vaka yok: %s" % s.vaka)
            return 2

    url = s.url.rstrip("/") + s.yol
    baslik = {"Content-Type": "application/json", OTURUM_BASLIGI: s.oturum}

    print("Sunucu : %s" % url)
    print("Model  : %s   tekrar: %d   sıcaklık: %s" % (s.model, s.tekrar, s.sicaklik))
    print("Vaka   : %d\n" % len(vakalar))

    sonuclar = []
    toplam_gecen = 0
    baslangic = time.time()

    for v in vakalar:
        secili = [araclar[ad] for ad in v["araclar"]]
        govde = {
            "model": s.model,
            "messages": v["mesajlar"],
            "tools": secili,
            "temperature": s.sicaklik,
            "max_tokens": 512,
            "stream": False,
        }
        gecen = 0
        sebepler = []
        for _ in range(s.tekrar):
            try:
                yanit = istek_at(url, govde, baslik, not s.guvensiz, s.zaman_asimi)
            except urllib.error.HTTPError as e:
                sebepler.append("HTTP %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:160]))
                continue
            except Exception as e:  # ağ, TLS, zaman aşımı
                sebepler.append("%s: %s" % (type(e).__name__, e))
                continue
            arac, argumanlar = cagriyi_coz(yanit)
            ok, sebep = vakayi_degerlendir(v["beklenen"], arac, argumanlar)
            if ok:
                gecen += 1
            else:
                sebepler.append(sebep)

        tam = gecen == s.tekrar
        if tam:
            toplam_gecen += 1
        isaret = "GECTI" if tam else ("KISMI" if gecen else "KALDI")
        print("[%-5s] %-22s %d/%d  %s" % (
            isaret, v["id"], gecen, s.tekrar,
            "" if tam else "| " + "; ".join(dict.fromkeys(sebepler))[:120]))
        sonuclar.append({
            "id": v["id"], "aciklama": v["aciklama"], "gecen": gecen,
            "tekrar": s.tekrar, "tam": tam, "sebepler": list(dict.fromkeys(sebepler)),
        })

    sure = time.time() - baslangic
    print("\n%d/%d vaka TAM geçti  (%.0f sn)" % (toplam_gecen, len(vakalar), sure))

    with open(os.path.join(BURASI, s.cikti), "w", encoding="utf-8") as f:
        json.dump({
            "model": s.model, "url": url, "tekrar": s.tekrar,
            "sicaklik": s.sicaklik, "sure_sn": round(sure),
            "tam_gecen": toplam_gecen, "vaka_sayisi": len(vakalar),
            "sonuclar": sonuclar,
        }, f, ensure_ascii=False, indent=2)
    print("Ayrıntı: %s" % os.path.join(BURASI, s.cikti))

    return 0 if toplam_gecen == len(vakalar) else 1


if __name__ == "__main__":
    sys.exit(main())
