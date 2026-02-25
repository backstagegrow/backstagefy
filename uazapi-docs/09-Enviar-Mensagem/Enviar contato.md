# Enviar contato

**Método:** `POST`  
**Endpoint:** `/message/send/contact`

---

## Descrição

Envia um cartão de contato.

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
| `contactNumber` | string | ✅ Sim | Número do contato | `5511888888888` |
| `contactName` | string | ✅ Sim | Nome do contato | `João Silva` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/message/send/contact' \\
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
