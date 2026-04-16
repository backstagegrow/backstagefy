export function getAvailableTools(): any[] {
    return [
        {
            type: "function",
            function: {
                name: "update_lead",
                description: "Atualiza informações do lead. Use sempre que o cliente compartilhar dados novos.",
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Nome do cliente" },
                        company_name: { type: "string", description: "Nome da empresa" },
                        corporate_email: { type: "string", description: "Email corporativo" },
                        // FIX: constrained to valid db types
                        status: { type: "string", enum: ["frio", "morno", "quente"], description: "Temperatura do lead (apenas estas 3 válidas)" },
                        event_format: { type: "string", description: "Formato do evento ou necessidade" }
                    }
                }
            }
        },
        {
            type: "function",
            function: {
                name: "schedule_appointment",
                description: "Agenda uma reunião ou visita.",
                parameters: {
                    type: "object",
                    properties: {
                        datetime: { type: "string", description: "Data e hora no formato YYYY-MM-DD HH:mm" },
                        summary: { type: "string", description: "Resumo do agendamento" }
                    },
                    required: ["datetime"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "cancel_appointment",
                description: "Cancela um agendamento existente.",
                parameters: {
                    type: "object",
                    properties: { id: { type: "string", description: "ID do agendamento" } },
                    required: ["id"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "reschedule_appointment",
                description: "Reagenda um agendamento existente para nova data/hora. Cancela o antigo e cria um novo.",
                parameters: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "ID do agendamento a ser reagendado" },
                        datetime: { type: "string", description: "Nova data e hora no formato YYYY-MM-DD HH:mm" },
                        summary: { type: "string", description: "Resumo atualizado do agendamento" }
                    },
                    required: ["id", "datetime"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "advance_step",
                description: "Avança o lead para a próxima etapa do funil de vendas. Use quando o objetivo da etapa atual foi alcançado.",
                parameters: { type: "object", properties: {} }
            }
        },
        {
            type: "function",
            function: {
                name: "create_follow_up",
                description: "Cria um follow-up programado para recontatar o lead.",
                parameters: {
                    type: "object",
                    properties: {
                        reason: { type: "string", description: "Motivo do follow-up" }
                    },
                    required: ["reason"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "transfer_to_human",
                description: "Transfere o atendimento para um humano.",
                parameters: {
                    type: "object",
                    properties: {
                        reason: { type: "string", description: "Motivo da transferência" }
                    }
                }
            }
        },
        {
            type: "function",
            function: {
                name: "send_media",
                description: "Envia uma imagem, documento ou arquivo. Use com o ID do arquivo listado na seção [MÍDIAS E DOCUMENTOS DISPONÍVEIS]. A mídia já será enviada com legenda.",
                parameters: {
                    type: "object",
                    properties: {
                        media_id: { type: "string", description: "ID do arquivo/mídia da base de conhecimento" },
                        caption: { type: "string", description: "Legenda ou texto para acompanhar o envio" }
                    },
                    required: ["media_id"]
                }
            }
        }
    ];
}
