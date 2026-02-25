# Configurar Webhook Global

**Método:** `POST`  
**Endpoint:** `/webhook/global`

---

## Descrição

Configura o webhook global que será aplicado a todas as instâncias do sistema.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `admintoken` | Token de administrador |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `url` | string | ✅ Sim | URL do webhook | `https://meusite.com/webhook` |
| `events` | array | ❌ Não | Eventos a serem enviados | `['message', 'status']` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/webhook/global' \\
  -H 'Content-Type: application/json' \\
  -H 'admintoken: SEU_TOKEN'
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
