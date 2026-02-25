# Schemas da API uazapiGO

Esta seção documenta os principais schemas (estruturas de dados) utilizados na API.

---

## Instance (Instância)

Representa uma instância do WhatsApp conectada à API.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único da instância |
| `name` | string | Nome da instância |
| `token` | string | Token de autenticação |
| `status` | string | Status: `disconnected`, `connecting`, `connected` |
| `createdAt` | string | Data de criação |
| `updatedAt` | string | Data da última atualização |
| `adminField01` | string | Campo administrativo 1 |
| `adminField02` | string | Campo administrativo 2 |
| `systemName` | string | Nome do sistema |

---

## Message (Mensagem)

Representa uma mensagem enviada ou recebida.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único da mensagem |
| `from` | string | Número do remetente |
| `to` | string | Número do destinatário |
| `body` | string | Conteúdo da mensagem |
| `type` | string | Tipo: `text`, `image`, `video`, `audio`, `document`, etc. |
| `timestamp` | number | Timestamp da mensagem |
| `fromMe` | boolean | Se a mensagem foi enviada pela instância |
| `hasMedia` | boolean | Se a mensagem contém mídia |
| `mediaUrl` | string | URL da mídia (se houver) |
| `quotedMessageId` | string | ID da mensagem citada |

---

## Contact (Contato)

Representa um contato da agenda.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do contato |
| `number` | string | Número de telefone |
| `name` | string | Nome do contato |
| `pushname` | string | Nome exibido no WhatsApp |
| `isBusiness` | boolean | Se é conta business |
| `profilePicture` | string | URL da foto de perfil |
| `isBlocked` | boolean | Se está bloqueado |

---

## Chat (Conversa)

Representa uma conversa/chat.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do chat |
| `name` | string | Nome do chat |
| `number` | string | Número associado |
| `isGroup` | boolean | Se é um grupo |
| `isArchived` | boolean | Se está arquivado |
| `unreadCount` | number | Quantidade de mensagens não lidas |
| `timestamp` | number | Timestamp da última mensagem |
| `pinned` | boolean | Se está fixado |

---

## Group (Grupo)

Representa um grupo do WhatsApp.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do grupo |
| `subject` | string | Nome do grupo |
| `description` | string | Descrição do grupo |
| `owner` | string | Criador do grupo |
| `participants` | array | Lista de participantes |
| `createdAt` | string | Data de criação |
| `inviteCode` | string | Código de convite |

---

## GroupParticipant (Participante do Grupo)

Representa um participante de um grupo.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do participante |
| `number` | string | Número de telefone |
| `isAdmin` | boolean | Se é administrador |
| `isSuperAdmin` | boolean | Se é super admin |

---

## WebhookConfig (Configuração de Webhook)

Representa a configuração de webhook.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `url` | string | URL do webhook |
| `events` | array | Eventos a serem enviados |
| `enabled` | boolean | Se está ativo |
| `secret` | string | Segredo para validação |

---

## WebhookEvent (Evento de Webhook)

Representa um evento enviado pelo webhook.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `event` | string | Tipo do evento |
| `instance` | string | ID da instância |
| `data` | object | Dados do evento |
| `timestamp` | number | Timestamp do evento |

### Tipos de Eventos:

- `message` - Nova mensagem recebida
- `message.ack` - Confirmação de mensagem
- `message.revoked` - Mensagem apagada
- `status` - Mudança de status da instância
- `connect` - Instância conectada
- `disconnect` - Instância desconectada
- `qr` - QR Code gerado
- `call` - Chamada recebida
- `group.join` - Alguém entrou no grupo
- `group.leave` - Alguém saiu do grupo

---

## BusinessProfile (Perfil Comercial)

Representa o perfil comercial do WhatsApp Business.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do perfil |
| `description` | string | Descrição do negócio |
| `address` | string | Endereço |
| `email` | string | Email de contato |
| `category` | string | Categoria do negócio |
| `website` | array | URLs do site |
| `businessHours` | object | Horário de funcionamento |

---

## Product (Produto do Catálogo)

Representa um produto do catálogo.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do produto |
| `name` | string | Nome do produto |
| `description` | string | Descrição |
| `price` | number | Preço |
| `currency` | string | Moeda |
| `imageUrl` | string | URL da imagem |
| `isHidden` | boolean | Se está oculto |

---

## Label (Etiqueta)

Representa uma etiqueta/label.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID da etiqueta |
| `name` | string | Nome |
| `color` | string | Cor em hexadecimal |
| `count` | number | Quantidade de chats com esta etiqueta |

---

## BulkMessageStatus (Status de Envio em Massa)

Representa o status de um envio em massa.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `batchId` | string | ID do lote |
| `status` | string | Status: `pending`, `processing`, `completed`, `cancelled` |
| `total` | number | Total de mensagens |
| `sent` | number | Mensagens enviadas |
| `failed` | number | Mensagens falhas |
| `progress` | number | Progresso em porcentagem |

---

## ChatwootConfig (Configuração Chatwoot)

Representa a configuração de integração com Chatwoot.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `chatwootUrl` | string | URL do Chatwoot |
| `apiToken` | string | Token de API |
| `accountId` | number | ID da conta |
| `inboxId` | number | ID da caixa de entrada |
| `enabled` | boolean | Se está ativo |

---

## ChatbotFlow (Fluxo do Chatbot)

Representa um fluxo de chatbot.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID do fluxo |
| `name` | string | Nome do fluxo |
| `flow` | object | Definição do fluxo |
| `isActive` | boolean | Se está ativo |
| `createdAt` | string | Data de criação |

---

## ProxyConfig (Configuração de Proxy)

Representa a configuração de proxy.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `proxyUrl` | string | URL do proxy |
| `username` | string | Usuário |
| `password` | string | Senha |
| `enabled` | boolean | Se está ativo |
