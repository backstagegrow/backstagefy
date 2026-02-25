# Enviar vídeo

**Método:** `POST`  
**Endpoint:** `/message/send/video`

---

## Descrição

Envia uma mensagem com vídeo.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `number` | string | ✅ Sim | Número do destinatário | `5511999999999` |
| `video` | string | ✅ Sim | Vídeo em base64 ou URL | `https://exemplo.com/video.mp4` |
| `caption` | string | ❌ Não | Legenda do vídeo | `Meu vídeo` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/video' \\
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
