# Listar todas as instâncias

**Método:** `GET`  
**Endpoint:** `/instance/all`

---

## Descrição

Retorna uma lista completa de todas as instâncias do sistema, incluindo: ID e nome de cada instância, status atual (disconnected, connecting, connected), data de criação, última desconexão e motivo, informações de perfil (se conectado). Requer permissões de administrador.

---

## Autenticação

| Header | Descrição |
|--------|-----------|
| `admintoken` | Token de administrador para endpoints administrativos |

---

---

## Exemplo de Request

```bash
curl -X GET 'https://free.uazapi.com/instance/all' \\
  -H 'Content-Type: application/json' \\
  -H 'admintoken: SEU_TOKEN'
```

---

## Responses

### 200 - Lista de instâncias retornada com sucesso

```json
{"instances": [{"id": "1", "name": "instancia-1", "status": "connected"}]}
```

### 401 - Token inválido ou expirado

```json
{}
```

### 403 - Token de administrador inválido

```json
{}
```

### 500 - Erro interno do servidor

```json
{}
```

