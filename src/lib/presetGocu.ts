/**
 * Bir kereye mahsus preset gocu: GLM varsayilani "Derin (Max)" -> "Dengeli (High)".
 *
 * NEDEN GEREKLI: uygulama, kullanici hicbir sey secmese bile ilk acilista
 * turettigi varsayilani localStorage'a YAZIYOR. Yani kurulu her kullanicinin
 * deposunda "reasoning-max" duruyor ve bu bir SECIM degil, bizim yazdigimiz
 * varsayilan. Goc olmadan varsayilani degistirmek yalniz sifirdan gelen
 * tarayicilari etkilerdi -- yani neredeyse kimseyi.
 *
 * Deger yerine anahtar SILINIYOR: "secim yapilmadi" durumuna donuyor, boylece
 * modelin o anki varsayilani neyse o uygulaniyor (ilerde yine degisebilir).
 *
 * Bilerek "Derin" kullananlar bir kez yeniden secer ve bayrak sayesinde bir
 * daha ellenmez.
 */

export const PRESET_ANAHTARI = 'selectedPreset';
export const GOC_ANAHTARI = 'presetGocu-glm-dengeli';

type Depo = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Goc uygulandiysa `true`. Idempotent: bayrak yazildiktan sonra hicbir sey yapmaz. */
export function presetGocuUygula(depo: Depo): boolean {
  if (depo.getItem(GOC_ANAHTARI) === '1') return false;
  depo.setItem(GOC_ANAHTARI, '1');
  if (depo.getItem(PRESET_ANAHTARI) !== 'reasoning-max') return false;
  depo.removeItem(PRESET_ANAHTARI);
  return true;
}
