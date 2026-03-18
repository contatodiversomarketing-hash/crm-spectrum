

## Plano: Trocar modelos OpenAI por Google Gemini

Todos os modelos rodam pelo mesmo gateway Lovable AI (`ai.gateway.lovable.dev`), então a mudança é apenas trocar os nomes dos modelos. Não precisa de nova API key nem configuração extra.

### Mudanças

**1. `supabase/functions/receber-whatsapp/index.ts`**
- Trocar `"openai/gpt-5"` (visão/multimodal) → `"google/gemini-2.5-pro"` (melhor para imagem+texto)
- Trocar `"openai/gpt-5-mini"` (texto) → `"google/gemini-3-flash-preview"` (rápido e eficiente)

**2. `supabase/functions/chat-treinamento/index.ts`**
- Trocar `"openai/gpt-5-mini"` → `"google/gemini-3-flash-preview"`

**3. `supabase/functions/gerar-insights-ia/index.ts`**
- Já usa `"google/gemini-3-flash-preview"` — sem alteração necessária.

### Equivalências de modelos
| Uso | Antes (OpenAI) | Depois (Gemini) |
|-----|----------------|-----------------|
| Texto/chat | gpt-5-mini | gemini-3-flash-preview |
| Visão/multimodal | gpt-5 | gemini-2.5-pro |

Nenhuma outra configuração é necessária — o gateway Lovable AI já suporta ambos.

