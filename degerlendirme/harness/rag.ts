// Bilgi getirme kalitesini değil, A/B kaynaklarının sonraki üreticiye devrini sınar.
export const isRagAvailable = async () => true;
export const buildContextFromSearch = async (_query: string, _projectId: string, opts: { conversationId: string }) => ({
  content: opts.conversationId === 'A' ? 'Kaynak A.txt, parça A-1: Bütçe 17,42 milyon TL.' : 'Kaynak B.txt, parça B-1: Bütçe 98,76 milyon TL.',
  tokensEstimate: 30,
  sources: [{ documentId: opts.conversationId, fileName: opts.conversationId + '.txt', chunkId: opts.conversationId + '-1', content: 'sentetik', score: 1 }],
});
export const indexConversationDocument = async () => { throw new Error('Bu fixture indeksleme modeli çalıştırmaz.'); };
