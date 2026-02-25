# Desconectar instância

**Método:** `POST`  
**Endpoint:** `/instance/disconnect`

---

## Descrição

Desconecta a instância do WhatsApp. A instância permanece cadastrada mas fica em estado 'disconnected'.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/disconnect' \\
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
