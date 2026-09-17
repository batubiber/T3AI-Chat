/**
 * Admin oturum jetonu — imzalı ve süreli.
 *
 * NEDEN: eskiden "admin miyim" bilgisi sessionStorage'da düz 'true' idi ve
 * konsoldan tek satırla uydurulabiliyordu. Jetonun imzası sunucu sırrıyla
 * üretiliyor; istemci uyduramıyor, süresini de uzatamıyor.
 *
 * Saf ve ağsız: node ortamında doğrudan test edilebiliyor.
 */
const crypto = require('crypto');

const JETON_OMRU_MS = 12 * 60 * 60 * 1000;

function imzala(govde, sir) {
  return crypto.createHmac('sha256', sir).update(govde).digest('base64url');
}

/** `<sonaErmeMs base64url>.<imza>` */
function jetonUret(sir, simdi = Date.now()) {
  const govde = Buffer.from(String(simdi + JETON_OMRU_MS)).toString('base64url');
  return `${govde}.${imzala(govde, sir)}`;
}

function jetonDogrula(jeton, sir, simdi = Date.now()) {
  if (typeof jeton !== 'string') return false;
  const parcalar = jeton.split('.');
  if (parcalar.length !== 2) return false;
  const [govde, imza] = parcalar;
  if (!govde || !imza) return false;

  const beklenen = imzala(govde, sir);
  // Uzunluk farkı timingSafeEqual'i FIRLATIYOR; önce eşitliğe bakılmalı.
  if (imza.length !== beklenen.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(imza), Buffer.from(beklenen))) return false;

  const sonaErme = Number(Buffer.from(govde, 'base64url').toString());
  if (!Number.isFinite(sonaErme)) return false;
  return simdi < sonaErme;
}

module.exports = { jetonUret, jetonDogrula, JETON_OMRU_MS };
