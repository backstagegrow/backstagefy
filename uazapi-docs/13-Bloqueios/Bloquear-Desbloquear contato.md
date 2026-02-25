# Bloquear-Desbloquear contato

**Método:** `POST`  
**Endpoint:** `/block`

---

## Descrição

Bloqueia ou desbloqueia um contato.

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
| `block` | boolean | ✅ Sim | True para bloquear, False para desbloquear | `true` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/block' \\
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
