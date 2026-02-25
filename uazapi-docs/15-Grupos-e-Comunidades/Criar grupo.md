# Criar grupo

**Método:** `POST`  
**Endpoint:** `/group/create`

---

## Descrição

Cria um novo grupo no WhatsApp.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `subject` | string | ✅ Sim | Nome do grupo | `Meu Grupo` |
| `participants` | array | ✅ Sim | Lista de números | `['5511999999999', '5511888888888']` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/group/create' \\
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
