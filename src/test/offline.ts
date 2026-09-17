import { beforeEach, vi } from 'vitest';
// Varsayılan ağ kapalı. Test bir modeli kullanacaksa kendi sentetik yanıtını sağlar.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Çevrimdışı test: taklit edilmemiş ağ isteği engellendi.'); }));
});
