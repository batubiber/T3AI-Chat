import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatProvider, useChat } from '../../src/contexts/ChatContext';
import { DocumentEditProvider } from '../../src/contexts/DocumentEditContext';
import { useDocumentEdit } from '../../src/contexts/documentEditStore';
import { localDb, localDbOperations, artifactOperations } from '../../src/lib/localDb';
import { belgeSonucunuKaydet } from '../../src/lib/harness/belgeKaydi';
import { docxBaytlari } from '../../src/lib/docxOlustur';
import { markdownBloklara } from '../../src/lib/belgeIcerik';
import { loadEditableDocument } from '../../src/lib/documentEditing';

const now = new Date();
await localDb.delete();
await localDb.open();
await localDb.conversations.bulkAdd(['A', 'B'].map((id) => ({ id, title: 'Sohbet ' + id, projectId: 'P', createdAt: now, updatedAt: now })));
await localDbOperations.addMessage('A', 'user', 'Önceki kısıt: kısa başlıklar kullan.');
await localDbOperations.addMessage('B', 'user', 'B sohbete özel gizli geçmiş.');
const bytes = await docxBaytlari(markdownBloklara('# Başlık\n\nYanlş kelime').bloklar);
const sourceFile = new File([bytes], 'ornek.docx');
await artifactOperations.save({ id: 'kaynak-A', conversationId: 'A', fileName: 'ornek.docx', editedBlob: new Blob([bytes]), instruction: '', editCount: 1, previewHtml: '' });
const project = { id: 'P', name: 'Test Projesi', instructions: 'Para birimi TL; kısa cümleler.', memory: 'Hedef kitle yönetim kurulu.', files: [], createdAt: now };
// Bu dosya yalnız test girişidir; uygulama bileşeni olarak dışa aktarılmaz.
// eslint-disable-next-line react-refresh/only-export-components
function Probe() {
  const chat = useChat(), panel = useDocumentEdit();
  Object.assign(window, { h: { chat, panel, db: localDb, record: belgeSonucunuKaydet, sourceFile, loadEditableDocument } });
  return <p>Hazır: {chat.conversations.length} sohbet — {chat.activeConversation?.id ?? 'seçilmedi'}</p>;
}
createRoot(document.getElementById('root')!).render(<ChatProvider projectId="P" project={project}><DocumentEditProvider><Probe /></DocumentEditProvider></ChatProvider>);
