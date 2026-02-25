# Configurar ou alterar o proxy

**Método:** `POST`  
**Endpoint:** `/instance/proxy`

---

## Descrição

Configura um novo proxy para a instância. A uazapiGO opera com um proxy interno como padrão. Você pode manter esse padrão, configurar um proxy próprio via proxy_url ou usar seu celular android como proxy.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `token` | Token da instância |

---

## Request Body

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|-------|------|-------------|-----------|---------|
| `proxyUrl` | string | ✅ Sim | URL do proxy | `http://proxy.exemplo.com:8080` |
| `username` | string | ❌ Não | Usuário do proxy | `usuario` |
| `password` | string | ❌ Não | Senha do proxy | `senha` |

---

## Exemplo de Request

```bash
curl -X POST 'https://free.uazapi.com/instance/proxy' \\
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
