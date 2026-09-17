import { generateId, localDb, type LocalDocxArtifact, type LocalMessage } from '../localDb';
import { iptaliKontrolEt, type BelgeIslemi } from './iptal';

export interface BelgeKaydi {
  islem: BelgeIslemi;
  fileName: string;
  instruction: string;
  editCount: number;
  editedBlob: Blob;
  previewHtml: string;
  uretim?: boolean;
  kullaniciMesaji?: boolean;
}

/** Dosya ve kart aynı işlemde yazılır; iptal/silinmiş sohbet yetim kayıt bırakmaz. */
export async function belgeSonucunuKaydet(g: BelgeKaydi, projectId?: string) {
  const { signal, modelId } = g.islem;
  iptaliKontrolEt(signal);
  const conversationId = g.islem.sohbetId || generateId();
  const artifactId = generateId();
  const createdAt = new Date();
  const summary = g.uretim
    ? `**${g.fileName}** hazır. Sağdaki panelden indirebilirsin.`
    : `**${g.fileName}** üzerinde ${g.editCount} değişiklik hazırladım. Sağdaki panelden inceleyip indirebilirsin.`;
  const userMsg: LocalMessage | null = g.instruction.trim() && g.kullaniciMesaji !== false
    ? { id: generateId(), conversationId, role: 'user', content: g.instruction, modelId, createdAt }
    : null;
  const assistantId = generateId();
  async function yaz(blobSaved: boolean) {
    iptaliKontrolEt(signal);
    let temizle = () => {};
    try {
      return await localDb.transaction('rw', [localDb.conversations, localDb.messages, localDb.docxArtifacts], async (tx) => {
        const iptal = () => { if (tx.active) tx.abort(); };
        signal.addEventListener('abort', iptal, { once: true });
        temizle = () => signal.removeEventListener('abort', iptal);
        iptaliKontrolEt(signal);
        let conversation = await localDb.conversations.get(conversationId);
        if (!conversation && g.islem.sohbetId) throw new Error('Belgenin ait olduğu sohbet silinmiş.');
        const yeni = !conversation;
        if (!conversation) {
          conversation = { id: conversationId, title: g.instruction.slice(0, 40) || g.fileName, projectId, createdAt, updatedAt: createdAt };
          await localDb.conversations.add(conversation);
        }
        if (conversation.title === 'New Chat') conversation = { ...conversation, title: g.instruction.slice(0, 40) || g.fileName };
        const artifact: LocalDocxArtifact = {
          id: artifactId, conversationId, fileName: g.fileName, instruction: g.instruction,
          editCount: g.editCount, previewHtml: g.previewHtml, createdAt,
          ...(blobSaved ? { editedBlob: g.editedBlob } : {}),
        };
        await localDb.docxArtifacts.add(artifact);
        const content = summary + (blobSaved ? '' : '\n\n_Not: dosya tarayıcı deposuna sığmadı; şimdi indirip saklayın._');
        const assistantMsg: LocalMessage = { id: assistantId, conversationId, role: 'assistant', content, modelId, artifactId, createdAt };
        if (userMsg) await localDb.messages.add(userMsg);
        await localDb.messages.add(assistantMsg);
        await localDb.conversations.update(conversationId, { updatedAt: createdAt, title: conversation.title });
        iptaliKontrolEt(signal);
        return { conversation, yeni, userMsg, assistantMsg, blobSaved, conversationId };
      });
    } finally { temizle(); }
  }
  try { return await yaz(true); }
  catch (err) {
    iptaliKontrolEt(signal);
    if (!(err instanceof Error) || err.name !== 'QuotaExceededError') throw err;
    // Kota dışındaki hatalar gizlenmez; metadata yazılamazsa başarı kartı oluşmaz.
    return yaz(false);
  }
}
