import { useState } from 'react';
import { Settings, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChat } from '@/contexts/ChatContext';
import {
  AVAILABLE_MODELS, getModelPresets, varsayilanPresetId, eforMerdiveni,
  modelSupportsVision, isImageGenerationModel, type ModelConfig,
} from '@/lib/modelConfig';
import { EforKaydirici } from '@/components/EforKaydirici';
import { cn } from '@/lib/utils';

/**
 * Model ve seviye seçimi TEK düğmede.
 *
 * Düğme YALNIZ dişli simgesi: iki ayrı düğme girdi çubuğunda ~250 piksel yer
 * kaplıyordu ve tek satır modu neredeyse hiç yaşamıyordu. Seviye adını da
 * yazdırmayı denedik, düğme yine metin uzunluğuna göre eniyor genişliyordu;
 * simge sabit 40 piksel ve komşusu ek düğmesiyle birebir aynı.
 *
 * MODEL ADI PANELİN BAŞLIĞINDA, SEVİYE ADI PANELDEKİ KAYDIRICIDA. İkisi de
 * düğmenin ipucu metninde: iki modelimizden biri görsel anlıyor öteki
 * anlamıyor, kullanıcının hangisinde olduğunu görebilmesi gerekiyor.
 *
 * Panelde hiçbir yerde "efor" yazmıyor. Gemma'da seviyeler gerçek bir efor
 * merdiveni değil ("Kodlama" daha çok düşünmüyor, daha düşük sıcaklıkla daha
 * tutarlı); eksene ad vermeyince yanlış bir şey iddia etmiyoruz.
 */
export function SeviyeSecici() {
  const { selectedModel, setSelectedModel, selectedPreset, setSelectedPreset, activeConversation } = useChat();
  const [acik, setAcik] = useState(false);
  const [modelPaneli, setModelPaneli] = useState(false);

  const model = AVAILABLE_MODELS.find((m) => m.id === selectedModel) ?? AVAILABLE_MODELS[0];
  const presetler = getModelPresets(selectedModel);
  const varsayilan = varsayilanPresetId(selectedModel) ?? presetler[0]?.id;
  const aktifId = presetler.find((p) => p.id === selectedPreset)?.id ?? varsayilan;
  const aktif = presetler.find((p) => p.id === aktifId);
  const merdiven = eforMerdiveni(selectedModel);

  const modelSec = (yeni: ModelConfig) => {
    if (yeni.disabled) return;
    // Model değiştirmenin SESSİZ sonuçları var ve kullanıcı bunları görmeden
    // değiştirmemeli. Bu iki uyarı eski model listesinden buraya taşındı.
    const gecmisteResimVar = activeConversation?.messages.some((m) => m.images && m.images.length > 0);
    if (modelSupportsVision(selectedModel) && !modelSupportsVision(yeni.id) && gecmisteResimVar) {
      toast.warning('Dikkat: Yeni model resim desteği sağlamıyor', {
        description: 'Konuşmadaki resimler model tarafından görülemeyecek. Resimlerle ilgili sorular için görsel destekli bir model seçin.',
        duration: 5000,
      });
    }
    if (isImageGenerationModel(yeni.id)) {
      toast.error('Promptlar kaydediliyor! Lütfen gizli ve hassas bilgi paylaşmayınız.', { duration: 6000 });
    }
    setSelectedModel(yeni.id);
    setModelPaneli(false);
  };

  if (presetler.length === 0) return null;

  return (
    <Popover
      open={acik}
      onOpenChange={(a) => {
        setAcik(a);
        // Kapanınca hep seviye paneline dön: bir dahaki açılışta model
        // listesiyle karşılaşmak şaşırtıcı olurdu.
        if (!a) setModelPaneli(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          /* Ek düğmesiyle aynı sınıflar — ikisi yan yana duruyor. */
          className="h-10 w-10 rounded-full flex items-center justify-center bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
          title={`${model.name} · ${aktif?.name ?? ''}`}
          aria-label={`Model ve seviye — şu an ${model.name}, ${aktif?.name ?? ''}`}
        >
          <Settings className="h-5 w-5" />
        </button>
      </PopoverTrigger>

      {/* Panel dişlinin ÜSTÜNDE ve ortalanmış: düğme artık 40 piksellik bir
          simge, sağ kenara yaslamak paneli düğmeden görünür şekilde kaydırıyor
          ve hangi düğmeden açıldığı belirsizleşiyordu.

          sideOffset varsayılan 4 yerine 10: dört piksellik boşlukta panel
          düğmeye yapışık duruyordu. */}
      <PopoverContent align="center" sideOffset={10} className="w-64 p-3">
        {modelPaneli ? (
          <div>
            <button
              type="button"
              onClick={() => setModelPaneli(false)}
              className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Model
            </button>
            <div className="space-y-0.5">
              {AVAILABLE_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => modelSec(m)}
                  disabled={m.disabled}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors',
                    m.disabled ? 'opacity-50' : 'hover:bg-accent',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">{m.name}</span>
                    {m.description && (
                      <span className="block text-[10px] leading-snug text-muted-foreground">{m.description}</span>
                    )}
                  </span>
                  {m.id === selectedModel && !m.disabled && (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* Model adı başlıkta; ok işareti model listesini açıyor. */}
            <button
              type="button"
              onClick={() => setModelPaneli(true)}
              className="mb-2 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {model.name}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {merdiven ? (
              <EforKaydirici merdiven={merdiven} seciliId={aktifId} onSec={setSelectedPreset} />
            ) : (
              /* Merdiveni olmayan model: kaydırıcı yanlış bir sıralama iddia
                 ederdi, düz liste gösteriliyor. */
              <div className="space-y-0.5">
                {presetler.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPreset(p.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs hover:bg-accent"
                  >
                    <span className={p.id === aktifId ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                      {p.name}
                    </span>
                    {p.id === aktifId && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
