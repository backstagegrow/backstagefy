# Atualizar nome da instância

**Método:** `POST`  
**Endpoint:** `/instance/update-name`

---

## Descrição

Atualiza o nome de exibição da instância.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `name` | string | ✅ Sim | Novo nome da instância | `novo-nome` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/update-name' \\
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
