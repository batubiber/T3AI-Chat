import { describe, it, expect } from 'vitest';
import {
  belgeDuzenleAraci, belgeDuzenlemeIpucu, sohbetAraclari, duzenlemeHedefiCoz, type DuzenlemeHedefi,
} from './belgeDuzenlemeAraci';

describe('belgeDuzenleAraci', () => {
  it('vLLM araç şemasına uyuyor — ad, tip ve zorunlu argüman', () => {
    const a = belgeDuzenleAraci('rapor.docx', 'Word belgesi');
    expect(a.type).toBe('function');
    expect(a.function.name).toBe('belge_duzenle');
    expect(a.function.parameters.required).toEqual(['talimat']);
    expect(a.function.parameters.properties.talimat.type).toBe('string');
  });

  it('DOSYA ADI açıklamada — model neyi düzenleyeceğini görmeli', () => {
    expect(belgeDuzenleAraci('bütçe.xlsx', 'Excel dosyası').function.description).toContain('bütçe.xlsx');
  });

  it('TÜR ETİKETİ açıklamada — sabit "Word belgesi" PPTX\'te modeli yanıltıyordu', () => {
    const d = belgeDuzenleAraci('sunum.pptx', 'PowerPoint sunumu').function.description;
    expect(d).toContain('PowerPoint sunumu');
    expect(d).not.toContain('Word');
  });

  it('SORU ile DEĞİŞİKLİK ayrımını açıkça söylüyor', () => {
    const d = belgeDuzenleAraci('a.docx', 'Word belgesi').function.description;
    expect(d).toMatch(/SORU/);
    expect(d).toMatch(/çağırma/);
  });
});

describe('belgeDuzenlemeIpucu', () => {
  const dosya: DuzenlemeHedefi = {
    tur: 'dosya', ad: 'rapor.docx', turEtiketi: 'Word belgesi', dosya: new File([], 'rapor.docx'),
  };
  const artifact: DuzenlemeHedefi = {
    tur: 'artifact', ad: 'rapor.docx', turEtiketi: 'Word belgesi', artifactId: 'a1',
  };

  it('EKLENEN belge ile SOHBETTEKİ belgeyi farklı anlatıyor', () => {
    // Aynı cümle ikisinde de kullanılsa artifact durumunda model kullanıcının
    // az önce dosya eklediğini sanıp "eklediğiniz belge" diye cevap veriyor.
    expect(belgeDuzenlemeIpucu(dosya)).toContain('EKLEDİ');
    expect(belgeDuzenlemeIpucu(artifact)).not.toContain('EKLEDİ');
    expect(belgeDuzenlemeIpucu(artifact)).toContain('ÜZERİNDE ÇALIŞILAN');
  });

  it('her iki durumda da dosya adını ve araç adını veriyor', () => {
    for (const h of [dosya, artifact]) {
      expect(belgeDuzenlemeIpucu(h)).toContain('rapor.docx');
      expect(belgeDuzenlemeIpucu(h)).toContain('belge_duzenle');
    }
  });

  it('belgeyi cevabın içine yeniden yazmayı YASAKLIYOR', () => {
    // Not kalkarsa model belgenin tamamını sohbete döküyor — biçimi kaybolmuş,
    // indirilemeyen bir metin yığını çıkıyor.
    expect(belgeDuzenlemeIpucu(dosya)).toMatch(/yeniden YAZMA/);
  });
});

describe('sohbetAraclari', () => {
  const hedef: DuzenlemeHedefi = {
    tur: 'artifact', ad: 'teklif.pptx', turEtiketi: 'PowerPoint sunumu', artifactId: 'a1',
  };

  it('hedef YOKSA düzenleme aracı tanıtılmıyor', () => {
    // Tanıtılsaydı model ortada belge olmadan belge_duzenle çağırabilirdi;
    // panel açacak bir dosya bulamaz ve kullanıcı sessiz bir hiç görür.
    expect(sohbetAraclari(undefined).map((a) => a.function.name)).toEqual(['belge_uret']);
  });

  it('hedef VARSA iki araç birden', () => {
    // Üretme aracı DURUYOR: ekli belge varken de "bundan bir sunum çıkar"
    // denebilir; o istek düzenleme değil üretimdir.
    expect(sohbetAraclari(hedef).map((a) => a.function.name)).toEqual(['belge_uret', 'belge_duzenle']);
  });

  it('düzenleme aracı hedefin adını ve türünü taşıyor', () => {
    const d = sohbetAraclari(hedef)[1].function.description;
    expect(d).toContain('teklif.pptx');
    expect(d).toContain('PowerPoint sunumu');
  });
});

describe('duzenlemeHedefiCoz', () => {
  const d = (ad: string) => ({ ad, dosya: new File([], ad) });
  // Gerçek çözücü documentEditing.ts'te ve JSZip'i içeri çekiyor; kural
  // testinin formatı bilmesi gerekmiyor, enjekte ediliyor.
  const bicimCoz = (ad: string) =>
    ad.endsWith('.docx') ? 'Word belgesi' : ad.endsWith('.pptx') ? 'PowerPoint sunumu' : null;
  const temel = { hazirBelgeler: [], secilenBelgeSayisi: 0, mesajVar: true, sonArtifact: null, bicimCoz };

  it('tek düzenlenebilir belge → o dosya hedef', () => {
    const h = duzenlemeHedefiCoz({ ...temel, hazirBelgeler: [d('rapor.docx')], secilenBelgeSayisi: 1 });
    expect(h).toMatchObject({ tur: 'dosya', ad: 'rapor.docx', turEtiketi: 'Word belgesi' });
  });

  it('İKİ belge ekliyken hedef YOK — hangisinin düzenleneceği belirsiz', () => {
    const h = duzenlemeHedefiCoz({
      ...temel, hazirBelgeler: [d('a.docx'), d('b.docx')], secilenBelgeSayisi: 2,
    });
    expect(h).toBeUndefined();
  });

  it('yanında düzenlenemez bir dosya varken hedef YOK', () => {
    // Kullanıcı iki dosya hakkında konuşuyor; birini sessizce düzenlemek yanlış.
    const h = duzenlemeHedefiCoz({
      ...temel, hazirBelgeler: [d('rapor.docx'), d('veri.csv')], secilenBelgeSayisi: 2,
    });
    expect(h).toBeUndefined();
  });

  it('mesaj boşsa hedef YOK — düzenlenecek bir talimat yok', () => {
    const h = duzenlemeHedefiCoz({
      ...temel, hazirBelgeler: [d('rapor.docx')], secilenBelgeSayisi: 1, mesajVar: false,
    });
    expect(h).toBeUndefined();
  });

  it('belge eklenmemişse sohbetin SON belgesi hedef — düzenlemeler üst üste biriksin', () => {
    const h = duzenlemeHedefiCoz({ ...temel, sonArtifact: { id: 'a1', ad: 'teklif.pptx' } });
    expect(h).toMatchObject({ tur: 'artifact', artifactId: 'a1', turEtiketi: 'PowerPoint sunumu' });
  });

  it('son belge düzenlenemez türdeyse hedef YOK', () => {
    const h = duzenlemeHedefiCoz({ ...temel, sonArtifact: { id: 'a1', ad: 'gorsel.png' } });
    expect(h).toBeUndefined();
  });

  it('HATALI bir belge kutuda dururken eski belgeye DÜŞMÜYOR', () => {
    // Tuzak: hazır belge yok ama kutuda duran bir dosya var. Artifact'e
    // düşülürse kullanıcı az önce eklediği dosyayı düzenlediğini sanır ve
    // bambaşka bir belge değişir.
    const h = duzenlemeHedefiCoz({
      ...temel, hazirBelgeler: [], secilenBelgeSayisi: 1, sonArtifact: { id: 'a1', ad: 'teklif.docx' },
    });
    expect(h).toBeUndefined();
  });
});

describe('sohbetAraclari — bellek aracı ana isteğe KONMUYOR', () => {
  const hedef: DuzenlemeHedefi = {
    tur: 'artifact', ad: 'teklif.pptx', turEtiketi: 'PowerPoint sunumu', artifactId: 'a1',
  };

  /* Bu bir REGRESYON BEKÇİSİ. Araç bir süre ana istekte tanıtıldı ve model
     turu ona harcayıp hiç cevap üretmedi: kullanıcı yalnızca akıl yürütme
     metnini gördü. Öneri artık cevap bittikten sonra ayrı bir istekle
     soruluyor (hafizaKontrolu.ts). Aracı buraya geri koymak o hatayı geri
     getirir. */
  it('proje içi ya da dışı, bellek aracı sohbet araçlarında yok', () => {
    expect(sohbetAraclari(undefined).map((a) => a.function.name)).toEqual(['belge_uret']);
    expect(sohbetAraclari(hedef).map((a) => a.function.name))
      .toEqual(['belge_uret', 'belge_duzenle']);
  });

  it('hiçbir araç kümesinde proje_hafizasi_ekle geçmiyor', () => {
    for (const kume of [sohbetAraclari(undefined), sohbetAraclari(hedef)]) {
      expect(kume.map((a) => a.function.name)).not.toContain('proje_hafizasi_ekle');
    }
  });
});
