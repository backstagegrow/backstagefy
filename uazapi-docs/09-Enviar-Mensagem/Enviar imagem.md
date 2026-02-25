# Enviar imagem

**Método:** `POST`  
**Endpoint:** `/message/send/image`

---

## Descrição

Envia uma mensagem com imagem.

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
| `image` | string | ✅ Sim | Imagem em base64 ou URL | `https://exemplo.com/imagem.jpg` |
| `caption` | string | ❌ Não | Legenda da imagem | `Minha foto` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/image' \\
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
