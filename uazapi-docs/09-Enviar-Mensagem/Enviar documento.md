# Enviar documento

**Método:** `POST`  
**Endpoint:** `/message/send/document`

---

## Descrição

Envia um documento (PDF, DOC, etc.).

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
| `document` | string | ✅ Sim | Documento em base64 ou URL | `https://exemplo.com/doc.pdf` |
| `filename` | string | ❌ Não | Nome do arquivo | `documento.pdf` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/document' \\
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
