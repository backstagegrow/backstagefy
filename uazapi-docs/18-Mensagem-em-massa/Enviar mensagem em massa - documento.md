# Enviar mensagem em massa - documento

**Método:** `POST`  
**Endpoint:** `/bulk/message/document`

---

## Descrição

Envia documentos para múltiplos destinatários.

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
| `document` | string | ✅ Sim | Documento em base64 ou URL | `https://exemplo.com/doc.pdf` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/bulk/message/document' \\
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
