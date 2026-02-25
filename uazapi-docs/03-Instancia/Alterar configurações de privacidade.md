# Alterar configurações de privacidade

**Método:** `POST`  
**Endpoint:** `/instance/privacy`

---

## Descrição

Atualiza as configurações de privacidade da instância.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `readReceipts` | boolean | ❌ Não | Confirmações de leitura | `true` |
| `profilePhoto` | string | ❌ Não | Visibilidade da foto | `all` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/privacy' \\
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
