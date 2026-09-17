/**
 * Uygulama içi "Yenilikler" (changelog) içeriği.
 *
 * ELLE YAZILIYOR, KULLANICI DİLİNDE ve KURUMSAL TONDA. Ürün kurumsal
 * müşteriye sunuluyor; günlük konuşma dili ve ettirgen çatı
 * ("düzenletebilirsiniz") burada kulağı tırmalıyor. Edilgen ve nesnel
 * anlatım tercih ediliyor: "düzenlenebilir". Commit mesajı kopyalamak cazip ama
 * kullanıcıyı ilgilendiren şey ne yaptığımız değil, ne kazandığı: "MuPDF
 * entegrasyonu" değil "PDF belgelerini düzenleyebilirsiniz". Bir test jargon
 * sızmasını yakalıyor.
 *
 * Tarihler git geçmişinden alındı, uydurulmadı.
 *
 * Sürüm alanı ANA HAT ("2.36"): yama sürümleri (2.36.1) ayrı kayıt
 * gerektirmiyor, ama yeni bir ana hatta geçilince test not yazılmasını
 * zorunlu kılıyor.
 */

/** Kullanıcının en son gördüğü sürümün tutulduğu anahtar. */
export const SON_GORULEN_ANAHTARI = 'yeniliklerSonGorulen';

export interface Yenilik {
  /** Ana hat: "2.36". Yama numarası yazılmıyor. */
  surum: string;
  /** ISO tarih: "2026-08-25" */
  tarih: string;
  baslik: string;
  maddeler: string[];
}

/** YENİDEN ESKİYE sıralı. Bir test bunu koruyor. */
export const YENILIKLER: Yenilik[] = [
  {
    surum: '2.57',
    tarih: '2026-09-08',
    baslik: 'Belge sonucunu değerlendiren yanıtlar',
    maddeler: [
      'Sohbetteki belgeleri listeleme ve belge panelini açıp kapatma ayrı düğmelerden yapılır. Açık panelden çıkmadan başka bir belge seçilebilir.',
      'Belge araçları üst çubukta, dosya eylemleri panel başlığında düzenlenmiştir. Uzun dosya adlarında düğmeler korunur; telefonda belge açıkken de sohbet listesine erişilebilir.',
      'Sol kenar çubuğundaki düğmelere sohbet alanıyla uyumlu ikon, üzerine gelme ve basış animasyonları eklenmiştir.',
      'Panel, menü ve pencereler yumuşak geçişlerle açılıp kapanır. Sohbet taslağı ve seçili belge korunur; azaltılmış hareket tercihi desteklenir.',
      'Belge sonucu değerlendirmesi tüm sohbetlerde etkindir. Model, belge işleminin sonucunu aldıktan sonra yanıtına devam eder.',
      'Sunumlarda başlık ve içerik için ayrı alan ayrılır. Sığmayan metinler ve tablolar içerik korunarak devam slaytlarına taşınır.',
      'Belge işlemlerinin hataları, uygulanamayan değişiklikleri ve uyarıları son yanıta taşınır. Yinelenen aynı işlem ikinci bir dosya oluşturmaz.',
      'Uzayan belge işlemlerine sınır uygulanır; tamamlanan dosyalar korunur. Belge hazır olduktan sonra yanıt durdurulduğunda dosya panelde kullanılmaya devam eder.',
      'İşlem durumu ve toplam çağrı bütçesi yanıtın bağlam bilgisinden incelenebilir.',
    ],
  },
  {
    surum: '2.56',
    tarih: '2026-09-08',
    baslik: 'Belge işlemleri ve yanıt akışı güçlendirildi',
    maddeler: [
      'Proje detaylarına belge paneli kapatılmadan erişilebilir. Geniş ekranlarda paneller yan yana, dar ekranlarda geçiş düğmeleriyle gösterilir.',
      'Belge oluşturulurken kullanıcının asıl isteği, ilgili kaynaklar, konuşma geçmişi ve proje talimatları birlikte değerlendirilir.',
      'Başka bir sohbete geçildiğinde devam eden belge işi kendi sohbetine kaydedilir; açık sohbetin görünümü korunur.',
      'Durdur düğmesi belge oluşturma, düzenleme ve şablon doldurma işlemlerinde de kullanılabilir. İptal edilen işin geç gelen sonucu yeni bir belge oluşturmaz.',
      'Bağlantı kesildiğinde yarım yanıt açıkça belirtilir. Dosya kaydı başarısız olduğunda tamamlanmış belge bildirimi gösterilmez.',
      'Yanıt başka bir modelden alındığında o modelin sınırları ve ayarları kullanılır; yanıtı üreten modelin etiketi sohbet yeniden açıldığında da korunur.',
    ],
  },
  {
    surum: '2.55',
    tarih: '2026-09-07',
    baslik: 'Belge soruları daha güvenilir yanıtlanıyor',
    maddeler: [
      '"Peki", "Tamam", "Evet" gibi bir sözcükle başlayan sorularda yüklenen belgelerde arama yapılmıyordu; bu sorular artık belgeye bakılarak yanıtlanıyor.',
      'Selamlama ve kısa onay mesajları eskisi gibi gereksiz arama başlatmıyor.',
      'Belgelerden getirilen bölüm sayısı artırıldı ve bulunan bölümler yer varken kısaltılmıyor; sorunun cevabı belgede geçtiği hâlde yanıta girmeme durumu azaldı.',
    ],
  },
  {
    surum: '2.54',
    tarih: '2026-09-02',
    baslik: 'Yanıtın hangi bağlamla üretildiği görülebiliyor',
    maddeler: [
      'Bağlama dokunulan yanıtların altında bir katman simgesi belirir; o yanıt üretilirken modele ne gönderildiğini gösterir: kaç mesaj iletildi, hangileri kısaltıldı, özet devrede miydi, kaç belge parçası eklendi. Sıradan yanıtlarda görünmez.',
      'Uzun sohbetlerde bağlamdan bir şey çıkarıldığında — mesaj pencereye sığmadığında ya da geçmişin yerine özet geçtiğinde — simgenin üzerinde bir işaret belirir; beklenmedik bir yanıt alındığında nedeni buradan incelenebilir.',
      'Bu bilgi yalnızca kendi cihazınızda tutulur, hiçbir yere gönderilmez.',
    ],
  },
  {
    surum: '2.53',
    tarih: '2026-09-02',
    baslik: 'Proje belleği korumaya alındı',
    maddeler: [
      'Proje belleği madde madde görüntüleniyor; her satır ayrı bir bilgi olarak listeleniyor.',
      'Bellek varsayılan olarak salt okunur. Düzenlemek için kilidin açılması gerekiyor; bu sırada değişikliğin projedeki bütün sohbetleri etkileyeceği hatırlatılıyor.',
      'Sohbette onaylanan bir bilgi, sayfa yenilenmeden bellek panelinde görünüyor.',
      'Ekleme önerisi, bilginin belleğe kaydedileceği biçimde gösteriliyor.',
    ],
  },
  {
    surum: '2.52',
    tarih: '2026-09-01',
    baslik: 'Model sunucusundaki ad değişiklikleri sohbeti kesmiyor',
    maddeler: [
      'Bir model sunucu tarafında farklı bir adla tanımlandığında uygulama yeni adı kendisi bulur ve isteği tamamlar; sohbet, belge oluşturma ve belge düzenleme kesintiye uğramaz.',
      'Ad daha sonra eski hâline döndürüldüğünde de aynı şekilde uyum sağlanır; yeni bir uygulama sürümü beklemeye gerek kalmaz.',
      'Konuşma özeti ve sohbet başlığı gibi arka planda yürüyen işlemler de aynı korumaya sahiptir.',
    ],
  },
  {
    surum: '2.51',
    tarih: '2026-09-01',
    baslik: 'Belge denetimi ve sohbeti geri sarma',
    maddeler: [
      'Oluşturulan belge yalnızca başlıklardan ibaret kaldığında ya da tabloya veri girilmediğinde bu durum bildirilir. Belge yine indirilebilir.',
      'Bir mesajın yanındaki geri sarma düğmesiyle sohbet o noktaya döndürülebilir; sonraki mesajlar bırakılır ve mesajın metni yazı alanına geri gelir.',
      'Bırakılan mesajlar silinmez; bildirimdeki geri alma seçeneğiyle konuşma eski hâline döndürülebilir.',
    ],
  },
  {
    surum: '2.50',
    tarih: '2026-09-01',
    baslik: 'Proje bilgileri sohbetten kaydedilebiliyor',
    maddeler: [
      'Bir proje sohbetinde, sonraki sohbetlerde de geçerli olacak bir bilgi geçtiğinde mesajın altında bunu proje hafızasına kaydetme önerisi görünür.',
      'Kayıt yalnızca onaylandığında yapılır ve aynı bilgi ikinci kez kaydedilmez.',
      'Proje hafızası her zaman olduğu gibi proje panelinden görüntülenebilir ve düzenlenebilir.',
    ],
  },
  {
    surum: '2.49',
    tarih: '2026-08-31',
    baslik: 'Model kesintilerinde yanıt alınmaya devam ediliyor',
    maddeler: [
      'Seçili model geçici olarak yanıt veremediğinde yanıt diğer modelden alınır ve bu durum bildirilir.',
      'Yanıtı hangi modelin ürettiği mesajın altında görünür.',
      'Konuşmada görsel varsa yalnızca görselleri okuyabilen bir modele geçilir.',
    ],
  },
  {
    surum: '2.48',
    tarih: '2026-08-31',
    baslik: 'Uzun sohbetlerde geçmiş daha iyi korunuyor',
    maddeler: [
      'Uzun sohbetlerde önceki turlar daha uzun süre hatırlanır; konuşma özetine geçiş daha geç yapılır.',
      'Sohbette görüntülenen ve kaydedilen mesajlar değişmeden kalır.',
    ],
  },
  {
    surum: '2.47',
    tarih: '2026-08-31',
    baslik: 'Yarım kalan yanıtlar bildiriliyor',
    maddeler: [
      'Yanıt uzunluk sınırına takılarak yarım kaldığında bu durum mesajın altında bildirilir ve yanıtın sürdürülmesi istenebilir.',
      'Konuşma uzunluk sınırını aştığında istek hata vermek yerine yeniden denenir; sonuç bildirilir.',
      'Ekli bir belgeden yeni bir dosya oluşturma istekleri daha güvenilir algılanır.',
    ],
  },
  {
    surum: '2.46',
    tarih: '2026-08-31',
    baslik: 'Sürüm bildirimi ve mesaj açılış animasyonu',
    maddeler: [
      'Sayfa açıkken yeni bir sürüm yayınlandığında bildirim gösterilir; bildirimdeki düğme sayfayı güncel sürümle yeniler.',
      'Sayfa dosyaları artık her açılışta doğrulanır; güncelleme sonrası eski ekranın kalması önlenir.',
      'Kısaltılmış mesajlar açılıp kapanırken yumuşak bir geçişle hareket eder.',
    ],
  },
  {
    surum: '2.45',
    tarih: '2026-08-29',
    baslik: 'Uzun metin yapıştırma',
    maddeler: [
      'Girdi alanına uzun bir metin yapıştırıldığında metin, yazı alanını doldurmak yerine ilk satırlarını gösteren küçük bir karta dönüşür.',
      'Kartın üzerine tıklandığında yapıştırılan metnin tamamı ayrı bir pencerede görüntülenir.',
      'Yapıştırılan metin, mesajın parçası olarak gönderilir.',
    ],
  },
  {
    surum: '2.44',
    tarih: '2026-08-29',
    baslik: 'Uzun mesajlar kısaltılarak gösteriliyor',
    maddeler: [
      'Gönderilen uzun mesajlar altı satırda kesilir; tamamı, mesajın sağ alt köşesindeki okla açılır.',
      'Altı satırın altındaki mesajlar olduğu gibi görünmeye devam eder.',
      'Sohbetin en altına inme düğmesi küçültülüp yazı alanının üzerine ortalandı; "en başa dön" düğmesi kaldırıldı.',
    ],
  },
  {
    surum: '2.43',
    tarih: '2026-08-28',
    baslik: 'Belge düzenleme isteklerinin algılanması',
    maddeler: [
      'Ekli bir belgede değişiklik isteyip istemediğiniz, cevabı yazan modelin kendisi tarafından değerlendirilir; konuşmanın tamamı dikkate alınır.',
      'Belge ekliyken mesaj beklemeden gönderilir.',
      'Düzenleme isteği artık sohbette de görünür: model ne değiştirdiğini kısaca yazar, değişiklikler yandaki panelde listelenir.',
    ],
  },
  {
    surum: '2.42',
    tarih: '2026-08-28',
    baslik: 'Model ve seviye seçimi tek düğmede',
    maddeler: [
      'Model ve yanıt seviyesi tek düğmeden seçilir; giriş alanındaki dişli simgesi bu pencereyi açar.',
      'Seçili model pencerenin başlığında, seçili seviye ise kaydırıcının üzerinde görünür.',
      'Seviye kaydırıcıyla belirlenir; kaydırıldıkça seviyenin adı değişir.',
      'Giriş alanı, daha az yer kaplayan düğmeler sayesinde daha uzun süre tek satır kalır.',
    ],
  },
  {
    surum: '2.41',
    tarih: '2026-08-28',
    baslik: 'Mesaj yazma alanı',
    maddeler: [
      'Kısa mesajlarda giriş alanı tek satır olarak durur; metin uzadıkça düğmeler bir alt satıra iner ve yazı alanı genişler.',
      'Yazı alanı beş satıra kadar büyür, sonrasında kaydırılır.',
    ],
  },
  {
    surum: '2.40',
    tarih: '2026-08-26',
    baslik: 'Belge oluşturma isteklerinin algılanması',
    maddeler: [
      'Dosya isteği, konuşmanın tamamı dikkate alınarak değerlendirilir; "bunu rapor hâline getir" gibi dolaylı ifadeler de tanınır.',
      'Oluşturulan dosyanın adı, konuşmanın konusuna göre belirlenir.',
    ],
  },
  {
    surum: '2.39',
    tarih: '2026-08-26',
    baslik: 'Akıl yürütme seviyesi seçimi',
    maddeler: [
      'Akıl yürütme seviyesi kaydırıcı ile seçilir; seviyeler soldan sağa artar.',
      'Kaydırıcı sürüklenirken kesintisiz hareket eder ve seviyelere yaklaşınca oturur.',
    ],
  },
  {
    surum: '2.37',
    tarih: '2026-08-25',
    baslik: 'Yenilikler penceresi',
    maddeler: [
      'Uygulamaya eklenen özellikler ve yapılan iyileştirmeler, sol alttaki sürüm numarasına tıklanarak görüntülenebilir.',
      'Yeni bir sürüm notu yayımlandığında düğme belirginleşir; not görüntülendikten sonra olağan görünümüne döner.',
    ],
  },
  {
    surum: '2.36',
    tarih: '2026-08-25',
    baslik: 'Proje dışa ve içe aktarma',
    maddeler: [
      'Bir proje tek bir dosyaya aktarılarak farklı bir kuruluma taşınabilir veya başka bir kullanıcıyla paylaşılabilir.',
      'Sohbet geçmişinin dosyaya dâhil edilmesi isteğe bağlıdır; paylaşım durumunda kapalı bırakılması önerilir.',
      'İçe aktarma her zaman yeni bir proje oluşturur; mevcut projeler değiştirilmez.',
    ],
  },
  {
    surum: '2.34',
    tarih: '2026-08-24',
    baslik: 'Sohbet arama ve hızlı erişim',
    maddeler: [
      'Sohbetler, kenar çubuğundaki arama alanından başlığa göre filtrelenebilir.',
      'Ctrl+K (macOS’ta ⌘K) kısayolu hızlı erişim penceresini açar.',
      'Arama Türkçe karakterleri doğru eşleştirir; şapkasız yazımda da sonuç döner.',
    ],
  },
  {
    surum: '2.31',
    tarih: '2026-08-24',
    baslik: 'Yanıt süresi iyileştirmesi',
    maddeler: [
      'Sohbetler varsayılan olarak Dengeli akıl yürütme seviyesiyle başlar; yanıt süresi belirgin şekilde kısalmıştır.',
      'Daha kapsamlı çözümleme gerektiren sorular için Derin seviyesi seçilebilir.',
    ],
  },
  {
    surum: '2.28',
    tarih: '2026-08-22',
    baslik: 'PDF belgelerinde düzenleme',
    maddeler: [
      'Yüklenen PDF belgelerinde metin değişikliği yapılabilir; belgenin özgün sayfa düzeni korunur.',
      'Satıra sığmayan metin, punto küçültülerek yerleştirilir.',
      'Metin katmanı bulunmayan taranmış PDF belgeleri düzenlenemez.',
    ],
  },
  {
    surum: '2.26',
    tarih: '2026-08-21',
    baslik: 'Dosya ekleme ve mobil görünüm',
    maddeler: [
      'Dosyalar, pencerenin herhangi bir noktasına sürüklenerek eklenebilir.',
      'Dar ekranlarda model ve seviye düğmeleri artık satıra sığar; giriş alanı taşmaz.',
    ],
  },
  {
    surum: '2.25',
    tarih: '2026-08-21',
    baslik: 'Eşzamanlı sohbet',
    maddeler: [
      'Bir sohbetin yanıtı beklenirken başka bir sohbete geçilebilir ve yeni mesaj gönderilebilir.',
      'Yanıt bekleyen sohbetler kenar çubuğunda işaretlenir.',
    ],
  },
  {
    surum: '2.24',
    tarih: '2026-08-20',
    baslik: 'Şablon doldurma',
    maddeler: [
      'İçinde {{...}} biçiminde yer tutucular bulunan belgeler yüklenerek ilgili alanların doldurulması sağlanabilir.',
      'Word, Excel, PowerPoint ve PDF şablonları desteklenir.',
    ],
  },
  {
    surum: '2.21',
    tarih: '2026-08-19',
    baslik: 'Belge oluşturma',
    maddeler: [
      'Word, Excel ve PowerPoint dosyaları doğrudan sohbet üzerinden oluşturulabilir.',
      'Oluşturulan dosyalar içeriğe uygun bir adla indirilir.',
      'Hazırlama sürecinde ilerleme durumu görüntülenir.',
    ],
  },
  {
    surum: '2.18',
    tarih: '2026-08-14',
    baslik: 'Arşiv ve kaynak kodu desteği',
    maddeler: [
      'Sıkıştırılmış arşiv (.zip) yüklenerek içindeki dosyalar hakkında soru sorulabilir.',
      'Kaynak kodu dosyalarında yanıtlar, bilginin alındığı satır aralığını belirtir.',
    ],
  },
  {
    surum: '2.16',
    tarih: '2026-08-14',
    baslik: 'Excel dosyalarında düzenleme',
    maddeler: [
      'Yüklenen Excel dosyalarında hücre içerikleri güncellenebilir ve dosya yeniden indirilebilir.',
    ],
  },
  {
    surum: '2.9',
    tarih: '2026-08-12',
    baslik: 'PowerPoint sunumlarında düzenleme',
    maddeler: [
      'Sunum dosyalarındaki metinler düzenlenebilir ve dosya yeniden indirilebilir.',
    ],
  },
  {
    surum: '2.7',
    tarih: '2026-08-12',
    baslik: 'Word belgelerinde düzenleme',
    maddeler: [
      'Yüklenen Word belgeleri düzenlenebilir; yapılan değişiklikler önizleme panelinde işaretli olarak gösterilir.',
      'Sonuç indirilebilir veya düzenlemeye devam edilebilir.',
    ],
  },
  {
    surum: '2.1',
    tarih: '2026-07-31',
    baslik: 'Taranmış belge ve görsel desteği',
    maddeler: [
      'Taranmış PDF belgeleri ve belge içindeki görseller metne dönüştürülerek aranabilir hâle getirilir.',
      'Belge arama isabeti artırılmıştır.',
      'Görsel işleyebilen model desteği eklenmiştir; ekran görüntüsü ve fotoğraf gönderilebilir.',
    ],
  },
];

/**
 * Çalışan sürüm, kayıt sürümünün altında mı?
 *
 * Kayıt "2.37" ise 2.37.0 ve 2.37.4 kapsanır. Kayıt "2.37.4" yazılırsa YALNIZ
 * o yama kapsanır — "bu deploy önemli, bayrak sıfırlansın" demek istediğimizde
 * yama seviyesinde kayıt açabiliyoruz.
 */
export function surumKapsiyorMu(calisan: string, kayit: string): boolean {
  const c = calisan.split('.');
  const k = kayit.split('.');
  if (k.length > c.length) return false;
  return k.every((parca, i) => parca === c[i]);
}

/** Sayısal sürüm karşılaştırması. Dize karşılaştırması "2.9" > "2.36" der. */
export function surumKarsilastir(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10));
  const pb = b.split('.').map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Kullanıcının görmediği kayıt sayısı.
 *
 * Hiç açılmamışsa (null ya da tanınmayan değer) TÜMÜ okunmamış sayılıyor:
 * panel ilk kez geldiğinde kullanıcı biriken her şeyi görsün.
 */
export function okunmamisSayisi(sonGorulen: string | null): number {
  if (!sonGorulen || !/^\d/.test(sonGorulen)) return YENILIKLER.length;
  return YENILIKLER.filter((y) => surumKarsilastir(y.surum, sonGorulen) > 0).length;
}

/**
 * Rozetin durumu.
 *
 * KURAL: kullanıcı YENİ BİR SÜRÜM kurduğunda rozet yanar. Not yazılmış olması
 * şart değil — kullanıcı güncelleme aldığını görmeli.
 *
 * Yalnız "yeni kayıt var mı" bakılsaydı yama sürümlerinde sessiz kalırdı ve
 * kullanıcı yeni sürümü kurduğu hâlde rozette sürüm numarası görürdü.
 *
 * SAYI AYRI TUTULUYOR: rozet yanabilir ama gösterilecek yeni kayıt
 * olmayabilir (yama sürümü). İkisi tek değer olsaydı balonda
 * "0 yeni değişiklik" yazardı.
 */
export function rozetDurumu(
  sonGorulen: string | null,
  calisanSurum: string,
): { yeniVar: boolean; yeniKayitSayisi: number } {
  return {
    yeniVar: sonGorulen !== calisanSurum,
    yeniKayitSayisi: okunmamisSayisi(sonGorulen),
  };
}
