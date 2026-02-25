# Criar etiqueta

**Método:** `POST`  
**Endpoint:** `/label/create`

---

## Descrição

Cria uma nova etiqueta personalizada.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `name` | string | ✅ Sim | Nome da etiqueta | `Importante` |
| `color` | string | ❌ Não | Cor da etiqueta | `#FF0000` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/label/create' \\
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
