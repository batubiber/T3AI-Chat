/**
 * Sohbet sistem promptunun UYGULAMAYA ait kismi.
 *
 * SORUMLULUK BOLUSUMU:
 *   .env (VITE_SYSTEM_PROMPT_BASE)  -> asistanın KİMLİĞİ. Kuruluma özgü,
 *                                      nadiren değişir.
 *   bu dosya                        -> DİL, BİÇİM ve YETENEK kuralları.
 *                                      Kodla birlikte değişir, testlenir.
 *
 * Eskiden biçim kuralları (LaTeX, kod bloğu) .env'deydi; yeni bir format
 * desteği eklediğimizde internetsiz kurulumdaki .env'i elle güncellemek
 * gerekiyordu. Artık gerekmiyor.
 *
 * NEDEN TAMAMEN İNGİLİZCE: taban prompt İngilizce, ek Türkçe idi. GLM çok
 * dilli ve karışık dilde talimat verilince dil kaydırıyor — ilk turda akıl
 * yürütmeyi ÇİNCE üretebiliyor (Cerebras GLM geçiş rehberi bunu isimle
 * söylüyor). Tek dile inmek bu riski kesiyor; İngilizce bu modellerin
 * talimat eğitiminin ağırlık merkezi.
 *
 * NEDEN "MUST NOT": GLM sert ve doğrudan direktiflere yumuşak tondan belirgin
 * şekilde daha iyi cevap veriyor.
 *
 * SABİT OLMAK ZORUNDA: promptun en başında duruyor; turdan tura değişirse
 * arkasındaki HER ŞEYİN KV-cache'i düşer. Tarih/saat yer tutucusu YOK.
 */

/**
 * Akıl yürütme dili neden İngilizce'ye sabitleniyor?
 *
 * Üç seçenek vardı:
 *   - Türkçe düşün  → orta-kaynak diller için doğruluk DÜŞÜYOR (uzun
 *                      chain-of-thought çalışmaları: Japonca/Letonca'da
 *                      İngilizceye geçmek doğruluğu artırıyor).
 *   - Serbest bırak → arada Çince düşünme zinciri çıkıyor ve biz düşünmeyi
 *                      kullanıcıya GÖSTERİYORUZ (showReasoning).
 *   - İngilizce     → Çince sorununu kesiyor, ölçülen kalite kaybı yok.
 *
 * Üçüncüsü seçildi. Cevap dili her zaman kullanıcının dili.
 */
export const SISTEM_KURALLARI = `## Language
- Write your final answer in the SAME language as the user's message. This is strict.
- Do your internal reasoning in English. Never reason or answer in Chinese unless the user writes in Chinese.

## Formatting
- Math: LaTeX — $...$ inline, $$...$$ for display.
- Code: fenced blocks with a language tag.
- Use Markdown headings, lists and tables when they make the answer easier to read.

## Output rendering
Your answer is rendered as GitHub-Flavored Markdown with KaTeX.
- Headings: use #, ## or ### only. Deeper levels are not styled.
- Do NOT write raw HTML — it is shown as literal text, not rendered.
- Do NOT embed images or link to external sites; this deployment has no internet access.
- Escape a literal dollar sign as \\$ — an unescaped $ starts inline math.
- Always tag the language on code blocks, otherwise there is no highlighting.

## Files this application can produce
This application can turn your answer into a Word (.docx), Excel (.xlsx) or PowerPoint (.pptx) file and give it to the user.
- If the user asks for a file, write the requested content directly as normal formatted text.
- You MUST NOT say that you cannot send files, and you MUST NOT offer Python or any other code as a substitute. The application builds the file from your answer.
- When the user asks for a file, call the belge_uret tool. Also write the content in the chat as usual — the file is built separately from your answer.
- Do NOT offer to produce a file when the user has not asked for one.`;

/**
 * .env'de kimlik tanımlı değilse kullanılan yedek.
 *
 * YALNIZ kimlik: kurallar zaten arkasına ekleniyor, burada tekrar etmek
 * prompt'u iki kere yazardı.
 */
export const KIMLIK_VARSAYILANI =
  'You are T3AI, an AI assistant developed in Türkiye by the T3 Foundation.';

/**
 * Kuralları kimliğin arkasına ekler.
 *
 * Zaten varsa ikinci kez eklemez: kurulum notu .env'e de yapıştırmış olabilir.
 */
export function kurallariEkle(kimlik: string): string {
  if (kimlik.includes(SISTEM_KURALLARI)) return kimlik;
  return `${kimlik}\n\n${SISTEM_KURALLARI}`;
}
