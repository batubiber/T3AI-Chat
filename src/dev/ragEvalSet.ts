/**
 * RAG Eval Fixture Set — TAMAMEN KURGUSAL içerik (gerçek ürün verisi YASAK).
 * "VEGA" ürün ailesi, dense-vs-hibrit retrieval'ı ölçmek için uydurulmuş bir
 * insansız hava aracı senaryosudur. Gerçek ürünlerle hiçbir ilişkisi yoktur.
 *
 * 5 doküman:
 *  - vega-2-spec.md    : VEGA-2 teknik özellikleri (parça kodları + sayısal değerler)
 *  - vega-1-spec.md    : VEGA-1 teknik özellikleri (VEGA-2 ile kasıtlı benzer yapı —
 *                        dense'in bilinen zaafı olan model karışmasını test eder)
 *  - bakim-talimati.md : markdown tablo içeren bakım talimatı
 *  - envanter.md       : satır bazlı (csv benzeri) envanter kayıtları
 *  - genel-sss.md      : paraphrase-friendly genel SSS (soru-cevap düzyazı)
 *
 * __ragEval harness'i (bkz. src/dev/ragEval.ts) bu dokümanları geçici bir projeye
 * indeksler ve EVAL_CASES üzerinden dense-only / hibrit hit@k karşılaştırması yapar.
 */

export interface EvalDoc {
  name: string;
  content: string;
}

export const EVAL_DOCS: EvalDoc[] = [
  {
    name: 'vega-2-spec.md',
    content: `# VEGA-2 Teknik Özellikleri

## Genel Tanım
VEGA-2, uzun menzilli gözlem ve keşif görevleri için geliştirilmiş kurgusal bir insansız hava aracıdır. VEGA ailesinin ikinci neslidir ve VEGA-1 modeline göre daha güçlü bir motora, daha yüksek bir azami irtifaya ve genişletilmiş bir avionik pakete sahiptir. Bu belge yalnızca eğitim ve test amaçlı kurgusal verilerden oluşur; gerçek bir ürünü tarif etmez.

## Motor ve Güç Sistemi
VEGA-2 motorunun parça kodu PRT-4412'dir. Bu motor dört silindirli, turboşarjlı bir içten yanmalı ünitedir ve azami 160 beygir güç üretir. PRT-4412 kodlu motor ünitesi yalnızca VEGA-2 gövdesine uygundur; VEGA-1'in motor yuvasıyla mekanik olarak uyumlu değildir.

## Uçuş Performansı
VEGA-2'nin azami irtifa değeri 41.000 ft'dir. Azami menzili 300 kilometre, azami yatay hızı 220 km/saat'tir. Azami uçuş süresi 18 saattir. Servis ağırlığı 730 kg, azami kalkış ağırlığı ise 950 kg'dır.

## Avionik Sistemler
VEGA-2'nin otopilot kontrol kartı PRT-9930 kod numarasıyla üretilir. PRT-9930, uçuş kontrol yüzeylerini otomatik olarak yönetir; sinyal kaybı durumunda önceden tanımlı güvenli rotaya dönerek yedek moda geçer. Kart çift yedekli güç kaynağıyla beslenir.

## Gövde ve Boyutlar
Kanat açıklığı 10,2 metre, gövde uzunluğu 6,5 metredir. Gövde karbon fiber kompozit malzemeden üretilir ve radar kesit alanını küçültecek şekilde tasarlanmıştır.

## Kullanım Senaryoları
VEGA-2, genellikle uzun süreli sınır gözetimi ve tarımsal alan taraması gibi görevlerde kullanılan kurgusal bir platformdur. Elektro-optik kamera ve kızılötesi sensör taşıyabilen modüler bir yük bölmesine sahiptir. Yer istasyonundan gerçek zamanlı görüntü aktarımı yapabilir.
`,
  },
  {
    name: 'vega-1-spec.md',
    content: `# VEGA-1 Teknik Özellikleri

## Genel Tanım
VEGA-1, VEGA ailesinin ilk neslidir ve temel gözlem görevleri için tasarlanmış kurgusal bir insansız hava aracıdır. Daha sonra geliştirilen VEGA-2'ye kıyasla daha hafif bir gövdeye ve daha mütevazı bir motor gücüne sahiptir. Bu belge yalnızca eğitim ve test amaçlı kurgusal verilerden oluşur; gerçek bir ürünü tarif etmez.

## Motor ve Güç Sistemi
VEGA-1 motorunun parça kodu PRT-3301'dir. Bu motor tek silindirli, atmosferik emişli bir içten yanmalı ünitedir ve azami 95 beygir güç üretir. PRT-3301 kodlu motor ünitesi yalnızca VEGA-1 gövdesine uygundur ve VEGA-2'nin motor yuvasına takılamaz.

## Uçuş Performansı
VEGA-1'in azami irtifa değeri 34.500 ft'dir. Azami menzili 260 kilometre, azami yatay hızı 195 km/saat'tir. Azami uçuş süresi 14 saattir. Servis ağırlığı 610 kg, azami kalkış ağırlığı ise 780 kg'dır.

## Avionik Sistemler
VEGA-1'in otopilot kontrol kartı PRT-2205 kod numarasıyla üretilir. PRT-2205, uçuş kontrol yüzeylerini otomatik olarak yönetir; ancak VEGA-2 modelindeki otopilot kartının aksine çift yedekli güç kaynağı bulunmaz, tek hat üzerinden beslenir.

## Gövde ve Boyutlar
Kanat açıklığı 8,6 metre, gövde uzunluğu 5,1 metredir. Gövde cam elyaf takviyeli kompozit malzemeden üretilir.

## Kullanım Senaryoları
VEGA-1, temel eğitim uçuşları ve kısa menzilli gözetleme görevleri için tercih edilen kurgusal bir platformdur. Tek kamera taşıyan sabit bir yük bölmesine sahiptir ve genellikle yeni operatörlerin eğitiminde kullanılır.
`,
  },
  {
    name: 'bakim-talimati.md',
    content: `# VEGA Ailesi Bakım Talimatı

## Genel Bakım Kuralları
Bu talimat, VEGA-1 ve VEGA-2 modellerinin periyodik bakımında kullanılacak parça kodlarını ve bakım aralıklarını listeler. Bakım aralığı, ilgili parçanın kaç saatlik uçuş sonrasında kontrolden geçirilmesi gerektiğini; değişim ömrü ise parçanın azami kullanım süresini gösterir. Belirtilen süreler aşılmadan önce parça değiştirilmelidir.

## Parça Bakım Tablosu

| Parça Kodu | Parça Adı | Bakım Aralığı | Değişim Ömrü |
|---|---|---|---|
| PRT-4412 | VEGA-2 Motor Türbin Ünitesi | 150 saat | 1200 saat |
| PRT-3301 | VEGA-1 Motor Türbin Ünitesi | 120 saat | 1000 saat |
| PRT-9930 | VEGA-2 Otopilot Kontrol Kartı | 300 saat | 2500 saat |
| PRT-2205 | VEGA-1 Otopilot Kontrol Kartı | 280 saat | 2400 saat |
| PRT-5500 | Yakıt Pompası Ünitesi | 90 saat | 800 saat |
| PRT-7788 | Kanat Sensör Ünitesi | 60 saat | 500 saat |

## Yakıt Pompası Bakımı
PRT-5500 kodlu yakıt pompası ünitesi her iki VEGA modelinde de ortak kullanılır. Bakım aralığı 90 saattir; bu sürede pompa filtresi temizlenmeli ve basınç testi yapılmalıdır.

## Kanat Sensör Ünitesi Bakımı
PRT-7788 kodlu kanat sensör ünitesi, kanat üzerindeki buzlanma ve titreşim verilerini toplar. Değişim ömrü 500 saattir; bu sürenin sonunda sensör kalibrasyonu bozulabileceğinden ünite değiştirilmelidir.

## Bakım Personeli Uyarıları
Bakım kayıtları her uçuştan sonra dijital bakım defterine işlenmelidir. Kayıt eksikliği durumunda ilgili parçanın bir sonraki bakım tarihi güvenlik payıyla önceye çekilir. Yetkisiz personel motor ve otopilot ünitelerine müdahale etmemelidir.
`,
  },
  {
    name: 'envanter.md',
    content: `# VEGA Yedek Parça Envanteri

## Depo Kayıtları
Aşağıdaki liste, VEGA-1 ve VEGA-2 modellerine ait tali yedek parçaların güncel depo stok durumunu satır satır gösterir. Her satırda parça kodu, parça adı, stok adedi ve depo konumu belirtilir. Motor ve otopilot ana üniteleri bu envanterin kapsamı dışındadır; bunlar için bakım talimatındaki parça tablosuna bakınız.

PRT-6010 - Kanat Kirişi - Stok: 34 adet - Depo: B-3
PRT-8845 - İniş Takımı Amortisörü - Stok: 12 adet - Depo: C-7
PRT-1123 - GPS Alıcı Modülü - Stok: 56 adet - Depo: A-2
PRT-9401 - Telemetri Vericisi - Stok: 21 adet - Depo: A-9
PRT-2290 - Kanat Ucu İşaret Lambası - Stok: 40 adet - Depo: B-4

## Kritik Stok Uyarısı
PRT-8845 kodlu iniş takımı amortisörü için stok seviyesi kritik eşiğin yakınındadır; yeniden sipariş eşiği 15 adettir. PRT-9401 kodlu telemetri vericisi için yeniden sipariş eşiği 10 adettir.

## Depo Konumları
A blok elektronik parçaları, B blok gövde parçalarını, C blok iniş takımı parçalarını, D blok motor parçalarını barındırır. Sayım işlemleri her ayın ilk haftasında tekrarlanır ve tutanak depo sorumlusu tarafından imzalanır.

## Sipariş Süreci
Stok seviyesi yeniden sipariş eşiğinin altına düşen bir parça için tedarik birimine otomatik bildirim gönderilir. Tedarik birimi, onay sürecinin ardından siparişi tedarikçiye iletir ve teslimat takibini üstlenir. Acil ihtiyaç durumunda depo sorumlusu, tedarik birimini aramadan önce yedek parça havuzundaki diğer depo bloklarını da kontrol etmelidir.

## Envanter Sayım Kuralları
Her parça girişi ve çıkışı, sayım tutanağına parça kodu ve tarih bilgisiyle işlenir. Elektronik parçalar nem oranı düşük dolaplarda, gövde parçaları ise raflı düzende saklanır. Envanter yazılımı, stok adedi sıfıra düştüğünde otomatik olarak kırmızı uyarı üretir.
`,
  },
  {
    name: 'genel-sss.md',
    content: `# VEGA Ailesi Sıkça Sorulan Sorular

## VEGA-2 Ne Kadar Yükseğe Çıkabilir?
Kullanıcılar sıklıkla VEGA-2'nin ne kadar yükseğe çıkabildiğini merak eder. VEGA-2'nin azami irtifa değeri, VEGA ailesinin en yüksek irtifa kapasitesidir ve teknik özellik belgesinde ayrıntılı biçimde listelenmiştir.

## VEGA Sistemleri Ne Kadar Ağırdır?
VEGA-1 ve VEGA-2 arasındaki ağırlık farkı sıkça sorulan bir konudur. VEGA-2 daha ağır bir sistemdir; VEGA-1 ise belirgin şekilde daha hafiftir. Kesin kilogram değerleri teknik özellik tablosunda yer alır.

## Motor Arızalanırsa Ne Yapılmalı?
Uçuş sırasında motor arızası şüphesi oluşursa görev derhal sonlandırılmalı ve araç en yakın iniş noktasına yönlendirilmelidir. Yer ekibi, motor ünitesini sökmeden önce ilgili parça kodunu ve uçuş saatini kayıt altına almalıdır.

## Bakım Ne Sıklıkla Yapılmalıdır?
Bakım sıklığı parçadan parçaya değişir ve periyodik olarak takip edilmelidir. Genel kural olarak, yüksek yük altında çalışan parçalar (motor, otopilot kartı gibi) daha sık kontrolden geçirilirken, yardımcı üniteler daha uzun aralıklarla kontrol edilir.

## Yedek Parça Ne Kadar Sürede Temin Edilir?
Depoda bulunmayan bir parça için tedarik süreci genellikle birkaç gün sürer. Kritik stok seviyesine düşen parçalar önceden belirlenen eşik değerlere göre otomatik olarak yeniden sipariş edilir.

## VEGA Ailesinde Kaç Model Bulunur?
Şu anda VEGA ailesinde iki model bulunur: ilk nesil VEGA-1 ve daha yüksek performanslı ikinci nesil VEGA-2. İki model de aynı yer istasyonu yazılımıyla uyumludur.
`,
  },

  // ——— Genişletilmiş korpus (6 aile × 5 belge) ———
  {
    name: 'numune-88a-raporu.md',
    content: `# Deney Raporu — NUM-88-A

## Numune Tanımı
NUM-88-A, TALVİN Malzeme Deney Laboratuvarı'nda incelenen kurgusal bir alüminyum-lityum levha numunesidir. Levha kalınlığı 3,0 mm, ölçüm boyu 50 mm'dir. Numune, döküm partisi DKM-2 içinden alınmış ve deney öncesinde 210 °C'de sıcak yaşlandırma işlemine tabi tutulmuştur.

## Deney Düzeni ve Yöntem
Ölçümler 23 °C ortam sıcaklığında ve %48 bağıl nemde yapıldı. Çekme hızı 2 mm/dak olarak sabitlendi. Yorulma bacağında Zilbern çevrim indisi kullanıldı; bu indis, yük genliğinin çevrim başına düşen enerji kaybına oranını verir. Rapor formu FRM-DK-217 sürümüyle doldurulmuştur.

## Ölçüm Sonuçları
- Akma dayanımı: 412 MPa
- Çekme dayanımı: 618 MPa
- Kopma uzaması: %12,4
- Vickers sertliği: 187 HV
- Yorulma ömrü: 41.000 çevrim

## Sapmalar ve Notlar
Üçüncü tekrarda kuvvet hücresi okuması dört saniye boyunca dalgalandı; ilgili tekrar geçersiz sayılıp yenilendi. Kırılma bölgesinde gevrek kırılma yüzeyi gözlendi.

## Değerlendirme
Numune, partisi için tanımlı alt sınırın üzerinde kaldı. Yaşlandırma işleminin sertliği artırdığı, buna karşılık süneklikte bir miktar kayba yol açtığı görülmektedir.
`,
  },
  {
    name: 'numune-88b-raporu.md',
    content: `# Deney Raporu — NUM-88-B

## Numune Tanımı
NUM-88-B, TALVİN Malzeme Deney Laboratuvarı'nda incelenen kurgusal bir alüminyum-lityum levha numunesidir. Levha kalınlığı 3,2 mm, ölçüm boyu 50 mm'dir. Numune, aynı döküm partisi DKM-2 içinden alınmış, ancak sıcak yaşlandırma uygulanmadan işlem görmemiş halde denenmiştir.

## Deney Düzeni ve Yöntem
Ölçümler 23 °C ortam sıcaklığında ve %48 bağıl nemde yapıldı. Çekme hızı 2 mm/dak olarak sabitlendi. Kesit incelemesinde Perkine tanecik sayımı uygulandı; yöntem, kesit görüntüsündeki tanecikleri boyut sınıflarına ayırarak ortalama tane çapını verir. Rapor formu FRM-DK-218 sürümüyle doldurulmuştur.

## Ölçüm Sonuçları
- Akma dayanımı: 418 MPa
- Çekme dayanımı: 614 MPa
- Kopma uzaması: %12,8
- Vickers sertliği: 193 HV
- Yorulma ömrü: 41.500 çevrim

## Sapmalar ve Notlar
Kayda değer bir sapma oluşmadı; üç tekrarın üçü de geçerli sayıldı. Kırılma bölgesinde sünek kırılma yüzeyi gözlendi.

## Değerlendirme
İşlem görmemiş numune, yaşlandırılmış eşdeğerine göre daha yüksek bir akma değeri verdi. Bu sonuç, partinin dökümden gelen tane yapısının beklenenden düzgün olduğuna işaret eder.
`,
  },
  {
    name: 'numune-91a-raporu.md',
    content: `# Deney Raporu — NUM-91-A

## Numune Tanımı
NUM-91-A, TALVİN Malzeme Deney Laboratuvarı'nda incelenen kurgusal bir magnezyum alaşımı levha numunesidir. Levha kalınlığı 3,0 mm, ölçüm boyu 50 mm'dir. Numune eloksal kaplamalı olarak teslim alınmış ve kaplama sökülmeden denenmiştir.

## Deney Düzeni ve Yöntem
Ölçümler 23 °C ortam sıcaklığında ve %48 bağıl nemde yapıldı. Çekme hızı 2 mm/dak olarak sabitlendi. Korozyon bacağı TÜBEK-4 tuz sisi protokolüne göre yürütüldü; protokol, numuneyi beş saatlik püskürtme ve üç saatlik kuruma evrelerine dönüşümlü olarak sokar. Rapor formu FRM-DK-219 sürümüyle doldurulmuştur.

## Ölçüm Sonuçları
- Akma dayanımı: 421 MPa
- Çekme dayanımı: 619 MPa
- Kopma uzaması: %11,9
- Vickers sertliği: 191 HV
- Yorulma ömrü: 14.000 çevrim

## Sapmalar ve Notlar
Korozyon evresi sonunda kaplamanın pul pul dökülmesi gözlenmedi; yalnız iki noktada mat leke oluştu. Kırılma bölgesi karma nitelikteydi.

## Değerlendirme
Kaplama, tuz sisi maruziyeti boyunca bütünlüğünü korudu. Yorulma ömrünün düşük çıkması, kaplama altındaki gözenekliliğe bağlanmaktadır.
`,
  },
  {
    name: 'numune-91b-raporu.md',
    content: `# Deney Raporu — NUM-91-B

## Numune Tanımı
NUM-91-B, TALVİN Malzeme Deney Laboratuvarı'nda incelenen kurgusal bir magnezyum alaşımı levha numunesidir. Levha kalınlığı 3,2 mm, ölçüm boyu 50 mm'dir. Numune aynı levhadan kesilmiş, ancak kaplamasız yüzeyle denenmiştir.

## Deney Düzeni ve Yöntem
Ölçümler 23 °C ortam sıcaklığında ve %48 bağıl nemde yapıldı. Çekme hızı 2 mm/dak olarak sabitlendi. Sürünme bacağında mavruk sabit yük düzeni kurularak numune 96 saat boyunca değişmeyen bir çekme yükü altında tutuldu. Rapor formu FRM-DK-220 sürümüyle doldurulmuştur.

## Ölçüm Sonuçları
- Akma dayanımı: 409 MPa
- Çekme dayanımı: 616 MPa
- Kopma uzaması: %13,1
- Vickers sertliği: 184 HV
- Yorulma ömrü: 40.500 çevrim

## Sapmalar ve Notlar
Sürünme evresinin altmışıncı saatinde oda sıcaklığı kısa süreliğine 26 °C'ye çıktı; sapma tutanağa işlendi. Kırılma bölgesi belirgin biçimde girintiliydi.

## Değerlendirme
Kaplamasız numune, kaplamalı eşdeğerinden daha uzun bir yorulma ömrü verdi. Bu fark, kaplama işleminin yüzeyde çentik etkisi yarattığı savını destekler.
`,
  },
  {
    name: 'olcum-el-kitabi.md',
    content: `# TALVİN Ölçüm El Kitabı

## Kapsam
Bu el kitabı, laboratuvarda yürütülen çekme deneylerinin ortak kurallarını özetler. Her numuneye özgü sayılar tek tek deney raporlarında yer alır; burada yalnızca her rapora uygulanan ortak düzen anlatılır.

## Düzeneğin Bakımı
Terazi ve kuvvet hücresi, her üç ayda bir izlenebilir referans ağırlıklarla doğrulanır. Doğrulama kaydı tutulmadan yeni bir deneye başlanmaz. Kuvvet hücresinin okuması iki ardışık doğrulamada da kayarsa hücre servise gönderilir.

## Beklenmedik Bulgular
Kabul sınırlarının ötesine geçen bir bulgu, aynı partiden ikinci bir parçayla yinelenir ve baş uzmana bildirilir. İki denemenin de kabul aralığını aşması, partinin tümünün karantinaya alınması anlamına gelir.

## Kayıt Düzeni
Her rapor, ilgili form sürümüyle birlikte saklanır. Formun sürümü değiştiğinde eski raporlar geriye dönük olarak güncellenmez; karşılaştırma yapılırken sürüm farkı hesaba katılır.

## Saklama Koşulları
Denenmeyi bekleyen parçalar, nemden korunacak biçimde kapalı kaplarda ve ışık almayan bir dolapta bekletilir. Bekleme süresi altı ayı aşan parçalar yeniden ölçülmeden kullanılmaz.
`,
  },
  {
    name: 'egitim-programi-1.md',
    content: `# Modül EGT-1A — Temel Alan Gözlemi

## Amaç ve Kapsam
EGT-1A, MERİDYEN Saha Yetkinlik Programı'nın giriş basamağıdır ve katılımcıya gözlem verisi toplamanın temel kurallarını kazandırır. Bu belge tamamen kurgusaldır; gerçek bir kurumun eğitim içeriğini tarif etmez.

## Süre ve Ders Dağılımı
Modülün toplam süresi 40 saattir. Bunun 24 saati teorik anlatım, 16 saati uygulama atölyesidir. Uygulama atölyeleri en çok 12 katılımcılık gruplarla yürütülür.

## Kazandırılan Yetkinlik
YTK-118 kodlu "katmanlı iz okuma" yetkinliği bu modülde kazandırılır. Katılımcı, gözlem defterini standart düzende doldurmayı ve ham notu raporlanabilir kayda çevirmeyi öğrenir.

## Öğretim Yöntemi
Teorik anlatımda sarmalak tekrar yöntemi uygulanır: her konu, bir sonraki oturumun ilk çeyreğinde kısa bir tekrar turuyla yeniden ele alınır. Sarmalak tekrar yöntemi programın yalnızca bu basamağında kullanılır.

## Ölçme ve Değerlendirme
Modül sonu sınavı SNV-4412 formu üzerinden yapılır ve tek oturumda tamamlanır. Başarı eşiği 100 puan üzerinden 65 puandır.

## Devam ve Ön Koşul
Devam şartı %80'dir. Modülün ön koşulu yoktur; programa yeni katılan herkes doğrudan bu modülle başlar.
`,
  },
  {
    name: 'egitim-programi-2.md',
    content: `# Modül EGT-1B — İleri Alan Gözlemi

## Amaç ve Kapsam
EGT-1B, MERİDYEN Saha Yetkinlik Programı'nın ikinci basamağıdır ve katılımcıya değişken hava koşullarında gözlem verisi toplamayı kazandırır. Bu belge tamamen kurgusaldır; gerçek bir kurumun eğitim içeriğini tarif etmez.

## Süre ve Ders Dağılımı
Modülün toplam süresi 44 saattir. Bunun 26 saati teorik anlatım, 18 saati uygulama atölyesidir. Uygulama atölyeleri en çok 10 katılımcılık gruplarla yürütülür.

## Kazandırılan Yetkinlik
YTK-119 kodlu "gecikmeli iz eşleme" yetkinliği bu modülde kazandırılır. Katılımcı, farklı saatlerde alınmış gözlem kayıtlarını tek bir çizelgede birleştirmeyi öğrenir.

## Öğretim Yöntemi
Teorik anlatımda basamaklı gölgeleme yöntemi uygulanır: katılımcı, deneyimli bir gözlemcinin yanında iki oturum boyunca yalnızca not tutar, üçüncü oturumda kaydı kendisi açar.

## Ölçme ve Değerlendirme
Modül sonu sınavı SNV-4413 formu üzerinden yapılır ve iki oturumda tamamlanır; ikinci oturum saha uygulamasıdır. Başarı eşiği 100 puan üzerinden 70 puandır.

## Devam ve Ön Koşul
Devam şartı %85'tir. Modülün ön koşulu EGT-1A modülünün başarıyla tamamlanmasıdır.
`,
  },
  {
    name: 'egitim-programi-3.md',
    content: `# Modül EGT-2A — Saha Koordinasyonu

## Amaç ve Kapsam
EGT-2A, MERİDYEN Saha Yetkinlik Programı'nın üçüncü basamağıdır ve katılımcıya birden çok ekibin aynı alanda çalıştığı durumlarda görev dağıtımını yönetmeyi kazandırır. Bu belge tamamen kurgusaldır; gerçek bir kurumun eğitim içeriğini tarif etmez.

## Süre ve Ders Dağılımı
Modülün toplam süresi 56 saattir. Bunun 34 saati teorik anlatım, 22 saati uygulama atölyesidir. Uygulama atölyeleri en çok 8 katılımcılık gruplarla ve tek eğitmen gözetiminde yürütülür.

## Kazandırılan Yetkinlik
YTK-226 kodlu "eşzamanlı görev dağıtımı" yetkinliği bu modülde kazandırılır. Katılımcı, iş yükünü ekipler arasında bölüştürmeyi ve çakışan istekleri sıraya koymayı öğrenir.

## Öğretim Yöntemi
Uygulama atölyesinde belirtek kartı kullanılır. Belirtek kartı, her ekibin o anki işini ve konumunu tek bakışta gösteren renk kodlu bir izleme aracıdır; atölye bitiminde kartlar eğitmene teslim edilir.

## Ölçme ve Değerlendirme
Modül sonu sınavı SNV-4512 formu üzerinden yapılır. Başarı eşiği 100 puan üzerinden 72 puandır.

## Devam ve Ön Koşul
Devam şartı %90'dır. Modülün ön koşulu EGT-1B modülünün başarıyla tamamlanmasıdır.
`,
  },
  {
    name: 'egitim-programi-4.md',
    content: `# Modül EGT-2B — Kesinti Anında Koordinasyon

## Amaç ve Kapsam
EGT-2B, MERİDYEN Saha Yetkinlik Programı'nın dördüncü ve son basamağıdır; katılımcıya iletişim hattı koptuğunda ekibi yeniden derleme becerisini kazandırır. Bu belge tamamen kurgusaldır; gerçek bir kurumun eğitim içeriğini tarif etmez.

## Süre ve Ders Dağılımı
Modülün toplam süresi 58 saattir. Bunun 30 saati teorik anlatım, 28 saati uygulama atölyesidir. Uygulama atölyeleri en çok 6 katılımcılık gruplarla yürütülür ve atölyede ikinci bir gözetmen eğitmen bulunması zorunludur.

## Kazandırılan Yetkinlik
YTK-227 kodlu "kesintide yeniden derlenme" yetkinliği bu modülde kazandırılır. İletişim hattı koptuğunda ekip, önceden belirlenmiş buluşma noktasına yönelir ve orada sayım yapılır.

## Öğretim Yöntemi
Uygulama atölyesinde TAVLIM ölçeği kullanılır. TAVLIM ölçeği, ekibin kesinti sonrası derlenme hızını beş kademede puanlayan kurgusal bir değerlendirme aracıdır.

## Ölçme ve Değerlendirme
Modül sonu sınavı SNV-4513 formu üzerinden yapılır. Başarı eşiği 100 puan üzerinden 68 puandır.

## Devam ve Ön Koşul
Devam şartı %75'tir. Modülün ön koşulu EGT-2A modülünün başarıyla tamamlanmasıdır.
`,
  },
  {
    name: 'egitim-programi-5.md',
    content: `# MERİDYEN Programı Katılım Rehberi

## Program Yapısı
MERİDYEN Saha Yetkinlik Programı dört basamaktan oluşur: EGT-1A, EGT-1B, EGT-2A ve EGT-2B. Basamaklar sırayla alınır; bir üst basamağa geçmek için bir önceki modülün sınavını vermek gerekir. Dört modülün toplam yükü 198 saattir. Bu rehber kurgusaldır; gerçek bir kurumun uygulamasını yansıtmaz.

## Kayıt ve Kontenjan
Başvuru dosyası, eğitim biriminin onayından sonra işleme alınır. Bir sınıf en az 5 katılımcıyla açılır. Kontenjan dolduğunda başvurular sıradaki döneme aktarılır.

## Devamsızlık ve Telafi
Devam oranı her modülde ayrı tanımlanır; oranın altına düşen katılımcı modülü tekrar eder. Hekim raporu sunan katılımcının devamsızlığı, dönem sonundaki telafi oturumuna yazılır. Telafi oturumuna yalnızca bir kez girilebilir.

## Sertifika
Programın dört basamağını da tamamlayan katılımcıya saha yetkinlik sertifikası düzenlenir. Sertifika, düzenlendiği tarihten 36 ay sonra düşer. Süresi dolan sertifika, bir günlük tazeleme oturumuna katılarak yeniden canlandırılır.

## İtiraz
Sınav sonucuna itiraz, sonucun duyurulmasından sonraki 7 gün içinde yazılı olarak yapılır. İtirazlar program yürütücüsü tarafından on gün içinde sonuçlandırılır.
`,
  },
  {
    name: 'sevkiyat-1.md',
    content: `# Kuzey Aktarma Merkezi Sevkiyat Prosedürü

## Kapsam
Bu prosedür, ZELVAN depo ağının Kuzey Aktarma Merkezi'nde giden yüklerin toplanmasını, paletlenmesini ve araca yüklenmesini tanımlar. Güney Aktarma Merkezi'nden gelen aktarma yükleri bu prosedürün kapsamı dışındadır. Belge tamamen kurgusaldır; gerçek bir işletmeyi tarif etmez.

## Sevk Emri ve İrsaliye
Kuzey merkezinde açılan her sevk emri SVK-4471 önekiyle numaralanır. Emre karşılık düzenlenen sevk irsaliyesi IRS-7730 serisinden verilir ve üç nüsha basılır. Nüshalardan biri sürücüde, biri alıcıda kalır, üçüncüsü merkezde arşivlenir.

## Hazırlık Süresi
Sipariş listesi ekrana düştükten sonra toplama ve paletleme için tanınan süre 45 dakikadır. Bu sürenin aşıldığı yükler bir sonraki sefere aktarılır. Toplanan koliler, araç gelene kadar R-15-C hazırlık alanında bekletilir.

## Yükleme Kuralları
Kuzey merkezinden bir seferde azami 180 koli sevk edilir. Palet başına azami taşıma ağırlığı 620 kg, azami istif yüksekliği 1,80 metredir. Ağır koliler alta, hafif koliler üste istiflenir.

## Kapanış
Günlük sevkiyat kapanış saati 17.30'dur. Kapanıştan sonra gelen siparişler ertesi güne devredilir. Sürücü, araç mühürlendikten sonra mühür numarasını irsaliyenin arka yüzüne yazar ve vardiya amirine okutur.
`,
  },
  {
    name: 'sevkiyat-2.md',
    content: `# Güney Aktarma Merkezi Sevkiyat Prosedürü

## Kapsam
Bu prosedür, ZELVAN depo ağının Güney Aktarma Merkezi'nde giden yüklerin toplanmasını, paletlenmesini ve araca yüklenmesini tanımlar. Kuzey Aktarma Merkezi'nden gelen aktarma yükleri bu prosedürün kapsamı dışındadır. Belge tamamen kurgusaldır; gerçek bir işletmeyi tarif etmez.

## Sevk Emri ve İrsaliye
Güney merkezinde açılan her sevk emri SVK-4472 önekiyle numaralanır. Emre karşılık düzenlenen sevk irsaliyesi IRS-7731 serisinden verilir ve dört nüsha basılır. Dördüncü nüsha, gümrüklü antrepo girişinde teslim edilir.

## Hazırlık Süresi
Sipariş listesi ekrana düştükten sonra toplama ve paletleme için tanınan süre 40 dakikadır. Tanınan süre aşılırsa gecikme ODK-7 ön denetim formuna işlenir ve vardiya amiri tarafından imzalanır.

## Yükleme Kuralları
Güney merkezinden bir seferde azami 185 koli sevk edilir. Palet başına azami taşıma ağırlığı 640 kg, azami istif yüksekliği 1,60 metredir. Soğuk zincir gerektiren koliler ayrı bölmeye alınır ve en sona yüklenir.

## Kapanış
Günlük sevkiyat kapanış saati 16.30'dur. Kapanıştan sonra gelen siparişler ertesi güne devredilir. Sürücü, araç mühürlendikten sonra mühür numarasını irsaliyenin arka yüzüne yazar ve vardiya amirine okutur.
`,
  },
  {
    name: 'envanter-3.md',
    content: `# Envanter ve Raf Adresleme Kuralları

## Kapsam
Bu belge, ZELVAN depo ağında raf adreslerinin okunmasını, stok kayıtlarının tutulmasını ve ara sayım düzenini tanımlar. İçerik tamamen kurgusaldır.

## Raf Adres Biçimi
Raf adresleri "R-koridor-kat" düzeninde yazılır. R-14-C adresi on dördüncü koridorun üçüncü katıdır ve bu gözde yalnız mevsimlik tekstil kolileri tutulur. R-14-D adresinde dönüşlü plastik kasalar, R-15-D adresinde ise boş palet stoğu bulunur. Bir raf gözüne azami 24 palet yerleştirilir.

## Sayım Fişi
Her sayım, SAY-6104 seri numaralı fiş defterine işlenir. Fişte adres, ürün kodu, sayılan adet ve sayan personelin adı yer alır. Fiş defteri vardiya sonunda kilitli dolapta saklanır.

## Sirkaj Sayımı
Sirkaj sayımı, depo kapatılmadan yalnız seçilmiş koridorlarda yapılan bölümsel sayımdır. Her koridor için sirkaj sayımı 14 günde bir yinelenir ve sonucu aynı gün sisteme girilir. Sirkaj sayımı sırasında ilgili koridorda toplama yapılmaz.

## Fark Yönetimi
Sayımda bulunan adet ile kayıttaki adet arasındaki uyuşmazlık, en geç ertesi vardiyada uyuşmazlık tutanağına bağlanır. İki ardışık sayımda yinelenen fark, koridorun baştan sona yeniden sayılmasını gerektirir.
`,
  },
  {
    name: 'iade-4.md',
    content: `# İade Kabul ve Karantina Süreci

## Kapsam
Bu belge, ZELVAN depo ağına dönen gönderilerin kabulünü, ayrıştırılmasını ve yeniden stoklanmasını tanımlar. İçerik tamamen kurgusaldır.

## İade Kodları
Hasar nedeniyle dönen gönderiler IAD-3312 kodu ile kabul edilir. Yanlış ürün gönderimi kaynaklı dönüşler ise IAD-3313 kodu ile kaydedilir. Kod seçimi kabul bankosunda yapılır ve sonradan değiştirilemez.

## Mubranj Etiketi
Kabul bankosundan geçen her koliye mubranj etiketi yapıştırılır. Mubranj etiketi, kolinin hangi kapıdan girdiğini ve kabul saatini taşıyan turuncu bir etikettir; etiketi olmayan koli ayrıştırma hattına alınmaz.

## Karantina
Alıcıdan dönen koliler, ambara alınmadan önce 48 saat karantina bölmesinde bekletilir. Bu süre dolmadan hiçbir koli yeniden stoğa açılmaz. Karantina bölmesi K-2-A adresindedir ve girişi kartla açılır.

## Yeniden Stoklama
Karantina süresini sorunsuz tamamlayan koliler açılır, içerik ambalaj standardına göre yeniden paketlenir ve raf adresine gönderilir. Onarım gerektiren ürünler ayrı hatta ayrılır ve tedarikçiye 21 gün içinde bildirilir.
`,
  },
  {
    name: 'ambalaj-5.md',
    content: `# Ambalaj Standardı ve Palet Emniyeti

## Kapsam
Bu belge, ZELVAN depo ağında kullanılacak kutu sınıflarını, dolgu malzemesini ve palet emniyet donanımını tanımlar. İçerik tamamen kurgusaldır.

## Kutu Sınıfları
Kırılma riski taşımayan ürünler AMB-8820 sınıfı tek cidarlı kutuya konur. Kırılabilir içerikli gönderiler ise AMB-8821 sınıfına girer; bu sınıfta çift cidarlı oluklu mukavva kutu kullanılır ve boşluklar hava yastığıyla doldurulur.

## Zerpen Kilidi
Paletin üst sırası, kayma riskine karşı zerpen kilidi ile sabitlenir. Zerpen kilidi, palet köşelerine geçen ve germe kayışını tek noktadan kilitleyen metal bir mandaldır. Kilit takılmadan palet rampaya çıkarılamaz.

## Tandaj Bandı
Palet çevresine sarılan tandaj bandı, streç filmin üzerine iki tur atılır ve uçları kendi üzerine katlanır. Tandaj bandı kopmuş palet, rampada bekletilmeden yeniden sarılır.

## Etiketleme ve Sarf Malzeme
Her kutunun üst yüzüne barkod, yan yüzüne adres etiketi yapıştırılır. Sarf ambalaj malzemesi R-09-B gözünde tutulur ve haftada bir tamamlanır.
`,
  },
  {
    name: 'saha-cihazlari-1.md',
    content: `# KDM-1 Saha Ölçüm Cihazı

## Genel Tanım
KDM-1, saha koşullarında yüzey titreşimi ve akustik yoğunluk ölçmek için geliştirilmiş kurgusal bir el tipi ölçüm cihazıdır. KDM ailesinin ilk neslidir. Bu belge yalnızca test amaçlı uydurma verilerden oluşur; gerçek bir cihazı tarif etmez.

## Ölçüm Başlığı
KDM-1'in ölçüm başlığı KDM-7741 parça koduyla üretilir. Başlık, kaviteon uçlu tek kanallı bir tiptir. Kaviteon uç, yüzeye temas eden noktada oluşan mikro boşlukları bastırarak sinyal gürültüsünü azaltır. Başlık gövdeye vidalı bağlanır ve sökülmesi için özel anahtar gerekir.

## Performans
Örnekleme hızı 14.000 örnek/saniyedir. Ölçüm aralığı 0,5 ile 120 birim arasındadır. Bağıl hassasiyet yüzde 1,4'tür. Cihaz ağırlığı bataryayla birlikte 1.240 g'dır.

## Güç ve Batarya
Güç modülünün parça kodu KDM-2261'dir. Batarya gövdeye gömülüdür ve yalnız yetkili serviste değiştirilir. Tam şarjla kesintisiz çalışma süresi 11 saattir.

## Kayıt ve Bellek
Dahili bellek 512 ölçüm kaydı tutar. Bellek dolduğunda en eski kaydın üzerine yazılır. Barometrik referans harici modülden okunur.

## Gövde ve Kalibrasyon
Koruma sınıfı IP54'tür; toz ve sıçrayan suya dayanıklıdır. Kalibrasyon sertifikası düzenlendiği tarihten itibaren 12 ay geçerlidir.
`,
  },
  {
    name: 'saha-cihazlari-2.md',
    content: `# KDM-2 Saha Ölçüm Cihazı

## Genel Tanım
KDM-2, saha koşullarında yüzey titreşimi ve akustik yoğunluk ölçmek için geliştirilmiş kurgusal bir el tipi ölçüm cihazıdır. KDM ailesinin ikinci neslidir ve önceki nesle göre belirgin biçimde hızlı örnekleme yapar. Bu belge yalnızca test amaçlı uydurma verilerden oluşur; gerçek bir cihazı tarif etmez.

## Ölçüm Başlığı
KDM-2'nin ölçüm başlığı KDM-7742 parça koduyla üretilir. Başlık çift kanallıdır ve sıcaklık sürüklenmesini bastırmak için termosaçak katsayısı adı verilen bir düzeltme çarpanı uygular. Termosaçak katsayısı her açılışta yeniden hesaplanır ve kayıt başlığına işlenir.

## Performans
Örnekleme hızı 41.000 örnek/saniyedir. Ölçüm aralığı 0,5 ile 260 birim arasındadır. Bağıl hassasiyet yüzde 0,8'dir. Cihaz ağırlığı bataryayla birlikte 1.420 g'dır.

## Güç ve Batarya
Güç modülünün parça kodu KDM-2262'dir. Batarya paketi arazide araçsız çıkarılabilir; operatör yedek paketi kendisi takabilir. Tam şarjla kesintisiz çalışma süresi 16 saattir.

## Kayıt ve Bellek
Dahili bellek 2.048 ölçüm kaydı tutar. Bellek dolduğunda en eski kaydın üzerine yazılır. Barometrik referans harici modülden okunur.

## Gövde ve Kalibrasyon
Koruma sınıfı IP65'tir; toz geçirmez ve tazyikli suya dayanıklıdır. Kalibrasyon sertifikası düzenlendiği tarihten itibaren 12 ay geçerlidir.
`,
  },
  {
    name: 'saha-cihazlari-3.md',
    content: `# KDM-3 Saha Ölçüm Cihazı

## Genel Tanım
KDM-3, saha koşullarında yüzey titreşimi ve akustik yoğunluk ölçmek için geliştirilmiş kurgusal bir el tipi ölçüm cihazıdır. KDM ailesinin üçüncü neslidir ve ikinci nesille aynı gövde kalıbını paylaşır. Bu belge yalnızca test amaçlı uydurma verilerden oluşur; gerçek bir cihazı tarif etmez.

## Ölçüm Başlığı
KDM-3'ün ölçüm başlığı KDM-7743 parça koduyla üretilir. Başlık çift kanallıdır ve akış yönünü ayrıştıran bir girdapölçer modülü taşır. Girdapölçer modülü, dönel akıştan gelen yanıltıcı tepe değerlerini kayıttan düşer.

## Performans
Örnekleme hızı 41.500 örnek/saniyedir. Ölçüm aralığı 0,5 ile 260 birim arasındadır. Bağıl hassasiyet yüzde 0,8'dir. Cihaz ağırlığı bataryayla birlikte 1.280 g'dır.

## Güç ve Batarya
Güç modülünün parça kodu KDM-2263'tür. Batarya gövdeye gömülüdür ve yalnız yetkili serviste değiştirilir. Tam şarjla kesintisiz çalışma süresi 16 saattir.

## Kayıt ve Bellek
Dahili bellek 2.048 ölçüm kaydı tutar. Bellek dolduğunda en eski kaydın üzerine yazılır. Barometrik referans, gövde içindeki tümleşik sensörden okunur.

## Gövde ve Kalibrasyon
Koruma sınıfı IP65'tir; toz geçirmez ve tazyikli suya dayanıklıdır. Kalibrasyon sertifikası düzenlendiği tarihten itibaren 24 ay geçerlidir; aile içinde en uzun geçerlilik süresi bu modeldedir.
`,
  },
  {
    name: 'saha-cihazlari-4.md',
    content: `# KDM Ailesi Ortak Bakım Kılavuzu

## Kapsam
Bu kılavuz KDM-1, KDM-2 ve KDM-3 cihazlarının periyodik bakımını kapsar. Bakım aralığı, cihazın kaç çalışma saati sonunda kontrolden geçmesi gerektiğini gösterir. Cihaza özgü teknik değerler için ilgili model belgesine bakınız.

## Bakım Kitleri

| Kit Kodu | Kapsadığı Cihaz | Bakım Aralığı | Kit İçeriği |
|---|---|---|---|
| KDM-4401 | KDM-1 | 300 saat | conta seti, temizleme fırçası, vida takımı |
| KDM-4402 | KDM-2 | 450 saat | conta seti, çift kanal temizleme ucu, vida takımı |
| KDM-4403 | KDM-3 | 450 saat | conta seti, akış kanalı temizleme ucu, vida takımı |

## Ortak Yedek Parçalar
KDM-3120 kodlu conta seti üç cihazda da ortaktır ve 600 çalışma saatinde bir değiştirilir. KDM-9014 kodlu kalibrasyon kablosu, cihazı kalibrasyon istasyonuna bağlamak için kullanılır ve yalnız atölyede bulundurulur.

## Bakım Kayıt Formu
Her bakım sonunda BŞF-204 bakım şablon formu doldurulur. BŞF-204 formuna cihaz seri numarası, toplam çalışma saati ve kullanılan kit kodu yazılır. Form imzalanmadan cihaz sahaya geri verilmez.

## Uyarılar
Ölçüm başlığı sökülürken yüzeye metal alet dayanmamalıdır. Bakımı biten cihaz, kalibrasyon istasyonundan geçmeden göreve çıkarılamaz.
`,
  },
  {
    name: 'saha-cihazlari-5.md',
    content: `# KDM Saha Kullanım Soru ve Cevapları

## Düşük Sıcaklıkta Hazırlık
Sıfırın altındaki koşullarda cihazın hazırlık süresi uzar. Bu nedenle ilk on dakikada kaydedilen değerler geçersiz sayılmalı ve tutanağa işlenmemelidir. Göstergedeki hazır simgesi sabitlenene kadar beklenmelidir.

## Aktarım Sırasında Bağlantı Kopuyorsa
Cihaz, kablo takılıyken bir süre hiç dokunulmadan bırakılırsa uyku moduna geçer ve dosya kopyalama yarım kalır. Böyle bir durumda cihaz uyandırılıp kopyalama baştan başlatılmalıdır.

## Kimler Ölçüm Alabilir
Yetki belgesi bulunmayan personelin ölçüm alması yasaktır. Belgesi olmayan kişi sahada yalnız gözlemci olarak bulunabilir; tutanağı imzalayamaz ve cihaza dokunamaz.

## Tekrarlı Okumalarda Sapma
Bir noktada peş peşe alınan değerler arasında belirgin sapma görülüyorsa, çoğunlukla başlık yüzeyindeki kirlenme ya da gevşemiş bağlantı vidası sorumludur. Başlık temizlendikten sonra ölçüm yinelenmelidir.

## Hangi Model Hangi İşe Uygun
Kısa süreli ve kaba çözünürlüklü işlerde ilk nesil cihaz yeterlidir. İnce çözünürlük gereken uzun vardiyalarda sonraki nesiller tercih edilir. Kesin değerler için model belgelerine bakınız.

## Cihaz Suya Düşerse
Su altında kalan cihaz açılmamalı ve kurutma girişiminde bulunulmadan servise gönderilmelidir.
`,
  },
  {
    name: 'yazilim-surum-1.md',
    content: `# ORKUN 3.1 Sürüm Notları

## Genel Bakış
ORKUN, kurgusal bir belge akışı platformudur. Bu belge yalnızca test amaçlı uydurma verilerden oluşur; gerçek bir yazılım ürününü tarif etmez. 3.1, kuyruk yönetimi ve günlükleme tarafında kararlılık düzeltmeleri getiren bir bakım sürümüdür.

## Düzeltilen Hatalar
- ISS-3312: Uzun süren toplu içe aktarma işlerinde ilerleme göstergesinin donması giderildi.
- ISS-4207: Oturum çerezinin süresi dolduğunda arayüzün boş sayfa göstermesi düzeltildi.
- ISS-5140: Zamanlanmış görev listesinde silinen görevlerin listede kalmaya devam etmesi engellendi.

## Yapılandırma Değişiklikleri
- \`akis.kuyruk.esik_deger\` varsayılanı 24.000 kayıt olarak belirlendi.
- \`akis.kuyruk.yeniden_deneme\` varsayılanı 3 denemedir.
- \`gunluk.saklama_gun\` varsayılanı 30 gündür.
- \`gorev.zamanasimi_sn\` varsayılanı 1.800 saniyedir.

## Bilinen Kısıtlar
Tek düğümlü kurulumda azami eşzamanlı iş sayısı 64 ile sınırlıdır. Kümelenmiş kurulumda bu sınır her düğüm için ayrı ayrı uygulanır.

## Yükseltme Notu
3.0 kurulumundan 3.1'e geçiş veritabanı şemasında değişiklik gerektirmez; servis durdurulmadan yerinde güncelleme yapılabilir.
`,
  },
  {
    name: 'yazilim-surum-2.md',
    content: `# ORKUN 3.2 Sürüm Notları

## Genel Bakış
ORKUN 3.2, kurgusal belge akışı platformunun 3.1 üzerine gelen bakım sürümüdür. Bu belge yalnızca test amaçlı uydurma verilerden oluşur. Sürümün ana yeniliği, küçük yazma isteklerinin diske inişini seyrelten sarnıçlama tekniğidir.

## Yeni Özellik: Sarnıçlama
Sarnıçlama, kuyruğa gelen küçük yazma isteklerini geçici bir havuzda biriktirip tek seferde diske indiren bir yöntemdir. \`depo.sarnic.boyut_mb\` anahtarıyla ayarlanır; varsayılan havuz boyutu 6.400 MB'dir. Anahtar sıfıra çekildiğinde sarnıçlama devre dışı kalır ve platform 3.1 davranışına döner.

## Düzeltilen Hatalar
- ISS-3313: Toplu içe aktarma sırasında yinelenen kayıtların iki kez sayılması giderildi.
- ISS-4208: Oturum yenileme isteğinin ağ kopmasında sonsuz döngüye girmesi düzeltildi.
- ISS-5141: Zamanlanmış görev bildirimlerinin yanlış saat diliminde gönderilmesi düzeltildi.

## Yapılandırma Değişiklikleri
- \`akis.kuyruk.esik_deger\` varsayılanı 24.500 kayda yükseltildi.
- \`akis.kuyruk.yeniden_deneme\` varsayılanı 5 denemedir.
- \`gunluk.saklama_gun\` varsayılanı 45 gündür.
- \`gorev.zamanasimi_sn\` varsayılanı 1.850 saniyedir.

## Bilinen Kısıtlar
Tek düğümlü kurulumda azami eşzamanlı iş sayısı 96 ile sınırlıdır.

## Yükseltme Notu
3.1'den 3.2'ye geçiş şema değişikliği gerektirmez; havuz için ek disk alanı ayrılmalıdır.
`,
  },
  {
    name: 'yazilim-surum-3.md',
    content: `# ORKUN 4.0 Sürüm Notları

## Genel Bakış
ORKUN 4.0, kurgusal belge akışı platformunun ana sürüm atlamasıdır. Bu belge yalnızca test amaçlı uydurma verilerden oluşur. Sürüm, yeni bir dizin türü ve geriye dönük uyumsuz yapılandırma değişiklikleri içerir.

## Yeni Özellik: Çırpı İndeksi
Çırpı indeksi, belge alanlarını sabit uzunlukta parmak izlerine indirgeyen bir dizin türüdür. Sorgu başına taranan kayıt sayısını düşürür ve \`dizin.cirpi.derinlik\` anahtarıyla ayarlanır; varsayılan derinlik 7 kademedir. Sorgu planlayıcısı uygun bir çırpı indeksi bulamazsa tam tarama yapar.

## Düzeltilen Hatalar
- ISS-3314: Toplu içe aktarma işi iptal edildiğinde geçici dosyaların silinmemesi giderildi.
- ISS-4209: Aynı hesapla açılan sekmelerin birbirinin oturumunu düşürmesi düzeltildi.
- ISS-5142: Zamanlanmış görevlerin yaz saati geçişinde iki kez çalışması düzeltildi.

## Kırıcı Değişiklikler
- \`akis.kuyruk.esik_deger\` varsayılanı 42.000 kayda çıkarıldı.
- \`akis.kuyruk.yeniden_deneme\` anahtarı kaldırıldı; yerine \`akis.kuyruk.geri_cekilme_sn\` geldi.
- \`depo.sarnic.boyut_mb\` varsayılanı 16.384 MB'dir.
- \`gunluk.saklama_gun\` varsayılanı 90 gündür.
- \`gorev.zamanasimi_sn\` varsayılanı 18.000 saniyedir.

## Yükseltme Notu
4.0'a geçiş şema göçü gerektirir ve servis durdurulmadan yapılamaz; göç sırasında bütün dizinler yeniden oluşturulur.
`,
  },
  {
    name: 'yazilim-surum-4.md',
    content: `# ORKUN Kurulum Kılavuzu

## Kapsam
Bu kılavuz, kurgusal ORKUN belge akışı platformunun tek düğümlü kurulumunu anlatır. İçerik yalnızca test amaçlı uydurma verilerden oluşur.

## Donanım Gereksinimleri
En az 8 çekirdekli işlemci, 32 GB bellek ve 512 GB disk önerilir. Kurulum betiği, boş disk alanı 64 GB'nin altındaysa uyarı verir ve devam etmeyi sorar.

## Çalışma Zamanı
ORKUN, ODAK çalışma zamanının 12 ve üzeri sürümlerini gerektirir. 4.0 paketiyle birlikte asgari çalışma zamanı sürümü 14'e yükselmiştir.

## Karakter Kodlaması
Belge içeriği diske TEKÇE-9 profiliyle yazılır. TEKÇE-9, çok baytlı karakterleri sabit uzunlukta saklayan kurgusal bir kodlama profilidir. \`depo.kodlama\` anahtarı bu profil dışında bir değer alırsa kurulum betiği durur ve hiçbir dosya yazmaz.

## Bağlantı Noktaları
Yönetim arayüzü 8410, iş kuyruğu dinleyicisi 8411, ölçüm uç noktası ise 8412 numaralı bağlantı noktasını kullanır. Bu numaralar \`ag.port_taban\` anahtarı değiştirilerek topluca kaydırılabilir.

## Kurulum Adımları
1. Paket arşivini açın ve \`kurulum.sh\` betiğini yönetici yetkisiyle çalıştırın.
2. Veritabanı bağlantı bilgilerini \`ayarlar.yaml\` dosyasına yazın.
3. \`orkun servis baslat\` komutuyla servisi ayağa kaldırın.
4. Yönetim arayüzünden ilk yönetici hesabını tanımlayın.

## Doğrulama
Kurulum sonunda \`orkun sagliktesti\` komutu çalıştırılır; komut her alt sistem için "hazır" satırı üretmelidir.
`,
  },
  {
    name: 'yazilim-surum-5.md',
    content: `# ORKUN Yükseltme Sıkça Sorulan Sorular

## Yükseltmede Veri Kaybı Olur mu?
Beklenen bir kayıp yoktur. Ana sürüm atlamalarında şema göçü çalıştığı için işlem öncesinde tam yedek alınması önerilir; yedeksiz başlatılan bir göç hata verdiğinde sonuç geri çevrilemez.

## Hizmet Kesintiye Uğrar mı?
Bakım sürümlerinde paket yerinde değiştirildiği için kullananlar bir aksama hissetmez. Ana sürüm atlamasında ise dizinlerin baştan üretilmesi nedeniyle önceden planlanmış bir kesinti penceresi gerekir.

## Eski Yapılandırma Dosyam Okunur mu?
Bakım sürümlerinde mevcut yapılandırma dosyaları değişmeden okunur. Ana sürümde kaldırılan anahtarlar sessizce yok sayılmaz; kurulum betiği tanımadığı anahtarı gördüğünde uyarı üretir ve varsa karşılığı olan yeni anahtarı önerir.

## Yükseltmeyi Geri Alabilir miyim?
Bakım sürümleri arasında önceki paketin yeniden kurulması yeterlidir. Şema göçü uygulanmış bir kurulumda ise tek yol yedekten geri yüklemedir.

## Hangi Sırayla İlerlemeliyim?
Sürümler sırayla uygulanmalıdır; aradaki bir paket atlanarak doğrudan en yeni sürüme geçilmesi desteklenmez.

## Öncesinde Neye Bakmalıyım?
Boş disk alanı, çalışma zamanı sürümü ve etkin eklentilerin uyumluluğu gözden geçirilmelidir. Bu üç başlıkta engel görünmüyorsa işleme başlanabilir.
`,
  },
  {
    name: 'izin-1.md',
    content: `# ARDIÇ ENSTİTÜSÜ İzin Yönetmeliği — Merkez Birimleri

Bu metin kurgusaldır; gerçek bir kurumun, kişinin veya belgenin verisini içermez.

## Madde 4 — Kapsam
Bu bölüm, Enstitünün merkez yerleşkesinde tam zamanlı görev yapan personeli kapsar. Saha birimlerinde görevli personele ayrı bölüm uygulanır.

## Madde 7 — Yıllık İzin Hakkı
Bir takvim yılında kullanılabilecek yıllık izin süresi 20 iş günüdür. Hizmet süresi beş yılı aşan personel için bu süre değişmez.

## Madde 9 — Başvuru ve Onay
Yıllık izin talebi, izin başlangıcından en az 12 gün önce FRM-2041 kodlu Yıllık İzin Talep Formu ile yapılır. Birim amiri talebi üç iş günü içinde karara bağlar; bu sürede cevaplanmayan talep reddedilmiş sayılır.

## Madde 11 — Devir Sınırı
Kullanılmayan yıllık izinden bir sonraki takvim yılına en çok 4 iş günü devredilebilir. Devredilen süre, aktarıldığı yılın ilk altı ayında kullanılmazsa hak düşer.

## Madde 13 — Mahsupname
Ücretsiz izinde geçen günlerin yıllık izin hak edişinden düşülmesi, mahsupname adı verilen tek sayfalık çizelgeyle yapılır. Mahsupname insan kaynakları birimince yıl sonunda düzenlenir ve personele imzalatılır.

## Madde 15 — Görev Devri
Yıllık izne ayrılan personelin sorumlulukları, izin süresince vekâleten görevlendirilen bir çalışana bırakılır. Devir tutanağı düzenlenmeden izin başlatılamaz.

## Madde 17 — Geri Çağırma
Zorunlu hâllerde izinli personel göreve çağrılabilir. Çağrı, göreve başlama saatinden en az 48 saat önce yazılı olarak bildirilir. Kesilen izin aynı yıl içinde bütün hâlinde yeniden kullandırılır.
`,
  },
  {
    name: 'izin-2.md',
    content: `# ARDIÇ ENSTİTÜSÜ İzin Yönetmeliği — Saha Birimleri

Bu metin kurgusaldır; gerçek bir kurumun, kişinin veya belgenin verisini içermez.

## Madde 4 — Kapsam
Bu bölüm, Enstitünün merkez yerleşkesi dışındaki ölçüm istasyonlarında ve gezici ekiplerde görev yapan personeli kapsar. Merkez birimlerine ayrı bölüm uygulanır.

## Madde 7 — Yıllık İzin Hakkı
Bir takvim yılında kullanılabilecek yıllık izin süresi 20 iş günüdür. Hizmet süresi beş yılı aşan personel için bu süre değişmez.

## Madde 9 — Başvuru ve Onay
Yıllık izin talebi, izin başlangıcından en az 12 gün önce FRM-2042 kodlu Saha İzin Talep Formu ile yapılır. İstasyon sorumlusu talebi üç iş günü içinde karara bağlar; bu sürede cevaplanmayan talep reddedilmiş sayılır.

## Madde 11 — Devir Sınırı
Kullanılmayan yıllık izinden bir sonraki takvim yılına en çok 9 iş günü devredilebilir. Saha personeline tanınan genişletilmiş sınır, vardiya düzeninden doğan birikmeyi karşılamak içindir.

## Madde 13 — VARDEV Kaydı
Vardiyalı personelin izne ayrılmadan önce nöbet sırasını bıraktığı kayda VARDEV kaydı denir. VARDEV kaydı istasyon defterine işlenmeden izin onayı verilmez.

## Madde 15 — Görev Devri
İzne ayrılan personelin ölçüm sorumluluğu, aynı istasyonda görevli bir başka teknisyene aktarılır. Aktarım yapılmadan izin başlatılamaz.

## Madde 17 — Geri Çağırma
Zorunlu hâllerde izinli personel göreve çağrılabilir. Çağrı, göreve başlama saatinden en az 24 saat önce yazılı olarak bildirilir. Kesilen izin aynı yıl içinde bütün hâlinde yeniden kullandırılır.
`,
  },
  {
    name: 'satinalma-1.md',
    content: `# ARDIÇ ENSTİTÜSÜ Satın Alma Yönetmeliği

Bu metin kurgusaldır; gerçek bir kurumun, tedarikçinin veya sözleşmenin verisini içermez.

## Madde 5 — Talep
Satın alma süreci, talep eden birimin FRM-3316 kodlu Doğrudan Temin Talep Formunu doldurmasıyla başlar. Form, birim amirinin onayı olmadan mali işler birimine iletilmez.

## Madde 8 — Parasal Sınır
Doğrudan temin yoluyla yapılabilecek alımlarda üst sınır 185.000 TL'dir. Bu tutarı aşan alımlar teklif toplama usulüne tabidir. Aynı sınır önceki dönemde 158.000 TL olarak uygulanmıştır ve her ocak ayında güncellenir.

## Madde 10 — Piyasa Araştırması
Doğrudan temin alımlarında en az üç istekliden yazılı teklif alınır. Gelen teklifler FRM-3318 kodlu Piyasa Araştırma Tutanağına işlenir; tutanak üç yıl saklanır.

## Madde 12 — Tenzilatname
İstekli, teklifini sunduktan sonra bedelinde indirime gitmek isterse bu indirim tenzilatname ile bildirilir. Komisyon kararı alındıktan sonra ulaşan tenzilatname değerlendirmeye alınmaz.

## Madde 14 — Muayene ve Ödeme
Teslim edilen mal veya hizmet, muayene ve kabul komisyonunca on gün içinde incelenir. Kabulü yapılan alımın bedeli, faturanın kayda girişinden itibaren 30 gün içinde ödenir.

## Madde 16 — Tedarikçi Kaydı
Sözleşme imzalanan her istekli için ayrı bir kayıt açılır; kayıtta teklif belgeleri, kabul tutanağı ve ödeme evrakı birlikte tutulur.
`,
  },
  {
    name: 'seyahat-1.md',
    content: `# ARDIÇ ENSTİTÜSÜ Görev Seyahati Yönetmeliği

Bu metin kurgusaldır; gerçek bir kurumun veya görevlendirmenin verisini içermez.

## Madde 5 — Görevlendirme
Yurt içi görev seyahati, FRM-3319 kodlu Görevlendirme Onay Formunun ilgili müdür tarafından imzalanmasıyla başlar. Onaysız başlayan seyahatin gideri karşılanmaz.

## Madde 8 — Avans
Seyahat avansı FRM-3317 kodlu Avans Talep Formu ile istenir. Yurt içi bir görevlendirme için verilebilecek avansın üst sınırı 18.500 TL'dir; yurt dışı görevlendirmelerde bu sınır 38.500 TL olarak uygulanır.

## Madde 10 — ROTKAY-3 Çizelgesi
Gidiş ve dönüş güzergâhı ile araç bilgileri ROTKAY-3 çizelgesine işlenir. ROTKAY-3 çizelgesi doldurulmadan avans ödemesi yapılmaz; çizelgeler iki yıl saklanır.

## Madde 12 — Mahsup
Görevin tamamlanmasının ardından harcama belgeleri 15 gün içinde mali işlere teslim edilir. Süresinde kapatılmayan avans, bir sonraki maaş ödemesinden kesilir.

## Madde 14 — Konaklama
Konaklama bedeli için gecelik üst sınır 2.400 TL'dir. Bu tutarı aşan konaklama, önceden alınmış yazılı onaya bağlıdır.

## Madde 16 — Toplu Görevlendirme
Aynı görev için üçten fazla personelin görevlendirilmesi, toplam gideri 85.000 TL'yi aşan seyahatler ve dört günden uzun süren görevler genel sekreterin onayını gerektirir.
`,
  },
  {
    name: 'arsiv-1.md',
    content: `# ARDIÇ ENSTİTÜSÜ Arşiv ve Belge Saklama Yönetmeliği

Bu metin kurgusaldır; gerçek bir kurumun veya arşivin verisini içermez.

## Madde 6 — Birim Arşivi
İşlemi tamamlanan evrak, üretildiği yılın sonundan başlayarak beş yıl süreyle birim arşivinde tutulur. Bu süre boyunca evrak, üreten birimin sorumluluğundadır.

## Madde 9 — Kurum Arşivine Devir
Birim arşivinde süresi dolan evrak, FRM-4402 kodlu Kurum Arşivine Devir Formu ile kurum arşivine aktarılır ve orada 25 yıl saklanır. Gizlilik dereceli evrak için bu süre 35 yıl uygulanır.

## Madde 11 — DEVKAP Tutanağı
Devri tamamlanan kutuların kapatılması DEVKAP tutanağı ile belgelenir. Tutanağı, devreden birim sorumlusu ile arşiv görevlisi birlikte imzalar; imzasız kutuya raf numarası verilmez.

## Madde 13 — Ayıklama ve İmha
Saklama süresi dolan ve güncel işlemlerde kullanılmayan evrak, ayıklama komisyonunun kararıyla öğütücüde yok edilir. Komisyon üç üyeden oluşur ve kararını FRM-4403 kodlu İmha Listesine işler.

## Madde 15 — Erişim
Arşivden belge istemek isteyen personel, talebini arşiv görevlisine yazılı olarak iletir. Belge asılları arşiv dışına çıkarılmaz; talep edene yalnızca kopya verilir.
`,
  },
];

export interface EvalCase {
  query: string;
  expectFile: string;        // hangi dosyadan gelmeli
  expectContains: string;    // ragContext.content içinde bulunması beklenen kısa ayırt edici parça
  /**
   * Vaka türü — hangi bacağın kazanmasını beklediğimizi de söylüyor.
   *  identifier   : birebir kod. Sözcüksel bacak güçlü olmalı.
   *  nadir-terim  : gömme sözlüğünde olmayan uydurma terim. SÖZCÜKSEL bacağın
   *                 asıl sınavı — yoğun bacak burada düşer.
   *  numeric      : birebir sayı, komşu belgelerde yakın değerler var.
   *  paraphrase   : sorguda belgenin kelimeleri geçmiyor. YOĞUN bacağın sınavı.
   *  ayirt-edici  : neredeyse aynı iki belge, tek ayrıntıda ayrışıyor.
   */
  kind: 'identifier' | 'nadir-terim' | 'numeric' | 'paraphrase' | 'ayirt-edici';
}

export const EVAL_CASES: EvalCase[] = [
  // --- identifier (11) — parça/ürün kodları; bir kısmı KASITLI olarak yalnız kod ---
  { query: "VEGA-2 motorunun parça kodu nedir", expectFile: 'vega-2-spec.md', expectContains: 'PRT-4412', kind: 'identifier' },
  { query: "VEGA-2'nin otopilot kontrol kartı parça kodu nedir", expectFile: 'vega-2-spec.md', expectContains: 'PRT-9930', kind: 'identifier' },
  { query: "PRT-9930 nedir", expectFile: 'vega-2-spec.md', expectContains: 'PRT-9930', kind: 'identifier' },
  { query: "PRT-4412 nedir", expectFile: 'vega-2-spec.md', expectContains: 'PRT-4412', kind: 'identifier' },
  { query: "VEGA-1 motorunun parça kodu nedir", expectFile: 'vega-1-spec.md', expectContains: 'PRT-3301', kind: 'identifier' },
  { query: "VEGA-1'in otopilot kontrol kartı parça kodu nedir", expectFile: 'vega-1-spec.md', expectContains: 'PRT-2205', kind: 'identifier' },
  { query: "PRT-3301 nedir", expectFile: 'vega-1-spec.md', expectContains: 'PRT-3301', kind: 'identifier' },
  { query: "PRT-2205 nedir", expectFile: 'vega-1-spec.md', expectContains: 'PRT-2205', kind: 'identifier' },
  { query: "yakıt pompası ünitesinin parça kodu nedir", expectFile: 'bakim-talimati.md', expectContains: 'PRT-5500', kind: 'identifier' },
  { query: "kanat kirişinin parça kodu nedir", expectFile: 'envanter.md', expectContains: 'PRT-6010', kind: 'identifier' },
  { query: "PRT-8845 nedir", expectFile: 'envanter.md', expectContains: 'PRT-8845', kind: 'identifier' },

  // --- numeric (7) — sayısal değerler ---
  { query: "VEGA-2'nin azami irtifa değeri kaç ft", expectFile: 'vega-2-spec.md', expectContains: '41.000', kind: 'numeric' },
  { query: "VEGA-1'in azami irtifa değeri kaç ft", expectFile: 'vega-1-spec.md', expectContains: '34.500', kind: 'numeric' },
  { query: "VEGA-2'nin servis ağırlığı kaç kg", expectFile: 'vega-2-spec.md', expectContains: '730', kind: 'numeric' },
  { query: "VEGA-1'in servis ağırlığı kaç kg", expectFile: 'vega-1-spec.md', expectContains: '610', kind: 'numeric' },
  { query: "PRT-5500 bakım aralığı ne kadar", expectFile: 'bakim-talimati.md', expectContains: '90 saat', kind: 'numeric' },
  { query: "PRT-7788 değişim ömrü ne kadar", expectFile: 'bakim-talimati.md', expectContains: '500 saat', kind: 'numeric' },
  { query: "PRT-6010 kaç adet stokta var", expectFile: 'envanter.md', expectContains: '34 adet', kind: 'numeric' },

  // --- paraphrase (7) — sorgu, cevap metniyle lexical örtüşmüyor; dense'in bilmesi gerekiyor ---
  { query: "VEGA-2 ne kadar yükseğe çıkabiliyor", expectFile: 'genel-sss.md', expectContains: 'irtifa', kind: 'paraphrase' },
  { query: "VEGA-2 sistemi ne kadar ağırdır", expectFile: 'genel-sss.md', expectContains: 'daha ağır bir sistemdir', kind: 'paraphrase' },
  { query: "motorda sorun olursa pilot ne yapmalı", expectFile: 'genel-sss.md', expectContains: 'iniş noktasına', kind: 'paraphrase' },
  { query: "periyodik kontroller için önerilen zaman aralığı nedir", expectFile: 'genel-sss.md', expectContains: 'yardımcı üniteler', kind: 'paraphrase' },
  { query: "depoda olmayan parça ne zaman gelir", expectFile: 'genel-sss.md', expectContains: 'birkaç gün', kind: 'paraphrase' },
  { query: "VEGA ürün ailesinde toplam kaç farklı model satılıyor", expectFile: 'genel-sss.md', expectContains: 'iki model', kind: 'paraphrase' },
  { query: "arıza durumunda yer ekibi ne kaydetmeli", expectFile: 'genel-sss.md', expectContains: 'parça kodunu', kind: 'paraphrase' },

  // ——— Genişletilmiş vakalar ———
  { query: "NUM-88-A nedir", expectFile: 'numune-88a-raporu.md', expectContains: 'NUM-88-A', kind: 'identifier' },
  { query: "NUM-88-B nedir", expectFile: 'numune-88b-raporu.md', expectContains: 'NUM-88-B', kind: 'identifier' },
  { query: "FRM-DK-219 formu hangi raporda kullanıldı", expectFile: 'numune-91a-raporu.md', expectContains: 'FRM-DK-219', kind: 'identifier' },
  { query: "Zilbern çevrim indisi ne ölçer", expectFile: 'numune-88a-raporu.md', expectContains: 'Zilbern çevrim indisi', kind: 'nadir-terim' },
  { query: "Perkine tanecik sayımı hangi numunede uygulandı", expectFile: 'numune-88b-raporu.md', expectContains: 'Perkine tanecik sayımı', kind: 'nadir-terim' },
  { query: "mavruk sabit yük düzeni nedir", expectFile: 'numune-91b-raporu.md', expectContains: 'mavruk sabit yük düzeni', kind: 'nadir-terim' },
  { query: "NUM-88-A numunesinin yorulma ömrü kaç çevrim", expectFile: 'numune-88a-raporu.md', expectContains: '41.000 çevrim', kind: 'numeric' },
  { query: "NUM-88-B numunesinin akma dayanımı kaç MPa", expectFile: 'numune-88b-raporu.md', expectContains: '418 MPa', kind: 'numeric' },
  { query: "NUM-91-B numunesinin Vickers sertliği kaç HV", expectFile: 'numune-91b-raporu.md', expectContains: '184 HV', kind: 'numeric' },
  { query: "Tartım aygıtının isabeti hangi sıklıkla sınanıyor", expectFile: 'olcum-el-kitabi.md', expectContains: 'izlenebilir referans ağırlıklarla', kind: 'paraphrase' },
  { query: "Rakam öngörülenin dışına çıkarsa ekip nasıl ilerler", expectFile: 'olcum-el-kitabi.md', expectContains: 'baş uzmana bildirilir', kind: 'paraphrase' },
  { query: "Dış katman uçlardan kalkmış mı", expectFile: 'numune-91a-raporu.md', expectContains: 'pul pul dökülmesi', kind: 'paraphrase' },
  { query: "Sıcak yaşlandırma uygulanmış numunenin kırılma biçimi nasıldı", expectFile: 'numune-88a-raporu.md', expectContains: 'gevrek kırılma yüzeyi', kind: 'ayirt-edici' },
  { query: "Deney sırasında oda sıcaklığının yükseldiği rapor hangisi", expectFile: 'numune-91b-raporu.md', expectContains: '26 °C', kind: 'ayirt-edici' },
  { query: "SNV-4512 nedir", expectFile: 'egitim-programi-3.md', expectContains: 'SNV-4512', kind: 'identifier' },
  { query: "YTK-227 hangi yetkinliğin kodudur", expectFile: 'egitim-programi-4.md', expectContains: 'YTK-227', kind: 'identifier' },
  { query: "EGT-1B modülünün sınav formu hangisidir", expectFile: 'egitim-programi-2.md', expectContains: 'SNV-4413', kind: 'identifier' },
  { query: "sarmalak tekrar yöntemi nedir", expectFile: 'egitim-programi-1.md', expectContains: 'sarmalak tekrar yöntemi', kind: 'nadir-terim' },
  { query: "belirtek kartı ne işe yarar", expectFile: 'egitim-programi-3.md', expectContains: 'belirtek kartı', kind: 'nadir-terim' },
  { query: "TAVLIM ölçeği hangi modülde kullanılıyor", expectFile: 'egitim-programi-4.md', expectContains: 'TAVLIM ölçeği', kind: 'nadir-terim' },
  { query: "EGT-1B modülünün toplam süresi kaç saattir", expectFile: 'egitim-programi-2.md', expectContains: '44 saat', kind: 'numeric' },
  { query: "EGT-2A modülünde kaç saat uygulama atölyesi var", expectFile: 'egitim-programi-3.md', expectContains: '22 saati uygulama', kind: 'numeric' },
  { query: "EGT-1A modülünde başarı eşiği kaç puandır", expectFile: 'egitim-programi-1.md', expectContains: '65 puandır', kind: 'numeric' },
  { query: "diploma zaman aşımına uğrarsa hangi adım atılır", expectFile: 'egitim-programi-5.md', expectContains: 'tazeleme oturumuna', kind: 'paraphrase' },
  { query: "rahatsızlanan biri kaçırdığı bölümü sonradan nasıl kapatır", expectFile: 'egitim-programi-5.md', expectContains: 'telafi oturumuna', kind: 'paraphrase' },
  { query: "muhabere sağlanamadığında görevliler nerede bir araya gelir", expectFile: 'egitim-programi-4.md', expectContains: 'buluşma noktasına', kind: 'paraphrase' },
  { query: "alan gözlemi modüllerinden hangisinin sınavı iki aşamalıdır", expectFile: 'egitim-programi-2.md', expectContains: 'iki oturumda', kind: 'ayirt-edici' },
  { query: "koordinasyon atölyelerinin hangisinde iki eğitmen bulunması şarttır", expectFile: 'egitim-programi-4.md', expectContains: 'gözetmen eğitmen', kind: 'ayirt-edici' },
  { query: "SVK-4471 kodlu sevk emri hangi aktarma merkezinde açılır", expectFile: 'sevkiyat-1.md', expectContains: 'SVK-4471', kind: 'identifier' },
  { query: "IRS-7731 irsaliye serisi hangi merkezde kullanılır", expectFile: 'sevkiyat-2.md', expectContains: 'IRS-7731', kind: 'identifier' },
  { query: "R-14-C raf adresinde ne saklanır", expectFile: 'envanter-3.md', expectContains: 'R-14-C', kind: 'identifier' },
  { query: "sirkaj sayımı nedir", expectFile: 'envanter-3.md', expectContains: 'sirkaj sayımı', kind: 'nadir-terim' },
  { query: "mubranj etiketi hangi bilgileri taşır", expectFile: 'iade-4.md', expectContains: 'mubranj etiketi', kind: 'nadir-terim' },
  { query: "zerpen kilidi ne işe yarar", expectFile: 'ambalaj-5.md', expectContains: 'zerpen kilidi', kind: 'nadir-terim' },
  { query: "Kuzey merkezinden bir seferde en fazla kaç koli sevk edilir", expectFile: 'sevkiyat-1.md', expectContains: '180 koli', kind: 'numeric' },
  { query: "Güney merkezinde palet başına azami taşıma ağırlığı kaç kg", expectFile: 'sevkiyat-2.md', expectContains: '640 kg', kind: 'numeric' },
  { query: "bir raf gözüne azami kaç palet yerleştirilir", expectFile: 'envanter-3.md', expectContains: '24 palet', kind: 'numeric' },
  { query: "müşterinin beğenmeyip yolladığı mallar hemen satışa açılabilir mi", expectFile: 'iade-4.md', expectContains: 'karantina bölmesinde', kind: 'paraphrase' },
  { query: "cam ve seramik eşyalar nakil sırasında zarar görmesin diye ne yapılmalı", expectFile: 'ambalaj-5.md', expectContains: 'çift cidarlı oluklu mukavva', kind: 'paraphrase' },
  { query: "toplama işi verilen sürede bitmezse durum nereye yazılır", expectFile: 'sevkiyat-2.md', expectContains: 'ODK-7', kind: 'paraphrase' },
  { query: "sevk irsaliyesi dört nüsha basılan merkez hangisidir", expectFile: 'sevkiyat-2.md', expectContains: 'dört nüsha', kind: 'ayirt-edici' },
  { query: "toplanan kolilerin araç gelene kadar bekletildiği hazırlık alanının adresi nedir", expectFile: 'sevkiyat-1.md', expectContains: 'R-15-C', kind: 'ayirt-edici' },
  { query: "KDM-7741 nedir", expectFile: 'saha-cihazlari-1.md', expectContains: 'KDM-7741', kind: 'identifier' },
  { query: "KDM-2262 güç modülü hangi cihazda kullanılıyor", expectFile: 'saha-cihazlari-2.md', expectContains: 'KDM-2262', kind: 'identifier' },
  { query: "KDM-4403 bakım kitinin içeriği nedir", expectFile: 'saha-cihazlari-4.md', expectContains: 'KDM-4403', kind: 'identifier' },
  { query: "kaviteon uç ne işe yarar", expectFile: 'saha-cihazlari-1.md', expectContains: 'kaviteon', kind: 'nadir-terim' },
  { query: "girdapölçer modülü hangi cihazda bulunur", expectFile: 'saha-cihazlari-3.md', expectContains: 'girdapölçer', kind: 'nadir-terim' },
  { query: "BŞF-204 formuna neler yazılır", expectFile: 'saha-cihazlari-4.md', expectContains: 'BŞF-204', kind: 'nadir-terim' },
  { query: "KDM-2'nin örnekleme hızı kaç örnek/saniye", expectFile: 'saha-cihazlari-2.md', expectContains: '41.000 örnek', kind: 'numeric' },
  { query: "KDM-3'ün örnekleme hızı kaç örnek/saniye", expectFile: 'saha-cihazlari-3.md', expectContains: '41.500 örnek', kind: 'numeric' },
  { query: "KDM-1 bataryasıyla birlikte kaç gram", expectFile: 'saha-cihazlari-1.md', expectContains: '1.240 g', kind: 'numeric' },
  { query: "dondurucu soğukta makine daha ısınmadan çıkan sayılara güvenilir mi", expectFile: 'saha-cihazlari-5.md', expectContains: 'ilk on dakikada', kind: 'paraphrase' },
  { query: "verileri masaüstü makineme indiremiyorum, transfer sürekli yarıda kesiliyor", expectFile: 'saha-cihazlari-5.md', expectContains: 'uyku moduna geçer', kind: 'paraphrase' },
  { query: "sertifikasız yeni bir işçi tek başına veri toplayabilir mi", expectFile: 'saha-cihazlari-5.md', expectContains: 'yalnız gözlemci olarak', kind: 'paraphrase' },
  { query: "bataryası sahada operatör tarafından değiştirilebilen model hangisi", expectFile: 'saha-cihazlari-2.md', expectContains: 'araçsız çıkarılabilir', kind: 'ayirt-edici' },
  { query: "kalibrasyon sertifikası 24 ay geçerli olan cihaz hangisi", expectFile: 'saha-cihazlari-3.md', expectContains: '24 ay', kind: 'ayirt-edici' },
  { query: "ISS-3312 nedir", expectFile: 'yazilim-surum-1.md', expectContains: 'ISS-3312', kind: 'identifier' },
  { query: "ISS-3313 hangi sorunu kapatıyor", expectFile: 'yazilim-surum-2.md', expectContains: 'ISS-3313', kind: 'identifier' },
  { query: "ISS-3314 kaydı ne hakkında", expectFile: 'yazilim-surum-3.md', expectContains: 'ISS-3314', kind: 'identifier' },
  { query: "sarnıçlama nedir", expectFile: 'yazilim-surum-2.md', expectContains: 'sarnıçlama', kind: 'nadir-terim' },
  { query: "TEKÇE-9 profili ne işe yarar", expectFile: 'yazilim-surum-4.md', expectContains: 'TEKÇE-9', kind: 'nadir-terim' },
  { query: "çırpı indeksi ne yapar", expectFile: 'yazilim-surum-3.md', expectContains: 'çırpı indeksi', kind: 'nadir-terim' },
  { query: "3.2 sürümünde kuyruk eşik değeri varsayılanı kaç kayıt", expectFile: 'yazilim-surum-2.md', expectContains: '24.500', kind: 'numeric' },
  { query: "4.0 sürümünde kuyruk eşik değeri varsayılanı kaç kayıt", expectFile: 'yazilim-surum-3.md', expectContains: '42.000', kind: 'numeric' },
  { query: "iş kuyruğu dinleyicisi hangi bağlantı noktasını kullanır", expectFile: 'yazilim-surum-4.md', expectContains: '8411', kind: 'numeric' },
  { query: "güncelleme yaparken kayıtlarım bozulur mu", expectFile: 'yazilim-surum-5.md', expectContains: 'tam yedek alınması', kind: 'paraphrase' },
  { query: "ekiplerin çalışamayacağı bir aralık ayırmam şart mı", expectFile: 'yazilim-surum-5.md', expectContains: 'kesinti penceresi', kind: 'paraphrase' },
  { query: "yeni sürümden memnun kalmazsam ne yapabilirim", expectFile: 'yazilim-surum-5.md', expectContains: 'yedekten geri yüklemedir', kind: 'paraphrase' },
  { query: "günlük saklama süresi varsayılanı 30 gün olan sürüm hangisi", expectFile: 'yazilim-surum-1.md', expectContains: '30 gündür', kind: 'ayirt-edici' },
  { query: "yeniden deneme varsayılanı 5'e çıkarılan sürüm hangisi", expectFile: 'yazilim-surum-2.md', expectContains: '5 denemedir', kind: 'ayirt-edici' },
  { query: "FRM-2041 kodlu form hangi talep için doldurulur", expectFile: 'izin-1.md', expectContains: 'FRM-2041', kind: 'identifier' },
  { query: "FRM-2042 nedir", expectFile: 'izin-2.md', expectContains: 'FRM-2042', kind: 'identifier' },
  { query: "FRM-3317 formu ne için kullanılır", expectFile: 'seyahat-1.md', expectContains: 'FRM-3317', kind: 'identifier' },
  { query: "mahsupname nedir", expectFile: 'izin-1.md', expectContains: 'mahsupname adı verilen', kind: 'nadir-terim' },
  { query: "tenzilatname ne zaman dikkate alınmaz", expectFile: 'satinalma-1.md', expectContains: 'tenzilatname ile bildirilir', kind: 'nadir-terim' },
  { query: "DEVKAP tutanağı ne işe yarar", expectFile: 'arsiv-1.md', expectContains: 'DEVKAP tutanağı ile belgelenir', kind: 'nadir-terim' },
  { query: "doğrudan temin ile yapılacak alımlarda üst sınır kaç TL", expectFile: 'satinalma-1.md', expectContains: '185.000 TL', kind: 'numeric' },
  { query: "yurt içi görevlendirmede avansın üst sınırı kaç TL", expectFile: 'seyahat-1.md', expectContains: '18.500 TL', kind: 'numeric' },
  { query: "kurum arşivinde evrak kaç yıl saklanır", expectFile: 'arsiv-1.md', expectContains: '25 yıl', kind: 'numeric' },
  { query: "tatildeyken masasına kim bakacak", expectFile: 'izin-1.md', expectContains: 'vekâleten görevlendirilen', kind: 'paraphrase' },
  { query: "fişleri gecikmeli getiren ne kaybeder", expectFile: 'seyahat-1.md', expectContains: 'bir sonraki maaş ödemesinden kesilir', kind: 'paraphrase' },
  { query: "artık gerekmeyen eski kâğıtlardan nasıl kurtulunur", expectFile: 'arsiv-1.md', expectContains: 'öğütücüde yok edilir', kind: 'paraphrase' },
  { query: "saha birimlerinde bir sonraki yıla en çok kaç gün izin devredilebilir", expectFile: 'izin-2.md', expectContains: '9 iş günü', kind: 'ayirt-edici' },
];
