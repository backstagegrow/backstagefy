# Admininstração

Endpoints para administração geral do sistema. Requerem um admintoken para autenticação.

---

## Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| **POST** | `/instance/init` | Cria uma nova instância do WhatsApp. |
| **GET** | `/instance/all` | Lista todas as instâncias cadastradas. |
| **POST** | `/instance/update-admin-fields` | Atualiza os campos administrativos de uma instância. |
| **GET** | `/webhook/global` | Retorna a configuração do webhook global. |
| **POST** | `/webhook/global` | Configura o webhook global para todas as instâncias. |

---

## Detalhes dos Endpoints

- [Criar Instancia](./Criar Instancia.md)
- [Listar todas as instâncias](./Listar todas as instâncias.md)
- [Atualizar campos administrativos](./Atualizar campos administrativos.md)
- [Ver Webhook Global](./Ver Webhook Global.md)
- [Configurar Webhook Global](./Configurar Webhook Global.md)
