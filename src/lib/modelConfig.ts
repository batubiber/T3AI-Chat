export interface ModelParams {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  /** GLM/DeepSeek-V4 reasoning kontrolü: {reasoning_effort:"high"} ya da {enable_thinking:false}.
   *  ChatContext bunu istek gövdesine chat_template_kwargs olarak geçirir. */
  chat_template_kwargs?: Record<string, unknown>;
  systemPrompt?: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  params: ModelParams;
}

export interface ModelConfig {
  id: string;
  name: string;
  port?: number;
  endpoint?: string;
  metricsEndpoint?: string;
  description?: string;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  isImageGeneration?: boolean;

  disabled?: boolean;
  showReasoning?: boolean;
  params?: ModelParams;
  presets?: ModelPreset[];
  /**
   * Kullanici bir secim yapmadan once aktif olacak preset.
   *
   * Verilmezse listenin ILKI varsayilan sayilir. Ayri bir alan olmasi
   * gerekiyor: menudeki sira (Derin -> Dengeli -> Hizli) bir derinlik
   * merdiveni; varsayilani degistirmek icin diziyi karistirmak menuyu
   * anlamsizlastirirdi.
   */
  varsayilanPresetId?: string;
  /**
   * Preset listesi gerçek bir EFOR MERDİVENİ mi?
   *
   * true ise liste ÇOKTAN AZA sıralıdır (menüde en güçlü seçenek üstte) ve
   * arayüz menü yerine kaydırıcı gösterir.
   *
   * Gemma'da bilerek YOK: "Kodlama" bir efor seviyesi değil, farklı sıcaklık —
   * düşünme yine açık. Kaydırıcıya koymak "kodlama daha az efor" demek olurdu.
   */
  eforMerdiveniVar?: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    // Varsayilan MAX degil DENGELI: her sohbeti en yuksek eforla baslatmak
    // gereksiz yavastı. "Hizli" ise akil yurutmeyi tamamen kapatir ve belge
    // uretme / PDF find-replace / RAG gibi talimat takibine dayanan
    // ozellikleri gozle gorulur sekilde bozar -- hiz isteyen iki tikla
    // secebilir, kotu cevap alan ise akil yurutmeyi acmasi gerektigini bilmez.
    varsayilanPresetId: "reasoning-high",
    eforMerdiveniVar: true,
    port: 8001,
    endpoint: "/vllm-8001/v1/chat/completions",
    metricsEndpoint: "http://vllm-a.example:8000/metrics",
    supportsVision: false,
    supportsTools: true,
    contextWindow: parseInt(import.meta.env.VITE_GLM_CONTEXT_WINDOW || "131072"),
    showReasoning: true,
    description: "Amiral gemisi akıl yürütme modeli",
    // endpoint set edildiği için "external" kabul edilir → yalnız temperature+top_p gönderilir.
    // GLM best-practice'i top_k istemez (vLLM varsayılanına bırakılır).
    params: {
      temperature: parseFloat(import.meta.env.VITE_GLM_TEMPERATURE || "1.0"),
      top_p: parseFloat(import.meta.env.VITE_GLM_TOP_P || "0.95")
    },
    presets: [
      {
        id: "reasoning-max",
        name: "Derin",
        description: "En kapsamlı akıl yürütme",
        // GLM'de thinking varsayılan AÇIK ve efor MAX → özel param gerekmez.
        params: {
          temperature: parseFloat(import.meta.env.VITE_GLM_TEMPERATURE || "1.0"),
          top_p: parseFloat(import.meta.env.VITE_GLM_TOP_P || "0.95")
        }
      },
      {
        id: "reasoning-high",
        name: "Dengeli",
        description: "Daha hızlı akıl yürütme (varsayılan)",
        params: {
          temperature: parseFloat(import.meta.env.VITE_GLM_TEMPERATURE || "1.0"),
          top_p: parseFloat(import.meta.env.VITE_GLM_TOP_P || "0.95"),
          chat_template_kwargs: { reasoning_effort: "high" }
        }
      },
      {
        id: "reasoning-off",
        name: "Hızlı",
        description: "Akıl yürütmeden doğrudan yanıt",
        params: {
          temperature: parseFloat(import.meta.env.VITE_GLM_TEMPERATURE || "1.0"),
          top_p: parseFloat(import.meta.env.VITE_GLM_TOP_P || "0.95"),
          chat_template_kwargs: { enable_thinking: false }
        }
      }
    ]
  },
  {
    id: "gemma-4-31b",
    name: "Gemma-4 31B",
    port: 8000,
    metricsEndpoint: "http://vllm-b.example:8000/metrics",
    supportsVision: true,
    supportsTools: true,
    contextWindow: parseInt(import.meta.env.VITE_GEMMA_CONTEXT_WINDOW || "262144"),
    /* AÇIKÇA YAZILMALI: preset listesi kaydırıcı için çoktan aza sıralandı
       (Kodlama → Genel → Hızlı), yani presets[0] artık "Kodlama". Bu alan
       olmasaydı Gemma'nın varsayılanı sessizce Kodlama'ya kayardı. */
    varsayilanPresetId: "general",
    /* Merdiven "efor" DEĞİL, "en hızlı → en dikkatli": Kodlama en düşük
       sıcaklıkla en tutarlı uç. Arayüzde hiçbir yerde "efor" yazmıyor, bu
       yüzden Gemma için yanlış bir sıralama iddia edilmiyor. */
    eforMerdiveniVar: true,
    showReasoning: true,
    description: "Çok modlu görsel-dil modeli",
    // HF best-practice (Gemma): temperature 1.0, top_p 0.95, top_k 64. GLM text-only olduğu için
    // görsel işleri bu model üstlenir. Thinking VARSAYILAN AÇIK (enable_thinking:true) → reasoning
    // reasoning_content olarak gelir (frontend zaten okur). gemma4 binary: effort kademesi YOK.
    // "Hızlı" preset'i thinking'i kapatır. vLLM: --reasoning-parser gemma4 --max-model-len 262144.
    params: {
      temperature: parseFloat(import.meta.env.VITE_GEMMA_TEMPERATURE || "1.0"),
      top_p: parseFloat(import.meta.env.VITE_GEMMA_TOP_P || "0.95"),
      top_k: parseInt(import.meta.env.VITE_GEMMA_TOP_K || "64"),
      chat_template_kwargs: { enable_thinking: true }
    },
    presets: [
      {
        id: "coding",
        name: "Kodlama",
        description: "Hassas kod yazımı için (akıl yürütmeli, deterministik)",
        params: {
          temperature: parseFloat(import.meta.env.VITE_GEMMA_CODING_TEMPERATURE || "0.6"),
          top_p: parseFloat(import.meta.env.VITE_GEMMA_TOP_P || "0.95"),
          top_k: parseInt(import.meta.env.VITE_GEMMA_TOP_K || "64"),
          chat_template_kwargs: { enable_thinking: true }
        }
      },
      {
        id: "general",
        name: "Genel",
        description: "Akıl yürütmeli genel sohbet ve görsel (varsayılan)",
        params: {
          temperature: parseFloat(import.meta.env.VITE_GEMMA_TEMPERATURE || "1.0"),
          top_p: parseFloat(import.meta.env.VITE_GEMMA_TOP_P || "0.95"),
          top_k: parseInt(import.meta.env.VITE_GEMMA_TOP_K || "64"),
          chat_template_kwargs: { enable_thinking: true }
        }
      },
      {
        id: "thinking-off",
        name: "Hızlı",
        description: "Akıl yürütmeden hızlı yanıt (basit/görsel görevler)",
        params: {
          temperature: parseFloat(import.meta.env.VITE_GEMMA_TEMPERATURE || "1.0"),
          top_p: parseFloat(import.meta.env.VITE_GEMMA_TOP_P || "0.95"),
          top_k: parseInt(import.meta.env.VITE_GEMMA_TOP_K || "64"),
          chat_template_kwargs: { enable_thinking: false }
        }
      }
    ]
  },
];

export const DEFAULT_MODEL_ID = "glm-5.2";

export function getModelById(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find(model => model.id === id);
}

export function getModelPort(modelId: string): number {
  const model = getModelById(modelId);
  return model?.port || 8000;
}

export function modelSupportsVision(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.supportsVision || false;
}

export function getModelEndpoint(modelId: string): string | undefined {
  const model = getModelById(modelId);
  return model?.endpoint;
}

export function getModelParams(modelId: string, presetId?: string): ModelParams | undefined {
  const model = getModelById(modelId);
  if (!model) return undefined;
  
  // If a preset is selected and the model has presets, use preset params
  if (presetId && model.presets) {
    const preset = model.presets.find(p => p.id === presetId);
    if (preset) return preset.params;
  }
  
  return model.params;
}

export function getModelPresets(modelId: string): ModelPreset[] {
  const model = getModelById(modelId);
  return model?.presets || [];
}

/**
 * Kullanici secim yapmadan once aktif olacak preset id'si.
 *
 * `varsayilanPresetId` elle yazilan bir alan; harf hatasi olursa secim
 * undefined kalip preset menusunu sessizce bozardi. Bu yuzden deger
 * GERCEKTEN var olan bir preset'e isaret etmiyorsa listenin ilkine dusuyor.
 */
export function varsayilanPresetId(modelId: string): string | null {
  const presetler = getModelPresets(modelId);
  if (presetler.length === 0) return null;
  const istenen = getModelById(modelId)?.varsayilanPresetId;
  return presetler.find((p) => p.id === istenen)?.id ?? presetler[0].id;
}

/**
 * Modelin preset'lerini AZDAN ÇOĞA efor sırasıyla verir; merdiven yoksa null.
 *
 * modelConfig'teki sıra çoktan aza (menüde en güçlü üstte olsun diye), ama
 * kaydırıcı soldan sağa doldukça efor ARTMALI. Ters çevirme burada yapılıyor
 * ki iki gösterim de kendi doğal sırasını korusun.
 */
export function eforMerdiveni(modelId: string): ModelPreset[] | null {
  const model = getModelById(modelId);
  if (!model?.eforMerdiveniVar || !model.presets?.length) return null;
  return [...model.presets].reverse();
}

export function getModelSystemPrompt(modelId: string): string | undefined {
  const model = getModelById(modelId);
  return model?.params?.systemPrompt;
}

export function modelShowsReasoning(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.showReasoning !== false;
}

export function isImageGenerationModel(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.isImageGeneration === true;
}

export function getModelContextWindow(modelId: string): number {
  const model = getModelById(modelId);
  return model?.contextWindow ?? 32768;
}

/**
 * Modelin sohbet API adresi. TEK KAYNAK — hem ChatContext hem belge düzenleme
 * servisi bunu kullanır.
 *
 * Neden gerekli: eskiden bu mantık ChatContext'e gömülüydü ve düzenleme servisi
 * kendi kopyasını yazmıştı; o kopya yalnız `endpoint` alanına bakıyordu.
 * Gemma'da `endpoint` YOK (sadece port 8000), dolayısıyla Gemma seçiliyken
 * istek GLM'in adresine gidiyordu.
 */
/**
 * Belge düzenleme TETİKLEMESİNİ yapacak model — ana sohbet modelinden bağımsız.
 *
 * Neden ayrı: bu çağrı, düzenlenebilir dosya ekliyken yazılan HER mesajda
 * kullanıcıyı bekletiyor ve verdiği karar iki seçenekli ("düzenleme mi, soru
 * mu"). Amiral gemisi modelin akıl yürütmesi burada boşa gidiyor; küçük ve
 * hızlı model yeter. Düzenlemeleri ÜRETME işi seçili modelde kalır.
 */
export const EDIT_GATE_MODEL_ID = import.meta.env.VITE_EDIT_GATE_MODEL || 'gemma-4-31b';

/**
 * Tetikleme modelinin id'si. Yapılandırılan model yoksa ya da kapalıysa
 * seçili modele düşer — böylece tek modelli bir kurulumda özellik ölmez.
 */
export function resolveGateModelId(selectedModelId: string): string {
  const gate = getModelById(EDIT_GATE_MODEL_ID);
  if (!gate || gate.disabled) return selectedModelId;
  return gate.id;
}

export function resolveChatApiUrl(modelId: string): string {
  const endpoint = getModelEndpoint(modelId);

  if (endpoint) return endpoint;

  // Yerel model: nginx'te port→yol eşlemesi
  const portToPath: Record<number, string> = {
    8000: '/vllm-8000/v1/chat/completions',   // Gemma-4 31B
    8001: '/vllm-8001/v1/chat/completions',   // GLM 5.2
  };
  return portToPath[getModelPort(modelId)] || `${import.meta.env.VITE_API_URL || '/api'}/chat`;
}
