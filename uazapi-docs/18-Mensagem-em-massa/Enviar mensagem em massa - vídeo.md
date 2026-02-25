# Enviar mensagem em massa - vídeo

**Método:** `POST`  
**Endpoint:** `/bulk/message/video`

---

## Descrição

Envia mensagens com vídeo para múltiplos destinatários.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `numbers` | array | ✅ Sim | Lista de números | `['5511999999999']` |
| `video` | string | ✅ Sim | Vídeo em base64 ou URL | `https://exemplo.com/video.mp4` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/bulk/message/video' \\
  -H 'Content-Type: application/json' \\
  -H 'token: SEU_TOKEN'
```

---

## Responses

### 200 - Sucesso

```json
{
  "status": "success"
}
```

### 401 - Token inválido/expirado

```json
{
  "status": "error",
  "message": "Invalid or expired token"
}
```

### 500 - Erro interno

```json
{
  "status": "error",
  "message": "Internal server error"
}
```
