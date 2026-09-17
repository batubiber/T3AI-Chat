# Harness değerlendirme seti

Modelin **araç çağırma kararını** gerçek modele karşı ölçer: "Word olarak ver"
deyince `belge_uret` çağrılıyor mu, "bu belge ne anlatıyor" deyince
çağrılMIYOR mu, ekli belgede "yazım hatalarını düzelt" deyince `belge_duzenle`
geliyor mu.

Bu kararlar v2.40 ve v2.43'te ayrı kapı modellerinden ana modele taşındı.
Ünite testleri araç tanımlarının şeklini kilitliyor ama **modelin o tanımlarla
ne yaptığını** kilitleyemiyor — o bugüne kadar elle test ediliyordu.

Ölçüt nesnel: hakem model yok, yalnız "araç çağrıldı mı, hangisi, hangi
argümanla" bakılıyor.

## Çalıştırma (Windows)

Python 3.7+ yeterli, **kurulum gerekmez** — yalnız standart kütüphane
kullanılıyor. `degerlendirme` klasörünü hedef makineye kopyala:

```
python kosu.py --url https://t3ai.example.com --model glm-5.2 -k
```

Gemma için model yolu farklı:

```
python kosu.py --url https://t3ai.example.com --model gemma-4-31b --yol /vllm-8000/v1/chat/completions -k
```

`-k` kendi imzalı sertifika için; sertifika geçerliyse gerekmez.

Tek bir vakayı koşmak için: `--vaka duzenle-yazim`
Tekrar sayısını değiştirmek için: `--tekrar 5`

## Çıktı

```
[GECTI] uret-word              3/3
[KALDI] soru-sayim             0/3  | araç çağrılmamalıydı, belge_uret çağrıldı

11/12 vaka TAM geçti  (48 sn)
```

Ayrıntı `sonuc.json`'a yazılır. Hepsi geçerse çıkış kodu 0, aksi hâlde 1 —
istersen bir toplu iş dosyasından koşup sonucu kontrol edebilirsin.

## Neden her vaka birkaç kez koşuyor

Araç çağırma olasılıksal: sıcaklık 0 değil ve aynı istek bazen farklı
sonuçlanıyor. Tek koşu yanıltıcı olur. Varsayılan 3 tekrar ve bir vaka ancak
**hepsinde** geçerse "GECTI" sayılıyor; 2/3 gibi bir sonuç "bazen çalışıyor"
demektir ve gerçek bir kırılganlığı gösterir.

## Vakalar ne kapsıyor

| grup | ne ölçüyor |
|---|---|
| `uret-*` | Word/Excel/sunum isteği doğru türle üretmeye gidiyor mu; dolaylı ifade ("bunu rapor hâline getir") yakalanıyor mu |
| `duzenle-*` | Ekli belgede değişiklik isteği düzenlemeye gidiyor mu; "başlıkları da büyüt" gibi DEVAM cümleleri yakalanıyor mu |
| `soru-*` | Belge hakkında SORU sorulduğunda araç çağrılMIYOR mu — yanlış tetiklenirse kullanıcı cevap yerine panel görür |
| `sohbet-*` | Sıradan sohbette hiçbir araç çağrılmıyor mu |
| `ekli-belgeden-uret` | Belge ekliyken "bundan ayrı bir sunum çıkar" denince düzenleme değil ÜRETME seçiliyor mu |
| `hafiza-*` | Kalıcı bir kural proje hafızasına önerilyor mu; tek seferlik istek ve sıradan soru için önerilMİYOR mu |

## Araç tanımları nereden geliyor

`araclar.json`, uygulamanın gerçekten gönderdiği tanımların kopyası. Kopya
bayatlarsa set artık gönderdiğimiz şeyi ölçmez — "yeşil ama yanlış şeyi test
ediyor" durumu, testin hiç olmamasından kötüdür. Bu yüzden bir ünite testi
kopyayı canlı tanımlarla karşılaştırıyor; tanımlar değişince test kırılır.

Kopyayı tazelemek için (proje kökünde):

```
ARACLARI_GUNCELLE=1 npx vitest run degerlendirmeAraclari
```

## Bilerek dışarıda bırakılanlar

- **Sistem promptu.** Vakalar `.env`'deki sistem promptunu kullanmıyor; ölçülen
  şey araç tanımlarının kendi başına yeterince yönlendirici olup olmadığı.
  Prompt dağıtımdan dağıtıma değişiyor, sete gömülseydi set yanlış şeyi
  kilitlerdi.
- **Cevabın kalitesi.** Üretilen belgenin içeriği ölçülmüyor; ölçülen şey
  kararın kendisi. İçerik kalitesi hakem model ister, o ayrı bir iş.
- **Akış.** İstekler `stream: false` gidiyor; araç çağırma kararı akıştan
  bağımsız ve akışsız yanıtı ayrıştırmak çok daha basit.
