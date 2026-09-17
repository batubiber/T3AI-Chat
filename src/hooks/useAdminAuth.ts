import { useState, useEffect, useCallback } from 'react';

const JETON_ANAHTARI = 't3ai-admin-jeton';
const SONA_ERME_ANAHTARI = 't3ai-admin-sona-erme';
const API = import.meta.env.VITE_API_URL || '/api';

/** Admin isteklerinde kullanılacak jeton; yoksa ya da süresi dolmuşsa boş. */
export function adminJetonu(): string {
  const sonaErme = Number(sessionStorage.getItem(SONA_ERME_ANAHTARI) || 0);
  // Süre istemcide de kontrol ediliyor ki dolmuş jetonla admin arayüzü
  // gösterilmesin. ASIL kontrol sunucuda; bu yalnız arayüz nezaketi.
  if (!sonaErme || Date.now() >= sonaErme) return '';
  return sessionStorage.getItem(JETON_ANAHTARI) || '';
}

export function adminJetonuSil() {
  sessionStorage.removeItem(JETON_ANAHTARI);
  sessionStorage.removeItem(SONA_ERME_ANAHTARI);
}

export function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminEnabled, setIsAdminEnabled] = useState(false);

  // Parola artık istemcide YOK; admin özelliğinin açık olup olmadığı
  // sunucudan öğreniliyor.
  useEffect(() => {
    let iptal = false;
    fetch(`${API}/config`)
      .then((y) => (y.ok ? y.json() : null))
      .then((c) => { if (!iptal) setIsAdminEnabled(!!c?.adminAcik); })
      .catch(() => { /* sunucu yoksa admin kapalı görünür */ });
    return () => { iptal = true; };
  }, []);

  useEffect(() => {
    setIsAdmin(!!adminJetonu());
  }, []);

  const login = useCallback(async (parola: string): Promise<boolean> => {
    try {
      const yanit = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parola }),
      });
      if (!yanit.ok) return false;
      const { jeton, sonaErme } = await yanit.json();
      if (!jeton) return false;
      sessionStorage.setItem(JETON_ANAHTARI, jeton);
      sessionStorage.setItem(SONA_ERME_ANAHTARI, String(sonaErme ?? 0));
      setIsAdmin(true);
      return true;
    } catch {
      return false;   // ağ hatası: giriş başarısız sayılır
    }
  }, []);

  const logout = useCallback(() => {
    adminJetonuSil();
    setIsAdmin(false);
  }, []);

  return { isAdmin, isAdminEnabled, login, logout };
}
