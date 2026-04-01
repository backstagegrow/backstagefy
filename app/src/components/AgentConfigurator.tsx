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
    const [ttsVoice, setTtsVoice] = useState('onyx');

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
        setTtsVoice((agent as any).tts_voice || 'onyx');
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
                tts_voice: ttsVoice,
                updated_at: new Date().toISOString(),
            }).eq('id', selected.id);
        } else {
            await supabase.from('agents').insert({
                tenant_id: tenantId, name, system_prompt: prompt, model, temperature, channel,
                whatsapp_instance: waInstance || null,
                whatsapp_apikey: waApikey || null,
                is_active: isActive,
                tts_voice: ttsVoice,
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
        setTtsVoice('onyx');
        setShowNew(true);
    };

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const widgetBase = window.location.origin;

    // Webchat customization state
    const [wcBotName, setWcBotName] = useState('Assistente IA');
    const [wcColor, setWcColor] = useState('#7c3aed');
    const [wcWelcome, setWcWelcome] = useState('Olá! Como posso ajudar você hoje?');
    const [wcPosition, setWcPosition] = useState<'right' | 'left'>('right');

    const embedCode = tenantId
        ? `<script\n  src="${widgetBase}/webchat-widget.js"\n  data-tenant-id="${tenantId}"\n  data-supabase-url="${supabaseUrl}"\n  data-bot-name="${wcBotName}"\n  data-primary-color="${wcColor}"\n  data-welcome-message="${wcWelcome}"\n  data-position="${wcPosition}"\n></script>`
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
                            <div className="space-y-5">

                                {/* STEP 1 — Personalização visual */}
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-5">
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                            <span className="text-primary text-xs font-bold">1</span>
                                        </div>
                                        <div>
                                            <h3 className="text-white text-sm font-semibold">Personalize o chat</h3>
                                            <p className="text-white/30 text-xs mt-0.5">Defina como o chat vai aparecer no site do seu cliente</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Bot Name */}
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">
                                                Nome do Assistente
                                            </label>
                                            <input
                                                type="text"
                                                value={wcBotName}
                                                onChange={e => setWcBotName(e.target.value)}
                                                placeholder="Ex: Luna, Guga, Atendimento..."
                                                className="w-full bg-black/20 border border-white/10 text-white py-3 px-4 rounded-xl focus:border-primary outline-none transition-all text-sm placeholder-white/20"
                                            />
                                            <p className="text-white/25 text-[10px] mt-1.5">Aparece no topo do chat</p>
                                        </div>

                                        {/* Welcome message */}
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">
                                                Mensagem de Boas-vindas
                                            </label>
                                            <input
                                                type="text"
                                                value={wcWelcome}
                                                onChange={e => setWcWelcome(e.target.value)}
                                                placeholder="Ex: Olá! Como posso ajudar?"
                                                className="w-full bg-black/20 border border-white/10 text-white py-3 px-4 rounded-xl focus:border-primary outline-none transition-all text-sm placeholder-white/20"
                                            />
                                            <p className="text-white/25 text-[10px] mt-1.5">Primeira mensagem que o visitante vê</p>
                                        </div>

                                        {/* Color */}
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">
                                                Cor Principal
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={wcColor}
                                                    onChange={e => setWcColor(e.target.value)}
                                                    className="w-12 h-11 rounded-xl border border-white/10 bg-black/20 cursor-pointer p-1"
                                                />
                                                <input
                                                    type="text"
                                                    value={wcColor}
                                                    onChange={e => setWcColor(e.target.value)}
                                                    className="flex-1 bg-black/20 border border-white/10 text-white py-3 px-4 rounded-xl focus:border-primary outline-none transition-all text-sm font-mono"
                                                />
                                            </div>
                                            <p className="text-white/25 text-[10px] mt-1.5">Cor do botão e cabeçalho</p>
                                        </div>

                                        {/* Position */}
                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">
                                                Posição na Tela
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {(['right', 'left'] as const).map(pos => (
                                                    <button
                                                        key={pos}
                                                        onClick={() => setWcPosition(pos)}
                                                        className={`py-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 ${wcPosition === pos
                                                            ? 'bg-primary/15 border-primary/40 text-primary'
                                                            : 'bg-black/20 border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">
                                                            {pos === 'right' ? 'align_justify_flex_end' : 'align_justify_flex_start'}
                                                        </span>
                                                        {pos === 'right' ? 'Direita' : 'Esquerda'}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-white/25 text-[10px] mt-1.5">Canto onde o botão flutuante aparece</p>
                                        </div>
                                    </div>
                                </div>

                                {/* STEP 2 — Preview */}
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                            <span className="text-primary text-xs font-bold">2</span>
                                        </div>
                                        <div>
                                            <h3 className="text-white text-sm font-semibold">Prévia do chat</h3>
                                            <p className="text-white/30 text-xs mt-0.5">Veja como ficará no site do cliente</p>
                                        </div>
                                    </div>

                                    <div className="bg-black/30 rounded-2xl p-6 flex items-end justify-end min-h-[220px] relative overflow-hidden border border-white/5">
                                        {/* fake site bg lines */}
                                        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage:'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 32px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 80px)'}} />

                                        {/* chat preview */}
                                        <div className={`flex flex-col items-end gap-2 ${wcPosition === 'left' ? 'mr-auto ml-0' : ''}`}>
                                            {/* mini chat window */}
                                            <div className="w-56 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                                                <div className="px-3 py-2.5 flex items-center gap-2" style={{background: wcColor}}>
                                                    <div className="size-6 rounded-full bg-white/20 flex items-center justify-center text-xs">🤖</div>
                                                    <div>
                                                        <p className="text-white text-[11px] font-semibold leading-none">{wcBotName || 'Assistente IA'}</p>
                                                        <p className="text-white/70 text-[9px] mt-0.5">● Online</p>
                                                    </div>
                                                </div>
                                                <div className="bg-[#f8f8fc] px-3 py-3">
                                                    <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm text-[10px] text-gray-700 max-w-[90%]">
                                                        {wcWelcome || 'Olá! Como posso ajudar?'}
                                                    </div>
                                                </div>
                                                <div className="bg-white flex gap-1.5 px-2 py-1.5 border-t border-gray-100">
                                                    <div className="flex-1 bg-gray-100 rounded-full px-2 py-1 text-[9px] text-gray-400">Digite sua mensagem...</div>
                                                    <div className="size-5 rounded-full flex items-center justify-center" style={{background: wcColor}}>
                                                        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* fab button */}
                                            <div className="size-11 rounded-full shadow-lg flex items-center justify-center" style={{background: wcColor}}>
                                                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* STEP 3 — Código gerado */}
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                            <span className="text-primary text-xs font-bold">3</span>
                                        </div>
                                        <div>
                                            <h3 className="text-white text-sm font-semibold">Copie e cole no site</h3>
                                            <p className="text-white/30 text-xs mt-0.5">
                                                Mande este código para o desenvolvedor do cliente colar antes do <span className="font-mono text-white/50">&lt;/body&gt;</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <pre className="bg-black/50 border border-white/10 rounded-xl p-4 pr-28 text-xs text-green-400/90 font-mono whitespace-pre overflow-x-auto leading-relaxed">
                                            {embedCode}
                                        </pre>
                                        <button
                                            onClick={copyEmbedCode}
                                            className={`absolute top-3 right-3 flex items-center gap-1.5 border text-xs font-bold px-3 py-2 rounded-lg transition-all ${copied
                                                ? 'bg-green-500/20 border-green-500/40 text-green-400'
                                                : 'bg-primary/20 hover:bg-primary/30 border-primary/30 text-primary'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-sm">{copied ? 'check_circle' : 'content_copy'}</span>
                                            {copied ? 'Copiado!' : 'Copiar código'}
                                        </button>
                                    </div>

                                    <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                                        <span className="material-symbols-outlined text-amber-400/70 text-base shrink-0 mt-0.5">lightbulb</span>
                                        <p className="text-white/40 text-xs leading-relaxed">
                                            Não tem acesso ao site? Encaminhe o código para o desenvolvedor ou responsável pelo site do cliente — é só colar uma linha.
                                        </p>
                                    </div>
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

                                    {/* TTS Voice */}
                                    <div className="pt-4 border-t border-white/5">
                                        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-3 block flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-base">record_voice_over</span>
                                            Voz do Agente (WhatsApp — áudio automático)
                                        </label>
                                        <p className="text-white/25 text-xs mb-4">Respostas com até 150 caracteres são enviadas como áudio no WhatsApp.</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {[
                                                { id: 'alloy',   label: 'Alloy',   desc: 'Neutro, claro',     icon: '🎙️' },
                                                { id: 'echo',    label: 'Echo',    desc: 'Masculino, firme',  icon: '🔊' },
                                                { id: 'fable',   label: 'Fable',   desc: 'Expressivo',       icon: '✨' },
                                                { id: 'onyx',    label: 'Onyx',    desc: 'Grave, autoridade', icon: '🎯' },
                                                { id: 'nova',    label: 'Nova',    desc: 'Feminino, caloroso',icon: '🌟' },
                                                { id: 'shimmer', label: 'Shimmer', desc: 'Feminino, suave',   icon: '💫' },
                                            ].map(v => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => setTtsVoice(v.id)}
                                                    className={`p-3 rounded-xl border text-left transition-all ${ttsVoice === v.id
                                                        ? 'bg-primary/15 border-primary/40'
                                                        : 'bg-black/20 border-white/5 hover:border-white/15'
                                                    }`}
                                                >
                                                    <div className="text-base mb-1">{v.icon}</div>
                                                    <div className={`text-xs font-bold ${ttsVoice === v.id ? 'text-primary' : 'text-white/70'}`}>{v.label}</div>
                                                    <div className="text-[10px] text-white/30 mt-0.5">{v.desc}</div>
                                                </button>
                                            ))}
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
