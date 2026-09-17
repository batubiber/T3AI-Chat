// Yalnız geçici Playwright profiliyle açılan test girişi; gerçek uygulama ve CSS.
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import '../../src/index.css';
import { localDb, artifactOperations } from '../../src/lib/localDb';
import { docxBaytlari } from '../../src/lib/docxOlustur';
import { markdownBloklara } from '../../src/lib/belgeIcerik';

const normal = new URLSearchParams(location.search).has('normal');
const longName = new URLSearchParams(location.search).has('long');
sessionStorage.setItem('t3ai-splash-shown', 'true');
localStorage.setItem('t3ai-sidebar-open', 'false');
const now = new Date();
const projectId = 'yerlesim-projesi', conversationId = 'yerlesim-sohbeti';
await localDb.projects.put({ id: projectId, name: 'Turna Pilot Projesi', description: 'Belge ve proje panelleri', memory: 'Bütçe: 17,42 milyon TL.', instructions: 'Türkçe ve kısa yanıt ver.', createdAt: now, updatedAt: now });
await localDb.conversations.put({ id: conversationId, projectId: normal ? undefined : projectId, title: 'Yerleşim denetimi', createdAt: now, updatedAt: now });
await localDb.projectFiles.put({ id: 'yerlesim-kaynagi', projectId, name: 'turna-notlari.txt', content: 'Turna Pilot bütçesi 17,42 milyon TL.', mimeType: 'text/plain', size: 45, createdAt: now });
const bytes = await docxBaytlari(markdownBloklara('# Turna Pilot\n\nBütçe: 17,42 milyon TL.\n\n## Sonraki adımlar\n\nKaynakları incele ve planı güncelle.').bloklar);
await artifactOperations.save({ id: 'yerlesim-belgesi', conversationId, fileName: longName ? 'Turna-Pilot-Projesi-2026-Yili-Stratejik-Planlama-Ve-Degerlendirme-Kurulu-Toplantisi-Nihai-Rapor-v12.docx' : 'Turna-Pilot.docx', editedBlob: new Blob([bytes]), instruction: 'Proje özeti', editCount: 1, previewHtml: '<h1>Turna Pilot</h1><p>Bütçe: 17,42 milyon TL.</p><h2>Sonraki adımlar</h2><p>Kaynakları incele ve planı güncelle.</p>' });
await localDb.messages.put({ id: 'yerlesim-mesaji', conversationId, role: 'assistant', content: 'Turna Pilot proje özeti hazır. Belgeyi sağ üstteki belge düğmesinden açabilirsiniz.', artifactId: 'yerlesim-belgesi', modelId: 'glm-5.2', createdAt: now });
await artifactOperations.save({ id: 'yerlesim-ikinci-belge', conversationId, fileName: 'Turna-Onceki.docx', editedBlob: new Blob([bytes]), instruction: 'Önceki rapor', editCount: 0, previewHtml: '<h1>Önceki rapor</h1><p>İkinci dosya kontrolü.</p>' });
await localDb.docxArtifacts.update('yerlesim-ikinci-belge', { createdAt: new Date(now.getTime() - 1000) });
await localDb.messages.put({ id: 'yerlesim-ikinci-mesaj', conversationId, role: 'assistant', content: 'Önceki belge.', artifactId: 'yerlesim-ikinci-belge', modelId: 'glm-5.2', createdAt: now });
await localDb.conversations.put({ id: 'yerlesim-bos-sohbet', projectId: normal ? undefined : projectId, title: 'Belgesiz sohbet', createdAt: now, updatedAt: now });
history.replaceState(null, '', normal ? '/' : '/projects/' + projectId);
createRoot(document.getElementById('root')!).render(<App />);
