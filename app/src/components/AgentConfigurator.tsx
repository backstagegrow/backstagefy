import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';

interface Agent {
    id: string;
    name: string;
    system_prompt: string;
    model: string;
    temperature: number;
    is_active: boolean;
    channel: string;
    whatsapp_instance: string | null;
    created_at: string;
}

const AgentConfigurator: React.FC = () => {
    const { tenantId } = useTenant();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selected, setSelected] = useState<Agent | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [activeTab, setActiveTab] = useState<'config' | 'webchat'>('config');
    const [copied, setCopied] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState('gpt-4o-mini');
    const [temperature, setTemperature] = useState(0.7);
    const [channel, setChannel] = useState('whatsapp');
    const [waInstance, setWaInstance] = useState('');
    const [waApikey, setWaApikey] = useState('');
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (tenantId) fetchAgents();
    }, [tenantId]);

    const fetchAgents = async () => {
        if (!supabase || !tenantId) return;
        setLoading(true);
        const { data } = await supabase
            .from('agents')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true });
        setAgents(data || []);
        if (data && data.length > 0 && !selected) {
            selectAgent(data[0]);
        }
        setLoading(false);
    };

    const selectAgent = (agent: Agent) => {
        setSelected(agent);
        setName(agent.name);
        setPrompt(agent.system_prompt);
        setModel(agent.model);
        setTemperature(agent.temperature);
        setChannel((agent as any).channel || 'whatsapp');
        setWaInstance((agent as any).whatsapp_instance || '');
        setWaApikey((agent as any).whatsapp_apikey || '');
        setIsActive(agent.is_active);
        setShowNew(false);
    };

    const handleSave = async () => {
        if (!supabase || !tenantId) return;
        setSaving(true);

        if (selected) {
            await supabase.from('agents').update({
                name, system_prompt: prompt, model, temperature, channel,
                whatsapp_instance: waInstance || null,
                whatsapp_apikey: waApikey || null,
                is_active: isActive,
                updated_at: new Date().toISOString(),
            }).eq('id', selected.id);
        } else {
            await supabase.from('agents').insert({
                tenant_id: tenantId, name, system_prompt: prompt, model, temperature, channel,
                whatsapp_instance: waInstance || null,
                whatsapp_apikey: waApikey || null,
                is_active: isActive,
            });
        }

        await fetchAgents();
        setSaving(false);
        setShowNew(false);
    };

    const handleNewAgent = () => {
        setSelected(null);
        setName('');
        setPrompt('Você é um assistente de atendimento profissional e amigável. Responda de forma clara e objetiva, sempre buscando ajudar o cliente da melhor forma possível.');
        setModel('gpt-4o-mini');
        setTemperature(0.7);
        setChannel('whatsapp');
        setWaInstance('');
        setWaApikey('');
        setIsActive(true);
        setShowNew(true);
    };

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const widgetBase = window.location.origin;

    const embedCode = tenantId
        ? `<script\n  src="${widgetBase}/webchat-widget.js"\n  data-tenant-id="${tenantId}"\n  data-supabase-url="${supabaseUrl}"\n  data-bot-name="Assistente IA"\n  data-primary-color="#7c3aed"\n  data-welcome-message="Olá! Como posso ajudar você hoje?"\n></script>`
        : '';

    const copyEmbedCode = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(embedCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (_) {}
    }, [embedCode]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col lg:flex-row gap-6 p-2 lg:p-6 overflow-hidden animate-in fade-in duration-700">
            {/* Sidebar List */}
            <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
                <button
                    onClick={handleNewAgent}
                    className="w-full backstagefy-btn-primary py-4 rounded-2xl flex items-center justify-center gap-2 group transition-all"
                >
                    <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">add_circle</span>
                    <span className="font-semibold text-sm tracking-wide">Criar Novo Agente</span>
                </button>

                <div className="flex-1 backstagefy-glass-card p-4 flex flex-col gap-2 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Meus Agentes</h3>
                        <span className="bg-white/5 text-white/40 text-[10px] font-bold px-2 py-0.5 rounded-full">{agents.length}</span>
                    </div>

                    {agents.map((agent) => (
                        <button
                            key={agent.id}
                            onClick={() => selectAgent(agent)}
                            className={`w-full text-left p-4 rounded-2xl transition-all duration-300 border flex items-center justify-between group ${selected?.id === agent.id
                                ? 'bg-primary/10 border-primary/30 text-white shadow-[0_0_20px_rgba(var(--color-primary),0.05)]'
                                : 'bg-white/[0.02] border-transparent text-white/60 hover:bg-white/[0.05] hover:border-white/10'
                                }`}
                        >
                            <div>
                                <h4 className="font-medium text-sm flex items-center gap-2.5">
                                    <div className={`size-2 rounded-full shadow-sm ${agent.is_active ? 'bg-primary shadow-primary/50' : 'bg-red-400/80 shadow-red-500/30'}`} />
                                    {agent.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-1.5 ml-4.5">
                                    <span className="text-[9px] text-white/30 uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded-md">
                                        {agent.channel}
                                    </span>
                                    <span className="text-[9px] text-white/20">
                                        {agent.model.replace('mini', 'm')}
                                    </span>
                                </div>
                            </div>
                            <span className={`material-symbols-outlined text-sm transition-transform ${selected?.id === agent.id ? 'text-primary' : 'text-white/10 group-hover:text-white/30 group-hover:translate-x-1'}`}>
                                chevron_right
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-w-0 flex flex-col h-full bg-white/[0.01] border border-white/5 rounded-3xl overflow-hidden relative">
                {(selected || showNew) ? (
                    <>
                        {/* Sticky Header */}
                        <div className="absolute top-0 left-0 right-0 h-auto min-h-16 md:h-20 px-4 py-3 md:px-8 border-b border-white/5 bg-black/40 backdrop-blur-xl z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-1">
                                    {showNew ? 'Configuração do Novo Agente' : 'Configurações do Agente'}
                                </p>
                                <h2 className="text-white text-lg md:text-xl font-heading font-light tracking-tight truncate">
                                    {name || 'Novo Agente sem nome'}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2 md:gap-4 shrink-0">
                                <button
                                    onClick={() => setIsActive(!isActive)}
                                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 rounded-xl transition-colors border ${isActive
                                        ? 'bg-primary/10 border-primary/20 hover:bg-primary/20'
                                        : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`size-2 rounded-full ${isActive ? 'bg-primary' : 'bg-red-400'}`} />
                                        <span className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-primary' : 'text-red-400'}`}>
                                            {isActive ? 'Ativo' : 'Pausado'}
                                        </span>
                                    </div>
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !name.trim() || !prompt.trim()}
                                    className="backstagefy-btn-primary px-4 md:px-6 py-2.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">{saving ? 'sync' : 'save'}</span>
                                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider hidden sm:inline">
                                        {saving ? 'Gravando...' : 'Salvar'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Tab Bar */}
                        <div className="absolute top-[64px] md:top-[80px] left-0 right-0 flex border-b border-white/5 bg-black/30 backdrop-blur-xl z-10 px-4 md:px-8">
                            <button
                                onClick={() => setActiveTab('config')}
                                className={`px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'config' ? 'border-primary text-primary' : 'border-transparent text-white/30 hover:text-white/60'}`}
                            >
                                Configuração
                            </button>
                            <button
                                onClick={() => setActiveTab('webchat')}
                                className={`px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center gap-1.5 ${activeTab === 'webchat' ? 'border-primary text-primary' : 'border-transparent text-white/30 hover:text-white/60'}`}
                            >
                                <span className="material-symbols-outlined text-sm">chat_bubble</span>
                                Webchat
                            </button>
                        </div>

                        {/* Scrollable Form Content */}
                        <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-40 md:pt-36 pb-8 md:pb-12 space-y-6">

                        {activeTab === 'webchat' && (
                            <div className="space-y-6">
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <h3 className="text-white/80 text-sm font-medium flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-primary text-lg">integration_instructions</span>
                                        Código de Embed para o Site do Cliente
                                    </h3>
                                    <p className="text-white/30 text-xs mb-5">
                                        Cole este código antes do fechamento da tag <code className="text-primary/80 bg-white/5 px-1 py-0.5 rounded">&lt;/body&gt;</code> no site do cliente. O chat aparecerá automaticamente.
                                    </p>
                                    <div className="relative">
                                        <pre className="bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-green-400/90 font-mono whitespace-pre overflow-x-auto leading-relaxed">
                                            {embedCode}
                                        </pre>
                                        <button
                                            onClick={copyEmbedCode}
                                            className="absolute top-3 right-3 flex items-center gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                                        >
                                            <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                                            {copied ? 'Copiado!' : 'Copiar'}
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                                    <h3 className="text-white/80 text-sm font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">tune</span>
                                        Parâmetros Customizáveis
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                        {[
                                            { attr: 'data-bot-name', desc: 'Nome exibido no cabeçalho do chat' },
                                            { attr: 'data-primary-color', desc: 'Cor principal (hex, ex: #7c3aed)' },
                                            { attr: 'data-welcome-message', desc: 'Mensagem de boas-vindas' },
                                            { attr: 'data-position', desc: '"right" ou "left" — lado da tela' },
                                        ].map(({ attr, desc }) => (
                                            <div key={attr} className="bg-black/20 border border-white/5 rounded-xl p-3">
                                                <code className="text-primary/80 font-mono text-[10px]">{attr}</code>
                                                <p className="text-white/40 mt-1">{desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-5 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl shrink-0 mt-0.5">info</span>
                                    <p className="text-white/50 text-xs leading-relaxed">
                                        O widget usa as <strong className="text-white/70">instruções base do agente selecionado</strong> e a base de conhecimento do seu tenant. O histórico de cada visitante é salvo por sessão usando <code className="text-primary/70 bg-white/5 px-1 rounded">localStorage</code>.
                                    </p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'config' && <>
                            {/* BLOCK: General */}
                            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                <h3 className="text-white/80 text-sm font-medium flex items-center gap-2 mb-6">
                                    <span className="material-symbols-outlined text-primary text-lg">badge</span>
                                    Identificação Geral
                                </h3>
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Nome do Agente</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 text-white py-3.5 px-4 rounded-xl focus:ring-0 focus:border-primary transition-all placeholder-white/20 text-sm outline-none"
                                        placeholder="Defina um nome para uso interno (Ex: Guga, Luna...)"
                                    />
                                </div>
                            </div>

                            {/* BLOCK: AI Engine */}
                            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                <h3 className="text-white/80 text-sm font-medium flex items-center gap-2 mb-6">
                                    <span className="material-symbols-outlined text-primary text-lg">psychology</span>
                                    Comportamento da Inteligência Artificial
                                </h3>
                                <div className="space-y-6">
                                    {/* System Prompt */}
                                    <div>
                                        <div className="flex justify-between items-end mb-2">
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Instruções Base (System Prompt)</label>
                                            <span className="text-white/20 text-[10px] font-mono">{prompt.length} chars</span>
                                        </div>
                                        <textarea
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            rows={8}
                                            className="w-full bg-black/20 border border-white/10 text-white/90 py-4 px-4 rounded-xl focus:ring-0 focus:border-primary transition-all placeholder-white/20 text-sm resize-none font-mono leading-relaxed outline-none"
                                            placeholder="Descreva a persona, tom de voz e regras inquebráveis deste agente..."
                                        />
                                    </div>

                                    {/* Model details */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-black/20 rounded-xl border border-white/5">
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Motor Linguístico (LLM)</label>
                                            <select
                                                value={model}
                                                onChange={(e) => setModel(e.target.value)}
                                                className="w-full bg-[#0a0a0a] border border-white/10 text-white/90 py-3 px-4 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm outline-none shadow-inner"
                                            >
                                                <option value="gpt-4o-mini" className="bg-[#0a0a0a] text-white/90 py-2">GPT-4o Mini (Velocidade & Custo-benefício)</option>
                                                <option value="gpt-4o" className="bg-[#0a0a0a] text-white/90 py-2">GPT-4o (Raciocínio Avançado)</option>
                                                <option value="gpt-4.1-mini" className="bg-[#0a0a0a] text-white/90 py-2">GPT-4.1 Mini</option>
                                                <option value="gpt-4.1" className="bg-[#0a0a0a] text-white/90 py-2">GPT-4.1 (Premium)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-end mb-2">
                                                <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Temperatura</label>
                                                <span className="text-primary font-mono text-xs font-bold">{temperature.toFixed(1)}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="2"
                                                step="0.1"
                                                value={temperature}
                                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary mt-3"
                                            />
                                            <div className="flex justify-between text-[9px] text-white/30 uppercase font-bold tracking-wider mt-2">
                                                <span>Factual (0.0)</span>
                                                <span>Criativo (2.0)</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>}

                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <div className="size-24 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6">
                            <span className="material-symbols-outlined text-4xl text-primary/40">smart_toy</span>
                        </div>
                        <h3 className="text-xl text-white font-heading font-light mb-2">Nenhum Agente Selecionado</h3>
                        <p className="text-white/30 text-sm max-w-sm mb-8">
                            Selecione um agente na lista lateral para configurar sua inteligência, ou crie um novo para expandir seu atendimento.
                        </p>
                        <button
                            onClick={handleNewAgent}
                            className="backstagefy-btn-primary px-6 py-3 rounded-xl flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                            <span className="text-sm font-semibold tracking-wide">Começar Novo Agente</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AgentConfigurator;
