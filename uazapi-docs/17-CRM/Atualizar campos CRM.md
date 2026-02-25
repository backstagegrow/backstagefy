# Atualizar campos CRM

**Método:** `POST`  
**Endpoint:** `/crm/update`

---

## Descrição

Atualiza os campos CRM de um contato específico.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `number` | string | ✅ Sim | Número do contato | `5511999999999` |
| `fields` | object | ✅ Sim | Campos a atualizar | `{email: 'a@b.com'}` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/crm/update' \\
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
