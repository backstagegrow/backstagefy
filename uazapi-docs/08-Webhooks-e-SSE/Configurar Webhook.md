# Configurar Webhook

**Método:** `POST`  
**Endpoint:** `/webhook`

---

## Descrição

Configura o webhook para receber eventos da instância em tempo real.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `url` | string | ✅ Sim | URL do webhook | `https://meusite.com/webhook` |
| `events` | array | ❌ Não | Eventos a monitorar | `['message', 'status', 'connect']` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/webhook' \\
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
