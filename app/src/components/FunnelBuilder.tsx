import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';

interface FunnelStep {
    id: string;
    agent_id: string;
    tenant_id: string;
    step_order: number;
    name: string;
    type: string;
    prompt_instructions: string;
    conditions: Record<string, any>;
    is_active: boolean;
    created_at: string;
}

interface Agent {
    id: string;
    name: string;
}

const STEP_TYPES = [
    { value: 'greeting', label: 'Boas-vindas', icon: 'waving_hand', color: 'text-yellow-400' },
    { value: 'qualification', label: 'Qualificação', icon: 'person_search', color: 'text-blue-400' },
    { value: 'value_anchor', label: 'Ancoragem de Valor', icon: 'diamond', color: 'text-purple-400' },
    { value: 'budget', label: 'Investimento', icon: 'payments', color: 'text-green-400' },
    { value: 'closing', label: 'Fechamento', icon: 'handshake', color: 'text-primary' },
    { value: 'sac', label: 'Pós-venda / SAC', icon: 'support_agent', color: 'text-orange-400' },
    { value: 'custom', label: 'Personalizado', icon: 'tune', color: 'text-white/60' },
];

const FunnelBuilder: React.FC = () => {
    const { tenantId } = useTenant();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [steps, setSteps] = useState<FunnelStep[]>([]);
    const [editingStep, setEditingStep] = useState<FunnelStep | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

    // AI Optimizer state
    const [optimizing, setOptimizing] = useState(false);
    const [optimizedPrompt, setOptimizedPrompt] = useState<string | null>(null);
    const [showOptimized, setShowOptimized] = useState(false);

    useEffect(() => {
        if (tenantId) fetchAgents();
    }, [tenantId]);

    useEffect(() => {
        if (selectedAgentId) fetchSteps();
    }, [selectedAgentId]);

    const fetchAgents = async () => {
        if (!supabase || !tenantId) return;
        const { data } = await supabase
            .from('agents')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .order('created_at');
        setAgents(data || []);
        if (data && data.length > 0) setSelectedAgentId(data[0].id);
        setLoading(false);
    };

    const fetchSteps = async () => {
        if (!supabase || !selectedAgentId) return;
        const { data } = await supabase
            .from('funnel_steps')
            .select('*')
            .eq('agent_id', selectedAgentId)
            .order('step_order');
        setSteps(data || []);
    };

    const handleAddStep = async () => {
        if (!supabase || !tenantId || !selectedAgentId) return;
        const newOrder = steps.length + 1;
        const { data } = await supabase.from('funnel_steps').insert({
            tenant_id: tenantId,
            agent_id: selectedAgentId,
            step_order: newOrder,
            name: `Etapa ${newOrder}`,
            type: 'custom',
            prompt_instructions: '',
            is_active: true,
        }).select().single();
        if (data) {
            setSteps([...steps, data]);
            setEditingStep(data);
        }
    };

    const handleSaveStep = async (stepToSave?: FunnelStep) => {
        const target = stepToSave || editingStep;
        if (!supabase || !target) return;
        setSaving(true);
        await supabase.from('funnel_steps').update({
            name: target.name,
            type: target.type,
            prompt_instructions: target.prompt_instructions,
            is_active: target.is_active,
        }).eq('id', target.id);
        setSteps(prev => prev.map(s => s.id === target.id ? { ...target } : s));
        setSaving(false);
    };

    const selectStep = async (step: FunnelStep) => {
        // Auto-save current step if it was modified
        if (editingStep && editingStep.id !== step.id) {
            const original = steps.find(s => s.id === editingStep.id);
            const hasChanges = original && (
                original.name !== editingStep.name ||
                original.type !== editingStep.type ||
                original.prompt_instructions !== editingStep.prompt_instructions ||
                original.is_active !== editingStep.is_active
            );
            if (hasChanges) {
                await handleSaveStep(editingStep);
            }
        }
        // Deep copy to avoid reference issues
        setEditingStep({ ...step });
    };

    const handleDeleteStep = async (stepId: string) => {
        if (!supabase) return;
        await supabase.from('funnel_steps').delete().eq('id', stepId);
        setSteps(steps.filter(s => s.id !== stepId));
        if (editingStep?.id === stepId) setEditingStep(null);
    };

    const handleDragStart = (idx: number) => setDraggedIdx(idx);

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === idx) return;
        const reordered = [...steps];
        const [moved] = reordered.splice(draggedIdx, 1);
        reordered.splice(idx, 0, moved);
        setSteps(reordered);
        setDraggedIdx(idx);
    };

    const handleDragEnd = async () => {
        setDraggedIdx(null);
        if (!supabase) return;
        for (let i = 0; i < steps.length; i++) {
            if (steps[i].step_order !== i + 1) {
                await supabase.from('funnel_steps').update({ step_order: i + 1 }).eq('id', steps[i].id);
            }
        }
        setSteps(steps.map((s, i) => ({ ...s, step_order: i + 1 })));
    };

    const getStepType = (type: string) => STEP_TYPES.find(t => t.value === type) || STEP_TYPES[6];

    const handleOptimize = async () => {
        if (!supabase || !editingStep || editingStep.prompt_instructions.trim().length < 10) return;
        setOptimizing(true);
        setOptimizedPrompt(null);
        setShowOptimized(false);
        try {
            const { data, error } = await supabase.functions.invoke('optimize-prompt', {
                body: {
                    prompt: editingStep.prompt_instructions,
                    stepName: editingStep.name,
                    stepType: editingStep.type,
                },
            });
            if (error) throw error;
            if (data?.optimized) {
                setOptimizedPrompt(data.optimized);
                setShowOptimized(true);
            } else if (data?.error) {
                alert(data.error);
            }
        } catch (err: any) {
            console.error('Optimize error:', err);
            alert('Erro ao otimizar: ' + (err.message || 'Tente novamente.'));
        } finally {
            setOptimizing(false);
        }
    };

    const handleAcceptOptimized = () => {
        if (editingStep && optimizedPrompt) {
            setEditingStep({ ...editingStep, prompt_instructions: optimizedPrompt });
            setShowOptimized(false);
            setOptimizedPrompt(null);
        }
    };

    const handleRejectOptimized = () => {
        setShowOptimized(false);
        setOptimizedPrompt(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col lg:flex-row gap-6 p-2 lg:p-6 overflow-hidden animate-in fade-in duration-700">
            {/* Left: Journey Timeline */}
            <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4 h-full relative z-10">
                {/* Header & Agent Selector */}
                <div className="backstagefy-glass-card p-5 shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] -mr-16 -mt-16 pointer-events-none" />
                    <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-3 relative z-10">Agente Ativo</p>
                    <div className="relative z-10">
                        <select
                            value={selectedAgentId || ''}
                            onChange={(e) => setSelectedAgentId(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 text-white py-3 pl-4 pr-10 rounded-xl text-base font-semibold focus:ring-0 focus:border-primary appearance-none outline-none shadow-inner"
                        >
                            {agents.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">expand_more</span>
                    </div>
                </div>

                {/* Timeline Container */}
                <div className="flex-1 backstagefy-glass-card flex flex-col overflow-hidden relative">
                    <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">route</span>
                            <h3 className="text-white/80 text-xs font-bold uppercase tracking-widest shrink-0">Jornada do Funil</h3>
                        </div>
                        <button
                            onClick={handleAddStep}
                            className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0"
                        >
                            <span className="material-symbols-outlined text-[14px]">add</span> Adicionar
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 relative">
                        {steps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center opacity-70">
                                <div className="size-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-4xl text-primary/50">account_tree</span>
                                </div>
                                <p className="text-white/50 text-sm font-medium">Jornada Vazia</p>
                                <p className="text-white/30 text-[10px] mt-2 max-w-[200px] leading-relaxed">
                                    Clique em "Adicionar" para criar a primeira etapa de atendimento e desenhar o funil do seu agente.
                                </p>
                            </div>
                        ) : (
                            <div className="relative">
                                {/* The vertical path line */}
                                <div className="absolute left-[27px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-primary/50 via-white/10 to-transparent pointer-events-none" />

                                <div className="space-y-4">
                                    {steps.map((step, idx) => {
                                        const stepType = getStepType(step.type);
                                        const isActiveContext = editingStep?.id === step.id;

                                        return (
                                            <div
                                                key={step.id}
                                                className="relative z-10"
                                                draggable
                                                onDragStart={() => handleDragStart(idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <div
                                                    onClick={() => selectStep(step)}
                                                    className={`relative flex items-center gap-4 p-4 pr-5 rounded-2xl cursor-pointer transition-all duration-300 group ${isActiveContext
                                                        ? 'bg-primary/10 border border-primary/40 shadow-[0_0_20px_rgba(var(--color-primary),0.1)]'
                                                        : 'bg-[#151515] border border-white/5 hover:border-white/15 shadow-xl'
                                                        } ${!step.is_active ? 'opacity-50 grayscale-[50%]' : ''}`}
                                                >
                                                    {/* Step Number Badge */}
                                                    <div className={`shrink-0 z-10 size-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg transition-colors border ${isActiveContext
                                                        ? 'bg-primary border-primary text-black'
                                                        : 'bg-[#222] border-white/10 text-white/70 group-hover:bg-white/10 group-hover:text-white'
                                                        }`}>
                                                        {idx + 1}
                                                    </div>

                                                    {/* Icon & Details */}
                                                    <div className="flex-1 min-w-0 flex items-center gap-3">
                                                        <div className={`size-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center shrink-0 ${stepType.color}`}>
                                                            <span className="material-symbols-outlined text-[20px]">{stepType.icon}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-sm font-semibold truncate transition-colors ${isActiveContext ? 'text-white' : 'text-white/80 group-hover:text-white'}`}>
                                                                {step.name}
                                                            </p>
                                                            <p className="text-white/40 text-[9px] uppercase tracking-widest mt-0.5 truncate">
                                                                {stepType.label}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Drag & Delete Controls */}
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id); }}
                                                            className="size-8 rounded-lg flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors border border-red-500/20"
                                                            title="Excluir Etapa"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                                        </button>
                                                        <div className="size-8 rounded-lg flex items-center justify-center bg-white/5 text-white/30 cursor-grab active:cursor-grabbing hover:bg-white/10 hover:text-white transition-colors">
                                                            <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
                                                        </div>
                                                    </div>

                                                    {/* Inactive Marker inside card if disabled */}
                                                    {!step.is_active && (
                                                        <div className="absolute -top-2 -right-2 bg-red-500/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-red-400/50 uppercase tracking-widest backdrop-blur-sm">
                                                            Pausado
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Step Editor Area */}
            <div className="flex-1 min-w-0 flex flex-col h-full bg-white/[0.01] border border-white/5 rounded-3xl overflow-hidden relative">
                {editingStep ? (
                    <>
                        {/* Sticky Header */}
                        <div className="absolute top-0 left-0 right-0 h-20 px-8 border-b border-white/5 bg-black/40 backdrop-blur-xl z-20 flex items-center justify-between">
                            <div>
                                <p className="text-primary text-[10px] font-bold tracking-[0.4em] uppercase mb-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    Editando Etapa {editingStep.step_order}
                                </p>
                                <h2 className="text-white text-xl font-heading font-light tracking-tight truncate flex items-center gap-3">
                                    {editingStep.name}
                                    {!editingStep.is_active && (
                                        <span className="text-[10px] font-bold uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md self-center">
                                            Inativa na Jornada
                                        </span>
                                    )}
                                </h2>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setEditingStep(null)}
                                    className="size-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
                                    title="Fechar Editor"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                                <button
                                    onClick={() => handleSaveStep()}
                                    disabled={saving || !editingStep.name.trim() || !editingStep.prompt_instructions.trim()}
                                    className="backstagefy-btn-primary px-6 py-2.5 rounded-xl disabled:opacity-30 flex items-center gap-2 relative overflow-hidden group"
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <span className="material-symbols-outlined text-sm relative z-10">{saving ? 'sync' : 'save'}</span>
                                    <span className="text-xs font-bold uppercase tracking-wider relative z-10">
                                        {saving ? 'Gravando...' : 'Salvar Alterações'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Form Content */}
                        <div className="flex-1 overflow-y-auto px-8 pt-28 pb-12 space-y-6">

                            {/* BLOCK: Settings & Type */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {/* Details Card */}
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-white/80 text-sm font-medium flex items-center gap-2 mb-6">
                                            <span className="material-symbols-outlined text-primary text-lg">segment</span>
                                            Identificação
                                        </h3>
                                        <div className="space-y-2 mb-6">
                                            <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold block">Nome da Etapa</label>
                                            <input
                                                type="text"
                                                value={editingStep.name}
                                                onChange={(e) => setEditingStep({ ...editingStep, name: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 text-white py-3.5 px-4 rounded-xl focus:ring-0 focus:border-primary transition-all text-sm outline-none"
                                                placeholder="Ex: Qualificação Básica..."
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl border border-white/5">
                                        <div>
                                            <p className="text-white text-sm font-semibold">Status de Execução</p>
                                            <p className="text-white/40 text-[10px] leading-tight mt-1 max-w-[200px]">Define se a IA deve passar por esta etapa ou pulá-la.</p>
                                        </div>
                                        <button
                                            onClick={() => setEditingStep({ ...editingStep, is_active: !editingStep.is_active })}
                                            className={`relative w-12 h-7 rounded-full transition-all duration-300 ${editingStep.is_active ? 'bg-primary/40 border-[1.5px] border-primary pb-px' : 'bg-white/10 border-[1.5px] border-white/20'}`}
                                        >
                                            <div className={`absolute top-[4px] size-4 rounded-full transition-all duration-300 shadow-md ${editingStep.is_active ? 'left-[22px] bg-primary' : 'left-[5px] bg-white/40'}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Type Selection Card */}
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <h3 className="text-white/80 text-sm font-medium flex items-center gap-2 mb-6">
                                        <span className="material-symbols-outlined text-primary text-lg">category</span>
                                        Classificação da Etapa
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3 h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                        {STEP_TYPES.map(t => (
                                            <button
                                                key={t.value}
                                                onClick={() => setEditingStep({ ...editingStep, type: t.value })}
                                                className={`flex items-center gap-3 p-3.5 rounded-xl text-left transition-all border group ${editingStep.type === t.value
                                                    ? 'bg-primary/10 border-primary/40 text-white shadow-[0_0_15px_rgba(var(--color-primary),0.05)]'
                                                    : 'bg-black/20 border-white/5 text-white/50 hover:bg-white/5 hover:border-white/20 hover:text-white/90'
                                                    }`}
                                            >
                                                <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 bg-black/50 border border-white/5 transition-colors ${editingStep.type === t.value ? t.color : 'text-white/40 group-hover:text-white/70'
                                                    }`}>
                                                    <span className="material-symbols-outlined text-lg">{t.icon}</span>
                                                </div>
                                                <span className="text-xs font-semibold leading-tight">{t.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* BLOCK: Prompt Instructions + AI Optimizer */}
                            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col h-[500px]">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-white/80 text-sm font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">terminal</span>
                                        Instruções Diretas (Prompt da Etapa)
                                    </h3>
                                    <button
                                        onClick={handleOptimize}
                                        disabled={optimizing || !editingStep.prompt_instructions.trim() || editingStep.prompt_instructions.trim().length < 10}
                                        className="group relative flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-amber-500/20 to-primary/20 border border-amber-500/30 text-amber-400 hover:from-amber-500/30 hover:to-primary/30 hover:border-amber-400/50 hover:text-amber-300 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-primary/10 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <span className="material-symbols-outlined text-sm relative z-10">{optimizing ? 'progress_activity' : 'auto_awesome'}</span>
                                        <span className="relative z-10">{optimizing ? 'Otimizando...' : 'Melhorar com IA'}</span>
                                    </button>
                                </div>
                                <p className="text-white/40 text-[10px] mb-4 line-clamp-2">
                                    Estas instruções serão injetadas na "mente" da IA assim que o Lead chegar nesta etapa.
                                </p>

                                {/* Optimized Preview Panel */}
                                {showOptimized && optimizedPrompt ? (
                                    <div className="flex-1 flex flex-col gap-3 animate-in slide-in-from-bottom-3 fade-in duration-500">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-400 text-sm">auto_awesome</span>
                                            <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest">Versão Otimizada pela IA</p>
                                            <div className="flex-1" />
                                            <span className="text-white/20 text-[10px] font-mono">{optimizedPrompt.length} chars</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto bg-[#0a0a0a] border border-amber-500/20 rounded-xl p-5 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                                            <pre className="text-[#d4d4d4] text-sm font-mono leading-relaxed whitespace-pre-wrap">{optimizedPrompt}</pre>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <button
                                                onClick={handleAcceptOptimized}
                                                className="flex-1 py-3 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest hover:bg-primary/30 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                                Aplicar Versão Otimizada
                                            </button>
                                            <button
                                                onClick={handleRejectOptimized}
                                                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold uppercase tracking-widest hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm">close</span>
                                                Descartar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 relative flex flex-col">
                                        {optimizing && (
                                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-xl z-10 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
                                                <div className="size-12 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                                                <div className="text-center">
                                                    <p className="text-amber-400 text-xs font-bold uppercase tracking-widest">Engenheiro de Prompts IA</p>
                                                    <p className="text-white/40 text-[10px] mt-1">Analisando, estruturando e otimizando...</p>
                                                </div>
                                            </div>
                                        )}
                                        <textarea
                                            value={editingStep.prompt_instructions}
                                            onChange={(e) => setEditingStep({ ...editingStep, prompt_instructions: e.target.value })}
                                            className="flex-1 w-full bg-[#0a0a0a] border border-white/10 text-[#d4d4d4] p-5 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm resize-none font-mono leading-relaxed outline-none shadow-inner"
                                            placeholder="Descreva as instruções da IA para esta etapa..."
                                        />
                                        <div className="absolute bottom-4 right-4 bg-black/60 px-2 py-1 rounded text-white/30 text-[10px] font-mono pointer-events-none border border-white/5">
                                            {editingStep.prompt_instructions.length} bytes
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gradient-to-br from-transparent to-black/20">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 rounded-full blur-[50px] pointer-events-none" />
                            <div className="size-32 rounded-[2rem] bg-white/[0.02] border border-white/5 flex items-center justify-center mb-8 relative z-10 shadow-2xl rotate-3">
                                <span className="material-symbols-outlined text-6xl text-primary/60 -rotate-3">edit_document</span>
                            </div>
                        </div>
                        <h3 className="text-2xl text-white font-heading font-light mb-3">Editor de Etapas Inativo</h3>
                        <p className="text-white/40 text-sm max-w-md mb-8 leading-relaxed">
                            Crie uma nova etapa ou selecione uma existente no menu lateral esquerdo para configurar as instruções de comportamento da Inteligência Artificial.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FunnelBuilder;
