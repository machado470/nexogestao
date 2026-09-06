
<!doctype html>
<html lang="pt-BR" class="h-full">
 <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexoGestão</title>
  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <script src="https://cdn.jsdelivr.net/npm/lucide@0.263.0/dist/umd/lucide.min.js"></script>
  <script src="/codelet/eyJhbGciOiJIUzI1NiJ9.eyJjIjoiYzYyNWp6dnlydzB5Mng2MiIsImV4cCI6MTc3NTkxNzE2NiwiZGVwIjoiQVNTSVNUQU5UX1RIUkVBRF9DT0RFTEVUI2QyZjk3MzlkLWQ0YmUtNDBmZS05NmZjLWEyMDgyZTA2ZTk3NyJ9.BDJNNikqMDMw2JOTQVFe5YZLeawrmbJ8xWeGLZubhj0/element_sdk.js?pin_id=309acd35d008c8e24cec326637cb0e76"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=DM+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
  <script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0a1628', 800: '#0f1f38', 700: '#162a4a' },
        petrol: { 600: '#1a3a52', 500: '#1e4460', 400: '#245272' },
        graphite: { 600: '#1e2a3a', 500: '#243344', 400: '#2c3e50' },
        accent: { 500: '#e8772e', 400: '#f0893f', 300: '#f49b55' },
        surface: { 100: '#c8d6e5', 200: '#8fa7bf', 300: '#6b8baa' }
      }
    }
  }
}
</script>
  <style>
html, body { height: 100%; margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
* { box-sizing: border-box; }

.glow-accent { box-shadow: 0 0 20px rgba(232,119,46,0.25), 0 4px 12px rgba(0,0,0,0.3); }
.card-surface {
  background: linear-gradient(135deg, rgba(30,58,82,0.6) 0%, rgba(22,42,74,0.4) 100%);
  border: 1px solid rgba(36,82,114,0.3);
  backdrop-filter: blur(10px);
}
.sidebar-item { transition: all 0.2s ease; }
.sidebar-item:hover { background: rgba(36,82,114,0.3); }
.sidebar-item.active { background: rgba(232,119,46,0.12); border-left: 3px solid #e8772e; }
.sidebar-item.active .item-icon, .sidebar-item.active .item-text { color: #f0893f; }

.stat-bar { animation: barGrow 1.2s ease-out forwards; transform-origin: left; }
@keyframes barGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
.fade-up { animation: fadeUp 0.5s ease-out both; }

.mini-chart { display: flex; align-items: flex-end; gap: 3px; height: 40px; }
.mini-bar { width: 6px; border-radius: 3px; background: rgba(232,119,46,0.5); animation: miniGrow 0.8s ease-out both; }
@keyframes miniGrow { from { height: 0; } }

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(36,82,114,0.4); border-radius: 3px; }
</style>
  <style>body { box-sizing: border-box; }</style>
  <script src="/codelet/eyJhbGciOiJIUzI1NiJ9.eyJjIjoiYzYyNWp6dnlydzB5Mng2MiIsImV4cCI6MTc3NTkxNzE2NiwiZGVwIjoiQVNTSVNUQU5UX1RIUkVBRF9DT0RFTEVUI2QyZjk3MzlkLWQ0YmUtNDBmZS05NmZjLWEyMDgyZTA2ZTk3NyJ9.BDJNNikqMDMw2JOTQVFe5YZLeawrmbJ8xWeGLZubhj0/data_sdk.js?pin_id=309acd35d008c8e24cec326637cb0e76" type="text/javascript"></script>
 </head>
 <body class="h-full bg-navy-900 text-surface-100 overflow-hidden">
  <div class="flex h-full w-full"><!-- Sidebar -->
   <aside class="w-64 flex-shrink-0 h-full bg-navy-800 border-r border-petrol-600/30 flex flex-col" style="min-width:240px;"><!-- Logo -->
    <div class="px-6 py-6 border-b border-petrol-600/20">
     <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center glow-accent">
       <svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
       </svg>
      </div>
      <div><span class="text-base font-bold text-white tracking-tight">Nexo</span><span class="text-base font-bold text-accent-400 tracking-tight">Gestão</span>
       <p class="text-[10px] text-surface-300 tracking-widest uppercase mt-[-2px]">Enterprise</p>
      </div>
     </div>
    </div>
    <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
     <p class="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-surface-300 mb-2">Operação</p><a class="sidebar-item active flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"> <i data-lucide="layout-dashboard" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Dashboard</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="users" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Clientes</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="calendar" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Agendamentos</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="clipboard-list" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Ordens de Serviço</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="message-circle" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">WhatsApp</span> <span class="ml-auto text-[10px] bg-accent-500/20 text-accent-400 px-2 py-0.5 rounded-full font-semibold">12</span> </a>
     <p class="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-surface-300 mt-5 mb-2">Financeiro</p><a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="wallet" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Faturamento</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="receipt" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Cobranças</span> </a>
     <p class="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-surface-300 mt-5 mb-2">Inteligência</p><a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="bar-chart-3" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Relatórios</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="zap" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Automações</span> </a>
     <p class="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-surface-300 mt-5 mb-2">Administração</p><a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="settings" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Configurações</span> </a> <a class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-surface-200"> <i data-lucide="shield" class="item-icon w-[18px] h-[18px]"></i> <span class="item-text text-sm font-medium">Permissões</span> </a>
    </nav><!-- User bottom -->
    <div class="px-4 py-4 border-t border-petrol-600/20">
     <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-petrol-500 flex items-center justify-center text-sm font-bold text-white">
       RC
      </div>
      <div class="flex-1 min-w-0">
       <p class="text-sm font-semibold text-white truncate">Rafael Costa</p>
       <p class="text-[11px] text-surface-300">Administrador</p>
      </div><i data-lucide="log-out" class="w-4 h-4 text-surface-300 cursor-pointer hover:text-accent-400 transition-colors"></i>
     </div>
    </div>
   </aside><!-- Main -->
   <div class="flex-1 flex flex-col h-full overflow-hidden"><!-- Header -->
    <header class="flex-shrink-0 px-8 py-5 border-b border-petrol-600/20 flex items-center gap-6">
     <div class="flex-1 min-w-0">
      <h1 id="page-title" class="text-xl font-bold text-white tracking-tight">Centro de Operações</h1>
      <p id="page-subtitle" class="text-sm text-surface-300 mt-0.5">Visão geral em tempo real</p>
     </div>
     <div class="flex items-center gap-3 flex-shrink-0">
      <div class="relative"><i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-300"></i> <input type="text" placeholder="Buscar..." class="w-56 pl-9 pr-4 py-2.5 rounded-xl bg-navy-800 border border-petrol-600/30 text-sm text-surface-100 placeholder-surface-300 focus:outline-none focus:border-accent-500/40 transition-colors" aria-label="Buscar">
      </div><button class="relative p-2.5 rounded-xl bg-navy-800 border border-petrol-600/30 hover:border-petrol-400/40 transition-colors" aria-label="Notificações"> <i data-lucide="bell" class="w-[18px] h-[18px] text-surface-200"></i> <span class="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-accent-500 rounded-full border-2 border-navy-800"></span> </button> <button id="cta-btn" class="px-5 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-400 text-white text-sm font-semibold glow-accent transition-all active:scale-[0.97]"> <span class="flex items-center gap-2"><i data-lucide="play" class="w-4 h-4"></i><span id="cta-text">Executar agora</span></span> </button>
     </div>
    </header><!-- Content -->
    <main class="flex-1 overflow-y-auto p-8 space-y-6"><!-- KPI Row -->
     <div class="grid grid-cols-4 gap-5 fade-up" style="animation-delay:0.1s;">
      <div class="card-surface rounded-2xl p-5">
       <div class="flex items-center justify-between mb-3"><span class="text-xs font-semibold uppercase tracking-wider text-surface-300">Receita Mensal</span>
        <div class="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center">
         <i data-lucide="trending-up" class="w-4 h-4 text-accent-400"></i>
        </div>
       </div>
       <p class="text-2xl font-extrabold text-white">R$ 284.750</p>
       <div class="flex items-center gap-2 mt-2"><span class="text-[11px] font-semibold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">+18,4%</span> <span class="text-[11px] text-surface-300">vs. mês anterior</span>
       </div>
      </div>
      <div class="card-surface rounded-2xl p-5">
       <div class="flex items-center justify-between mb-3"><span class="text-xs font-semibold uppercase tracking-wider text-surface-300">Ordens Ativas</span>
        <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
         <i data-lucide="clipboard-list" class="w-4 h-4 text-blue-400"></i>
        </div>
       </div>
       <p class="text-2xl font-extrabold text-white">147</p>
       <div class="flex items-center gap-2 mt-2"><span class="text-[11px] font-semibold text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded-full">23 urgentes</span> <span class="text-[11px] text-surface-300">em andamento</span>
       </div>
      </div>
      <div class="card-surface rounded-2xl p-5">
       <div class="flex items-center justify-between mb-3"><span class="text-xs font-semibold uppercase tracking-wider text-surface-300">Clientes Ativos</span>
        <div class="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
         <i data-lucide="users" class="w-4 h-4 text-purple-400"></i>
        </div>
       </div>
       <p class="text-2xl font-extrabold text-white">1.832</p>
       <div class="flex items-center gap-2 mt-2"><span class="text-[11px] font-semibold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">+42</span> <span class="text-[11px] text-surface-300">este mês</span>
       </div>
      </div>
      <div class="card-surface rounded-2xl p-5">
       <div class="flex items-center justify-between mb-3"><span class="text-xs font-semibold uppercase tracking-wider text-surface-300">SLA Cumprido</span>
        <div class="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center">
         <i data-lucide="check-circle" class="w-4 h-4 text-green-400"></i>
        </div>
       </div>
       <p class="text-2xl font-extrabold text-white">96,8%</p>
       <div class="w-full h-2 bg-navy-900/60 rounded-full mt-3 overflow-hidden">
        <div class="stat-bar h-full rounded-full bg-gradient-to-r from-green-500 to-green-400" style="width:96.8%"></div>
       </div>
      </div>
     </div><!-- Main Grid -->
     <div class="grid grid-cols-3 gap-5"><!-- Activity Chart -->
      <div class="col-span-2 card-surface rounded-2xl p-6 fade-up" style="animation-delay:0.2s;">
       <div class="flex items-center justify-between mb-6">
        <div>
         <h2 class="text-base font-bold text-white">Fluxo Operacional</h2>
         <p class="text-xs text-surface-300 mt-0.5">Últimos 14 dias</p>
        </div>
        <div class="flex gap-2"><button class="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-accent-500/15 text-accent-400">Ordens</button> <button class="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-navy-900/40 text-surface-300 hover:text-surface-100 transition-colors">Receita</button>
        </div>
       </div><!-- Chart visualization -->
       <div class="flex items-end gap-2 h-44" id="chart-area">
        <script>
            const vals = [35,52,41,68,55,72,48,80,62,90,75,85,70,95];
            document.currentScript.parentElement.innerHTML = vals.map((v,i) =>
              `<div class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full rounded-lg transition-all hover:opacity-80" style="height:${v}%;background:linear-gradient(to top,rgba(232,119,46,0.7),rgba(232,119,46,0.2));animation:miniGrow 0.6s ease-out ${i*0.05}s both;"></div>
                <span class="text-[9px] text-surface-300">${['01','02','03','04','05','06','07','08','09','10','11','12','13','14'][i]}</span>
              </div>`
            ).join('');
          </script>
       </div>
      </div><!-- Recent Orders -->
      <div class="card-surface rounded-2xl p-6 fade-up" style="animation-delay:0.3s;">
       <div class="flex items-center justify-between mb-5">
        <h2 class="text-base font-bold text-white">Ordens Recentes</h2><button class="text-[11px] text-accent-400 font-semibold hover:underline">Ver todas</button>
       </div>
       <div class="space-y-3">
        <div class="flex items-center gap-3 p-3 rounded-xl bg-navy-900/40">
         <div class="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0"></div>
         <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white truncate">Manutenção HVAC #1284</p>
          <p class="text-[11px] text-surface-300">Edifício Central — Urgente</p>
         </div><span class="text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-500/15 text-red-400">Crítico</span>
        </div>
        <div class="flex items-center gap-3 p-3 rounded-xl bg-navy-900/40">
         <div class="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></div>
         <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white truncate">Instalação Elétrica #1283</p>
          <p class="text-[11px] text-surface-300">Galpão Norte — Andamento</p>
         </div><span class="text-[10px] font-semibold px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400">Ativo</span>
        </div>
        <div class="flex items-center gap-3 p-3 rounded-xl bg-navy-900/40">
         <div class="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></div>
         <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white truncate">Limpeza Técnica #1282</p>
          <p class="text-[11px] text-surface-300">Sede Administrativa</p>
         </div><span class="text-[10px] font-semibold px-2 py-1 rounded-lg bg-green-500/15 text-green-400">Concluído</span>
        </div>
        <div class="flex items-center gap-3 p-3 rounded-xl bg-navy-900/40">
         <div class="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"></div>
         <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white truncate">Vistoria Preventiva #1281</p>
          <p class="text-[11px] text-surface-300">Filial Campinas</p>
         </div><span class="text-[10px] font-semibold px-2 py-1 rounded-lg bg-yellow-500/15 text-yellow-400">Pendente</span>
        </div>
       </div>
      </div>
     </div><!-- Bottom Row -->
     <div class="grid grid-cols-3 gap-5"><!-- Team Performance -->
      <div class="card-surface rounded-2xl p-6 fade-up" style="animation-delay:0.35s;">
       <h2 class="text-base font-bold text-white mb-5">Performance Equipe</h2>
       <div class="space-y-4">
        <div>
         <div class="flex justify-between mb-1.5">
          <span class="text-sm text-surface-100">Equipe Alpha</span><span class="text-sm font-bold text-white">94%</span>
         </div>
         <div class="h-2 bg-navy-900/60 rounded-full overflow-hidden">
          <div class="stat-bar h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-300" style="width:94%;animation-delay:0.4s"></div>
         </div>
        </div>
        <div>
         <div class="flex justify-between mb-1.5">
          <span class="text-sm text-surface-100">Equipe Beta</span><span class="text-sm font-bold text-white">87%</span>
         </div>
         <div class="h-2 bg-navy-900/60 rounded-full overflow-hidden">
          <div class="stat-bar h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400" style="width:87%;animation-delay:0.5s"></div>
         </div>
        </div>
        <div>
         <div class="flex justify-between mb-1.5">
          <span class="text-sm text-surface-100">Equipe Gamma</span><span class="text-sm font-bold text-white">78%</span>
         </div>
         <div class="h-2 bg-navy-900/60 rounded-full overflow-hidden">
          <div class="stat-bar h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400" style="width:78%;animation-delay:0.6s"></div>
         </div>
        </div>
       </div>
      </div><!-- Schedule -->
      <div class="card-surface rounded-2xl p-6 fade-up" style="animation-delay:0.4s;">
       <div class="flex items-center justify-between mb-5">
        <h2 class="text-base font-bold text-white">Agenda Hoje</h2><span class="text-xs text-surface-300">5 compromissos</span>
       </div>
       <div class="space-y-3">
        <div class="flex gap-3 items-start">
         <div class="text-center flex-shrink-0 w-10">
          <p class="text-sm font-bold text-accent-400">08:30</p>
         </div>
         <div class="flex-1 border-l-2 border-accent-500/30 pl-3">
          <p class="text-sm font-semibold text-white">Reunião operacional</p>
          <p class="text-[11px] text-surface-300">Sala de comando — 45min</p>
         </div>
        </div>
        <div class="flex gap-3 items-start">
         <div class="text-center flex-shrink-0 w-10">
          <p class="text-sm font-bold text-blue-400">10:00</p>
         </div>
         <div class="flex-1 border-l-2 border-blue-500/30 pl-3">
          <p class="text-sm font-semibold text-white">Vistoria cliente VIP</p>
          <p class="text-[11px] text-surface-300">Externo — 2h estimado</p>
         </div>
        </div>
        <div class="flex gap-3 items-start">
         <div class="text-center flex-shrink-0 w-10">
          <p class="text-sm font-bold text-surface-300">14:00</p>
         </div>
         <div class="flex-1 border-l-2 border-petrol-600/40 pl-3">
          <p class="text-sm font-semibold text-white">Review financeiro</p>
          <p class="text-[11px] text-surface-300">Online — 1h</p>
         </div>
        </div>
       </div>
      </div><!-- Alerts -->
      <div class="card-surface rounded-2xl p-6 fade-up" style="animation-delay:0.45s;">
       <div class="flex items-center justify-between mb-5">
        <h2 class="text-base font-bold text-white">Alertas do Sistema</h2><span class="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-[10px] font-bold text-red-400">3</span>
       </div>
       <div class="space-y-3">
        <div class="p-3 rounded-xl bg-red-500/8 border border-red-500/15">
         <div class="flex items-center gap-2 mb-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-red-400"></i> <span class="text-xs font-semibold text-red-400">SLA em risco</span>
         </div>
         <p class="text-[11px] text-surface-200">3 ordens excedem prazo em 2h</p>
        </div>
        <div class="p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/15">
         <div class="flex items-center gap-2 mb-1"><i data-lucide="clock" class="w-3.5 h-3.5 text-yellow-400"></i> <span class="text-xs font-semibold text-yellow-400">Estoque baixo</span>
         </div>
         <p class="text-[11px] text-surface-200">Peças de reposição abaixo do mínimo</p>
        </div>
        <div class="p-3 rounded-xl bg-blue-500/8 border border-blue-500/15">
         <div class="flex items-center gap-2 mb-1"><i data-lucide="info" class="w-3.5 h-3.5 text-blue-400"></i> <span class="text-xs font-semibold text-blue-400">Atualização</span>
         </div>
         <p class="text-[11px] text-surface-200">Nova versão v4.2 disponível</p>
        </div>
       </div>
      </div>
     </div>
    </main>
   </div>
  </div>
  <script>
lucide.createIcons();

// Sidebar navigation interaction
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', function() {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    this.classList.add('active');
    lucide.createIcons();
  });
});

// Element SDK
const defaultConfig = {
  page_title: 'Centro de Operações',
  page_subtitle: 'Visão geral em tempo real',
  cta_text: 'Executar agora',
  background_color: '#0a1628',
  surface_color: '#1a3a52',
  text_color: '#c8d6e5',
  primary_action_color: '#e8772e',
  secondary_action_color: '#245272'
};

function applyConfig(config) {
  const c = { ...defaultConfig, ...config };
  document.getElementById('page-title').textContent = c.page_title;
  document.getElementById('page-subtitle').textContent = c.page_subtitle;
  document.getElementById('cta-text').textContent = c.cta_text;

  document.body.style.backgroundColor = c.background_color;

  document.querySelectorAll('.card-surface').forEach(el => {
    el.style.borderColor = c.surface_color + '4d';
  });

  document.querySelectorAll('.sidebar-item.active .item-icon, .sidebar-item.active .item-text').forEach(el => {
    el.style.color = c.primary_action_color;
  });

  const ctaBtn = document.getElementById('cta-btn');
  ctaBtn.style.backgroundColor = c.primary_action_color;
  ctaBtn.style.boxShadow = `0 0 20px ${c.primary_action_color}40, 0 4px 12px rgba(0,0,0,0.3)`;

  const font = c.font_family || 'Plus Jakarta Sans';
  document.body.style.fontFamily = `${font}, sans-serif`;

  if (c.font_size) {
    const base = c.font_size;
    document.getElementById('page-title').style.fontSize = `${base * 1.3}px`;
    document.getElementById('page-subtitle').style.fontSize = `${base * 0.875}px`;
  }
}

if (window.elementSdk) {
  window.elementSdk.init({
    defaultConfig,
    onConfigChange: async (config) => applyConfig(config),
    mapToCapabilities: (config) => ({
      recolorables: [
        { get: () => config.background_color || defaultConfig.background_color, set: (v) => { config.background_color = v; window.elementSdk.setConfig({ background_color: v }); } },
        { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => { config.surface_color = v; window.elementSdk.setConfig({ surface_color: v }); } },
        { get: () => config.text_color || defaultConfig.text_color, set: (v) => { config.text_color = v; window.elementSdk.setConfig({ text_color: v }); } },
        { get: () => config.primary_action_color || defaultConfig.primary_action_color, set: (v) => { config.primary_action_color = v; window.elementSdk.setConfig({ primary_action_color: v }); } },
        { get: () => config.secondary_action_color || defaultConfig.secondary_action_color, set: (v) => { config.secondary_action_color = v; window.elementSdk.setConfig({ secondary_action_color: v }); } }
      ],
      borderables: [],
      fontEditable: {
        get: () => config.font_family || defaultConfig.font_family || 'Plus Jakarta Sans',
        set: (v) => { config.font_family = v; window.elementSdk.setConfig({ font_family: v }); }
      },
      fontSizeable: {
        get: () => config.font_size || 16,
        set: (v) => { config.font_size = v; window.elementSdk.setConfig({ font_size: v }); }
      }
    }),
    mapToEditPanelValues: (config) => new Map([
      ['page_title', config.page_title || defaultConfig.page_title],
      ['page_subtitle', config.page_subtitle || defaultConfig.page_subtitle],
      ['cta_text', config.cta_text || defaultConfig.cta_text]
    ])
  });
}
</script>
 <script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'9ea262fb960402fa',t:'MTc3NTgzMDc2OC4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script></body>
</html>