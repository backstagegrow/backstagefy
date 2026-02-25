# PLAN: Correção de Erros Críticos (IA Concierge)

Este plano detalha a resolução de 4 problemas críticos reportados no agente spHAUS Haus.

## Agentes Envolvidos
- **project-planner**: Coordenação e detalhamento do plano.
- **backend-specialist**: Implementação das correções na Edge Function.
- **test-engineer**: Verificação e auditoria final.

## 1. Refinamento de Linguagem (Humanização)
- **Problema**: IA repete o nome do lead em todas as frases.
- **Solução**: Atualizar o `SYSTEM_PROMPT` para instruir o uso do nome apenas na saudação ou confirmação de dados.
- **Fardo de Prova**: Conversa fluida sem repetições mecânicas.

## 2. Persistência de CRM e Pipeline
- **Problema**: Tags `[UPDATE_LEAD]` não estão sendo processadas ou dados não estão salvando (Nome, Empresa, Investimento, E-mail).
- **Solução**: 
    - Robustecer o parsing de JSON das tags.
    - Garantir que a IA emita tags mesmo que o lead forneça dados fora de ordem.
    - Corrigir mapeamento do `pipeline_stage`.
- **Fardo de Prova**: Dados aparecem refletidos na tabela `leads` após a menção no chat.

## 3. Processamento de Áudio (Speech-to-Text)
- **Problema**: IA ignora áudios enviados.
- **Solução**: 
    - Validar o payload do Uazapi (verificar se `mediaUrl` ou `url` é o campo correto).
    - Adicionar logs de captura de mídia.
    - Garantir que o blob seja enviado corretamente ao OpenAI Whisper.
- **Fardo de Prova**: Logs mostram transcrição bem-sucedida e IA responde ao conteúdo do áudio.

## 4. Envio de Imagens (Galeria)
- **Problema**: IA não envia fotos solicitadas.
- **Solução**: 
    - Alterar query de `gallery_images` para usar a coluna `tags` (identificada como correta via auditoria de schema).
    - Mapear tags solicitadas (`SPACE`, `ACER`, `AUDI`) para os filtros da query.
- **Fardo de Prova**: Imagens chegam ao WhatsApp do Lead após solicitação.

## Cronograma de Execução
1. [PHASE 1] Criação deste plano (Concluído).
2. [PHASE 1] Aprovação do Usuário (Pendente).
3. [PHASE 2] Implementação em paralelo via `backend-specialist`.
4. [PHASE 2] Verificação via `test-engineer`.

---
*Gerado via ORCHESTRATE protocol.*
