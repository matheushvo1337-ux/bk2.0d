const fbTracking = {
    defaultPixelId: '867666556327313', 
    pixelId: new URLSearchParams(window.location.search).get('pixel') || '',
    utms: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck'].reduce((acc, param) => {
        const val = new URLSearchParams(window.location.search).get(param);
        if (val) {
            acc[param] = val;
            localStorage.setItem(`bk_funil_${param}`, val); // SALVA PERSISTENTE (UTMify Style)
        } else {
            acc[param] = localStorage.getItem(`bk_funil_${param}`) || ''; // RECUPERA DO CACHE
        }
        return acc;
    }, {})
};
fbTracking.pixelId = fbTracking.pixelId || fbTracking.defaultPixelId;

function initTracker() {
    if(!fbTracking.pixelId) {
        console.warn('⚠️ FB Pixel ID não encontrado na URL (?pixel=ID) nem no script.');
        return;
    }
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    
    fbq('init', fbTracking.pixelId);
    fbq('track', 'PageView');
    fireCAPI('PageView');
    
    // ─── SMART PAGE EVENTS ─────────────────────────────
    // Dispara eventos específicos por URL para treinar o Pixel do Meta 
    let pagePath = window.location.pathname.split('/').pop().replace('.html', '');
    if (pagePath === '') pagePath = 'index'; // Home catch
    
    const pageMap = {
        // Topo do funil: entrada
        'index':              () => firePixel('ViewContent',         { content_name: 'Página Inicial', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        'funil':              () => firePixel('ViewContent',         { content_name: 'Oferta Principal', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        'lista-cupons':       () => firePixel('ViewContent',         { content_name: 'Lista de Cupons', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        'cupom':              () => firePixel('ViewContent',         { content_name: 'Cupom Selecionado', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        // Meio do funil: engajamento forte
        'dados':              () => firePixel('CompleteRegistration', { content_name: 'Preenchimento de Dados', status: true, currency: 'BRL', value: (state.basePrice || 22.90) }),
        'loading':            () => firePixel('Search',               { content_name: 'Buscando Restaurante', search_string: state.cep || '', currency: 'BRL', value: (state.basePrice || 22.90) }),
        // lojas descontinuado — fluxo vai direto loading → sacola
        'sacola':             () => firePixel('AddToCart',           { content_name: 'Sacola de Compra', content_ids: ['bk-combo-v7'], content_type: 'product', currency: 'BRL', value: (state.basePrice || 22.90) }),
        // Fundo do funil: intenção máxima
        'pagamento':          () => firePixel('AddPaymentInfo',      { currency: 'BRL', value: ((state.basePrice || 22.90) + (state.fretePrice || 0)) }),
        'entrega':            () => firePixel('ViewContent',         { content_name: 'Acompanhamento de Entrega', content_category: 'Delivery', currency: 'BRL', value: ((state.basePrice || 22.90) + (state.fretePrice || 0)) }),
        'safe':               () => firePixel('ViewContent',         { content_name: 'Safe Page', content_category: 'Cloaker', value: 0.0, currency: 'BRL' })
    };

    // Dispara o evento correspondente  à página atual
    const handler = pageMap[pagePath];
    if (handler) {
        // Aguarda o state ser carregado antes de disparar
        setTimeout(handler, 100);
    }
}

async function fireCAPI(event, data = {}) {
    if(!fbTracking.pixelId) return;
    
    // Bloqueia fetch se estiver rodando via file:// (CORS bypass)
    if (window.location.protocol === 'file:') {
        console.log(`📡 CAPI Simulado (file://): ${event}`);
        return;
    }

    try {
        await fetch('api/fb-capi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_name: event,
                event_id: data.event_id || null,
                pixel_id: fbTracking.pixelId,
                custom_data: {
                    ...data,
                    ...fbTracking.utms,
                    agent: 'Janus-Tesavek-Hybrid'
                },
                user: {
                    email: state.email || '',
                    phone: state.phone || ''
                }
            })
        });
    } catch(e) {
        // Erro silencioso em produção para não quebrar o UX
    }
}

function firePixel(event, data = {}) {
    if(!window.fbq || !fbTracking.pixelId) return;
    
    // Gera event_id único para deduplicação entre Client e CAPI
    const eventId = data.event_id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const enrichedData = {
        ...data,
        ...fbTracking.utms,
        content_category: 'BK Funil V7',
        agent: 'Janus-Tesavek-Omniscient'
    };
    
    // ─── RASTREAMENTO HÍBRIDO (CLIENT + SERVER) ───
    fbq('track', event, enrichedData, { eventID: eventId });
    fireCAPI(event, { ...data, event_id: eventId }); // Despacha para o servidor com mesmo event_id

    console.log(`🚀 Pixel Fired: ${event} [${eventId}]`, enrichedData);
}

// BACK-REDIRECT REMOVIDO A PEDIDO

// ─── ESTADO GLOBAL ──────────────────────────────────

let state = {
    city: 'SÃO PAULO',
    cep: '',
    street: '',
    neighborhood: '',
    number: '',
    uf: '',
    addressFound: false,
    selectedStore: '',
    basePrice: 22.90,
    upsellTotal: 0,
    upsellItems: [],
    fretePrice: 0,
    freteLabel: 'Grátis',
    customizations: {},
    paymentMethod: 'pix',
    discount: 0,
    osmStores: null,
    nomeUser: '',
    cartItems: [], // Iniciado vazio para ser preenchido pela roleta ou persistência
    upsellOffered: false
};

// 💎 SYNC STATE (The Bridge)
function saveState() {
    localStorage.setItem('bk_v7_state', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('bk_v7_state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(state, parsed);
        } catch(e) { console.error('State Restore Fail', e); }
    }
}

// Inicializa o estado IMEDIATAMENTE
loadState();

// ─── CONFIGURAÇÃO DE INTEGRAÇÃO (Google Places) ────
const GOOGLE_PLACES_API_KEY = ''; 

const storeMocks = {
    'SÃO PAULO': ['Av. Paulista, 1000', 'Shopping Itaquera', 'Drive Thru Ibirapuera'],
    'VOTORANTIM': ['BK Drive-Thru - Av. 31 de Março, 335', 'BK Shopping Iguatemi Esplanada', 'BK Votorantim Centro'],
    'SOROCABA': ['Burger King - Av. Itavuvu, 2300', 'BK Shopping Cidade Sorocaba', 'BK Campolim Drive'],
    'RIO DE JANEIRO': ['Copacabana', 'Barra Shopping', 'Botafogo Praia Shopping'],
    'BELO HORIZONTE': ['Praça Savassi', 'Shopping Cidade', 'Drive Thru Raja'],
    'CURITIBA': ['Batel', 'Shopping Mueller', 'Linha Verde Drive'],
    'PORTO ALEGRE': ['Shopping Iguatemi', 'Praça de Alimentação Praia de Belas', 'Drive Thru Assis Brasil'],
    'BRASÍLIA': ['Asa Sul', 'Conjunto Nacional', 'Drive Thru Águas Claras'],
    'SALVADOR': ['Shopping da Bahia', 'Salvador Shopping', 'Drive Thru Rio Vermelho'],
    'RECIFE': ['Shopping Recife', 'RioMar', 'Drive Thru Boa Viagem'],
    'FORTALEZA': ['Iguatemi Fortaleza', 'RioMar Kennedy', 'Aldeota'],
    'GERAL': ['Burger King - Shopping Central', 'BK Drive - Premium Delivery', 'BK - Unidade Express']
};

const fakeNames = ['Carlos','Ana','Pedro','Juliana','Lucas','Mariana','Rafael','Camila','Bruno','Fernanda','Gustavo','Larissa','Diego','Beatriz','Thiago','Amanda','Felipe','Letícia','Mateus','Isabela'];
const proofMessages = ['acabou de resgatar um cupom','garantiu o Combo Whopper','resgatou a oferta agora','acabou de fazer o pedido','aproveitou a promoção'];

// ─── DETECÇÃO DE CIDADE ─────────────────────────────
// REGRA SUPREMA: IP-based city detection ONLY runs on pre-form pages.
// After the user fills dados.html, state.city is SACRED and must never be overwritten.
async function detectCity() {
    // 1. HARD BLOCK: If manual address data exists in state, NEVER override
    if (state.street || state.number || state.cep) return;
    
    // 2. PAGE BLOCK: Only run on pre-form pages (roleta, funil, cupom)
    const postFormPages = ['dados', 'lojas', 'sacola', 'pagamento', 'loading', 'entrega', 'editar-combo'];
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '').toLowerCase();
    if (postFormPages.includes(currentPage)) return;
    
    try {
        const r = await fetch('https://ipapi.co/json/');
        const d = await r.json();
        state.city = (d.city || 'SÃO PAULO').toUpperCase();
    } catch(e) { state.city = 'SÃO PAULO'; }
}

// ─── LIVE COUNTER (SOCIAL PROOF) ───────────────────
function initLiveCounter() {
    const el = document.getElementById('live-users-count');
    if(!el) return;
    
    let base = Math.floor(Math.random() * (2800 - 1500 + 1) + 1500);
    el.textContent = base.toLocaleString('pt-BR');
    
    setInterval(() => {
        const change = Math.floor(Math.random() * 7) - 3; // -3 a +3
        base += change;
        el.textContent = base.toLocaleString('pt-BR');
    }, 3000);
}

// ─── TIMER DE URGÊNCIA ──────────────────────────────
function initCountdown() {
    let s = 15 * 60 - 1;
    const el = document.querySelector('#countdown-timer');
    if (!el) return; // ⏳ Silencia se não houver timer na tela
    setInterval(() => {
        if (s <= 0) s = 15 * 60;
        el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        s--;
    }, 1000);
}

// ─── NAVEGAÇÃO MULTI-PÁGINA ─────────────────────────
function goToScreen(id) {
    saveState();

    const pageMap = {
        'roleta': 'index.html',
        'coupon': 'cupom.html',
        'cep': 'dados.html',
        'edit-combo': 'editar-combo.html',
        // 'stores' descontinuado — fluxo vai direto loading → sacola
        'review': 'sacola.html',
        'pix': 'pagamento.html',
        'delivery': 'entrega.html',
        'loading': 'loading.html'
    };

    const targetFile = pageMap[id];
    if (targetFile) {
        console.log(`🚀 Redirecionando para: ${targetFile}`);
        window.location.href = targetFile;
    }
}


// ─── TRANSIÇÃO DADOS → LOADING (FAST TRACK V8) ─────────────────────
function proceedToStores() {
    // 🚀 Gera o nome da loja dinamicamente para pular a etapa de seleção
    let ruaFormatada = state.street ? state.street.replace(/(Rua|Avenida|Av\.|R\.)/gi, '').trim() : 'Principal';
    let nomeRuaAbreviada = ruaFormatada.split(' ').slice(0, 3).join(' ');
    let logradouro = state.street ? (state.street.toLowerCase().includes('av') ? 'Av.' : 'Rua') : 'Av.';
    
    state.selectedStore = `BK Drive - ${logradouro} ${nomeRuaAbreviada}`;
    
    saveState();
    window.location.href = 'loading.html';
}

// ─── CONFIRMAR DADOS (NOME E ENDEREÇO) ───────────────────
function confirmDeliveryDados() {
    const nome = document.querySelector('#input-nome').value.trim();
    const cepVal = document.querySelector('#input-cep').value.replace(/\D/g, '');
    const extraFields = document.getElementById('cep-extra-fields');
    
    if(!nome || nome.split(' ').length < 2) {
        const inp = document.querySelector('#input-nome');
        inp.focus();
        inp.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05), 0 0 0 2px var(--bk-red)';
        setTimeout(() => { inp.style.boxShadow = ''; }, 1500);
        return;
    }
    
    if(!cepVal || cepVal.length !== 8) {
        const inp = document.querySelector('#input-cep');
        inp.focus();
        inp.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05), 0 0 0 2px var(--bk-red)';
        setTimeout(() => { inp.style.boxShadow = ''; }, 1500);
        return;
    }

    // Se os campos extras ainda estiverem ocultos, revela e pede preenchimento
    if (extraFields && extraFields.style.display === 'none') {
        extraFields.style.display = 'block';
        extraFields.style.animation = 'fadeInUp 0.4s ease';
        const ruaInp = document.querySelector('#input-rua');
        if (ruaInp) setTimeout(() => ruaInp.focus(), 350);
        return;
    }

    const ruaVal = document.querySelector('#input-rua').value.trim();
    const bairroVal = document.querySelector('#input-bairro').value.trim();
    const cidadeVal = document.querySelector('#input-cidade').value.trim();
    const num = document.querySelector('#input-num').value.trim();

    if(!ruaVal || ruaVal.length < 3) {
        const inp = document.querySelector('#input-rua');
        inp.focus();
        inp.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05), 0 0 0 2px var(--bk-red)';
        setTimeout(() => { inp.style.boxShadow = ''; }, 1500);
        return;
    }

    if(!bairroVal || bairroVal.length < 2) {
        const inp = document.querySelector('#input-bairro');
        inp.focus();
        inp.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05), 0 0 0 2px var(--bk-red)';
        setTimeout(() => { inp.style.boxShadow = ''; }, 1500);
        return;
    }
    
    if (!num || num.length < 1) {
        const inp = document.querySelector('#input-num');
        inp.focus();
        inp.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05), 0 0 0 2px var(--bk-red)';
        setTimeout(() => { inp.style.boxShadow = ''; }, 1500);
        return;
    }
    
    state.nomeUser = nome;
    state.street = ruaVal;
    state.neighborhood = bairroVal;
    
    if(cidadeVal) {
        state.city = cidadeVal.split('/')[0] ? cidadeVal.split('/')[0].trim().toUpperCase() : cidadeVal.toUpperCase();
    }
    
    state.number = num;
    if(!state.cep) state.cep = cepVal;

    // Atualiza a tag de localização na tela de lojas com a cidade do lead
    const locTag = document.querySelector('#app-location-tag');
    if(locTag) locTag.textContent = state.city || cidadeVal.toUpperCase();
    
    // Atualiza a interface estática do endereço pra quando o cara chegar na Sacola
    const addr = state.street 
        ? `${state.street}, ${state.number} - ${state.neighborhood || ''}` 
        : `CEP ${state.cep}, Nº ${state.number}`;
    
    const txtAddr = document.getElementById('review-address');
    if(txtAddr) txtAddr.textContent = addr;

    saveState();
    proceedToStores();
}

// ─── BUSCA VIA OSM (REAL DATA FALLBACK) ──────────────────
async function fetchStoresOSM() {
    if (!state.cep) return null;
    try {
        // Passo 1: Geocoding Reverso do CEP via Nominatim (Free & No Key)
        const geoReq = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${state.cep}+Brazil&limit=1`);
        const geoRes = await geoReq.json();
        if (!geoRes || geoRes.length === 0) return null;

        const { lat, lon } = geoRes[0];

        // Passo 2: Busca de BKs num raio de 15km via Overpass API
        const overpassQuery = `[out:json];node["amenity"="fast_food"]["brand"~"Burger King",i](around:15000,${lat},${lon});out;`;
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
        
        const storeReq = await fetch(overpassUrl);
        const storeRes = await storeReq.json();

        if (storeRes.elements && storeRes.elements.length > 0) {
            return storeRes.elements.slice(0, 3).map(el => {
                let name = el.tags.name || 'Burger King';
                // Se o nome vier sem a marca, forçamos para o Lead saber que é BK
                if (!name.toUpperCase().includes('BURGER')) name = 'BK - ' + name;
                return name;
            });
        }
    } catch(e) {
        console.warn('Real Stores Fetch Failed (OSM):', e);
    }
    return null;
}

// ─── INIT API GOOGLE MAPS ───────────────────────────
function loadGoogleMapsScript(callback) {
    if (window.google && window.google.maps) { callback(); return; }
    if (!GOOGLE_PLACES_API_KEY) { callback(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`;
    script.onload = () => callback();
    script.onerror = () => callback();
    document.head.appendChild(script);
}

// ─── RENDERIZAR LOJAS ───────────────────────────────
function renderStoresWithGoogle(list, callback) {
    if (!window.google || !window.google.maps || !state.addressFound) {
        callback(false); return;
    }
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    const request = { query: `Burger King in ${state.city}, ${state.uf}, Brazil` };

    service.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
            let names = results.slice(0, 3).map(r => {
                let name = r.name;
                if (!name.toLowerCase().includes('burger')) name = 'BK - ' + name;
                return name.length > 30 ? name.substring(0, 28) + '...' : name;
            });
            callback(true, names);
        } else {
            callback(false);
        }
    });
}

function renderStores() {
    const list = document.querySelector('#stores-list');
    list.innerHTML = '';
    
    const applyMocks = () => {
        let fallbacks = storeMocks[state.city] || null;
        
        // Se a cidade não estiver no mapa fixo, mimetizamos o ambiente urbano baseando no CEP
        if (!fallbacks) {
            let ruaFormatada = state.street ? state.street.replace(/(Rua|Avenida|Av\.|R\.)/gi, '').trim() : 'Principal';
            let nomeRuaAbreviada = ruaFormatada.split(' ').slice(0, 3).join(' ');
            let numeroAleatorio = Math.floor(Math.random() * 800) + 100;
            let logradouro = state.street ? (state.street.toLowerCase().includes('av') ? 'Av.' : 'Rua') : 'Av.';
            
            fallbacks = [
                `BK Drive-Thru - ${logradouro} ${nomeRuaAbreviada}, ${numeroAleatorio}`,
                `BK Shopping ${state.city || 'Center'}`,
                `BK ${state.neighborhood || 'Centro'} - ${state.city || 'Unidade'}`
            ];
        }
        buildStoreCards(fallbacks, list);
    };

    if (GOOGLE_PLACES_API_KEY && state.addressFound) {
        renderStoresWithGoogle(list, (success, realNames) => {
            if (success && realNames) {
                buildStoreCards(realNames, list);
            } else {
                applyMocks();
            }
        });
    } else if (state.osmStores && state.osmStores.length > 0) {
        // Prioridade 2: Dados Reais via OpenStreetMap se detectados
        buildStoreCards(state.osmStores, list);
    } else {
        // Prioridade 3: Geração Dinâmica Baseada em Endereço
        applyMocks();
    }
}

function buildStoreCards(storeNames, list) {
    storeNames.forEach((s, i) => {
        const card = document.createElement('div');
        card.className = 'store-card';
        card.innerHTML = `
            <div class="store-card-img">
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/cc/Burger_King_2020.svg">
            </div>
            <div class="store-card-info">
                <h4>${s}</h4>
                <div class="store-card-status">
                    <span class="open"><i class="fa-solid fa-circle" style="font-size: 6px;"></i> Aberto agora</span>
                    <span style="opacity: 0.3;">•</span>
                    <span>${15 + Math.floor(Math.random() * 25)} min</span>
                </div>
                <div class="store-card-dist">
                    <i class="fa-solid fa-location-dot" style="font-size: 9px;"></i>
                    ${(0.4 + Math.random() * 3.8).toFixed(1)} km de você
                </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color: #D3C6B9; font-size: 14px;"></i>
        `;
        card.addEventListener('click', () => selectStore(s));
        list.appendChild(card);
    });
}

// ─── SELECIONAR LOJA → REVIEW ───────────────────────
function selectStore(storeName) {
    state.selectedStore = storeName;
    state.upsellTotal = 0;
    state.upsellItems = [];
    state.fretePrice = 0;
    state.freteLabel = 'Grátis';

    // Reset upsell visual (apenas se os elementos existirem)
    document.querySelectorAll('.upsell-item').forEach(el => el.classList.remove('selected'));

    // Reset frete visual
    document.querySelectorAll('.frete-option').forEach(el => el.classList.remove('selected'));
    const defaultFrete = document.querySelector('.frete-option[data-frete="0"]');
    if (defaultFrete) defaultFrete.classList.add('selected');

    // Reset chips
    document.querySelectorAll('.customize-check').forEach(cb => { cb.checked = true; });

    // Atualização de UI (Apenas se estivermos na mesma página ou se os elementos existirem)
    const storeNameEl = document.querySelector('#review-store-name');
    if (storeNameEl) storeNameEl.textContent = `BK - ${storeName}`;

    const addr = state.street
        ? `${state.street}, ${state.number} - ${state.neighborhood || ''}`
        : `CEP ${state.cep}, Nº ${state.number}`;

    const addrEl = document.querySelector('#review-address');
    if (addrEl) addrEl.textContent = addr;

    if (typeof updateTotal === 'function') updateTotal();
    
    saveState();
    
    // Roteamento físico para Sacola
    goToScreen('review');
}

// ─── UPSELL TOGGLE ──────────────────────────────────
function toggleUpsell(el) {
    if (!el) return;
    const price = parseFloat(el.dataset.price);
    const name = el.dataset.name;

    el.classList.toggle('selected');

    if (el.classList.contains('selected')) {
        state.upsellTotal += price;
        state.upsellItems.push(name);
        // Feedback visual de pulso
        el.classList.add('item-pulse');
        setTimeout(() => el.classList.remove('item-pulse'), 500);
    } else {
        state.upsellTotal -= price;
        state.upsellItems = state.upsellItems.filter(n => n !== name);
    }
    updateTotal();
    saveState();
}

// ─── FRETE ──────────────────────────────────────────
function selectFrete(el) {
    if (!el) return;
    document.querySelectorAll('.frete-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
    state.fretePrice = parseFloat(el.dataset.frete) || 0;
    state.freteLabel = state.fretePrice === 0 ? 'Grátis' : `R$ ${state.fretePrice.toFixed(2).replace('.', ',')}`;
    updateTotal();
    saveState();
}

// ─── PAYMENT MASKS & SELECTOR ───────────────────────
function selectPaymentMethod(method) {
    state.paymentMethod = method;
    document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.pay-tab[data-method="${method}"]`);
    if (activeTab) activeTab.classList.add('active');

    const ccContainer = document.getElementById('cc-form-container');
    if (ccContainer) {
        if (method === 'cc') {
            ccContainer.style.display = 'block';
            setTimeout(() => ccContainer.classList.add('active'), 10);
        } else {
            ccContainer.classList.remove('active');
            setTimeout(() => ccContainer.style.display = 'none', 500);
        }
    }
    updateTotal();
}
function maskCC(i) {
    let v = i.value.replace(/\D/g, "");
    v = v.replace(/(\d{4})(?=\d)/g, "$1 ");
    i.value = v;
}
function maskExpiry(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 2) v = v.substring(0,2) + '/' + v.substring(2,4);
    i.value = v;
}
function maskCPF(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 9) v = v.substring(0,3) + '.' + v.substring(3,6) + '.' + v.substring(6,9) + '-' + v.substring(9,11);
    else if (v.length > 6) v = v.substring(0,3) + '.' + v.substring(3,6) + '.' + v.substring(6);
    else if (v.length > 3) v = v.substring(0,3) + '.' + v.substring(3);
    i.value = v;
    // Salva CPF limpo no state para uso no PIX
    state.cpf = v.replace(/\D/g, '');
}

// ─── ATUALIZAR TOTAL ────────────────────────────────
function updateTotal() {
    // Calcula custo extra de personalização do combo roleta
    let extraComboCost = 0;
    if (state.comboCustomizations && state.comboCustomizations.length > 0) {
        extraComboCost = state.comboCustomizations.reduce((sum, c) => sum + (c.price * c.qty), 0);
        // Multiplica pela quantidade de combos na sacola (normalmente 1, mas garante proporção)
        const comboItem = state.cartItems.find(i => i.id === 'combo_roleta');
        if (comboItem) {
            extraComboCost *= comboItem.qty;
        }
    }

    const itemsSubtotal = state.cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
    state.basePrice = itemsSubtotal + extraComboCost;

    let subtotal = (state.basePrice || 0) + (state.upsellTotal || 0);
    let total = subtotal + (state.fretePrice || 0);
    if (state.discount > 0) total = total * (1 - state.discount);

    const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

    const subEl = document.querySelector('#subtotal-value');
    if (subEl) subEl.textContent = fmt(subtotal);

    const freteEl = document.querySelector('#frete-value');
    if (freteEl) {
        freteEl.textContent = state.freteLabel || 'Grátis';
        freteEl.className = (state.fretePrice === 0) ? 'frete-free-text' : '';
    }

    const orderTotalEl = document.querySelector('#order-total');
    if (orderTotalEl) {
        orderTotalEl.innerHTML = (state.discount > 0) 
            ? `<s style="color:#999;font-size:12px;">${fmt(subtotal + (state.fretePrice || 0))}</s> <span style="color:var(--ifood-red);">${fmt(total)}</span>` 
            : fmt(total);
    }

    const btnTotalEl = document.querySelector('#btn-total-value');
    if (btnTotalEl) btnTotalEl.textContent = fmt(total);
    
    // Parcela generator
    if (state.paymentMethod === 'cc') {
        const select = document.getElementById('cc_installments');
        if (select) {
            select.innerHTML = '';
            const limit = total < 50 ? 2 : 12; 
            for(let i=1; i<=limit; i++){
                let px = (total / i).toFixed(2).replace('.',',');
                select.innerHTML += `<option value="${i}">${i}x de R$ ${px} ${i===1?'sem juros':''}</option>`;
            }
        }
    }

    renderAddress();
    saveState();
}

function renderAddress() {
    const addrEl = document.getElementById('review-address');
    if (!addrEl) return;

    // Tenta montar o endereço de várias fontes para garantir persistência
    let rua = state.street || (state.address && state.address.street) || '';
    let num = state.number || (state.address && state.address.number) || '';
    let bairro = state.neighborhood || (state.address && state.address.neighborhood) || '';

    if (rua && num) {
        addrEl.textContent = `${rua}, ${num}${bairro ? ' - ' + bairro : ''}`;
    } else if (state.cep) {
        addrEl.textContent = `CEP ${state.cep}, Nº ${num || 'S/N'}`;
    } else {
        addrEl.textContent = "Endereço não informado";
    }
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    if (!container) return;

    if (!state.cartItems || state.cartItems.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #717171;">Sua sacola está vazia</div>';
        updateTotal();
        return;
    }

    const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
    container.innerHTML = state.cartItems.map(item => {
        let customDesc = '';
        let extraTotal = 0;
        let headerRow = `<p class="item-name" style="font-weight: 900; color: #502314; margin: 0;">${item.name}</p>`;
        
        // Se for o combo roleta, injeta o botão editar de forma limpa e os extras
        if (item.id === 'combo_roleta') {
            headerRow = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 2px;">
                    <p class="item-name" style="font-weight: 900; color: #502314; margin: 0;">${item.name}</p>
                    <button onclick="window.location.href='editar-combo.html'" style="background: none; border: none; color: #d62300; font-size: 11px; font-weight: 800; text-decoration: underline; cursor: pointer; padding: 0; white-space: nowrap; margin-top: 1px;">
                        <i class="fa-solid fa-pen" style="font-size: 10px; margin-right: 3px;"></i>Editar
                    </button>
                </div>
            `;
            if (state.comboCustomizations && state.comboCustomizations.length > 0) {
                const extras = state.comboCustomizations.map(c => `
                    <div style="display: flex; justify-content: space-between; align-items: center; color: #666; font-size: 11px; margin-top: 2px;">
                        <span><span style="color: #16a34a; font-weight: 700;">+</span> ${c.qty}x ${c.name}</span>
                        <span style="font-weight: 600;">+${fmt(c.price * c.qty)}</span>
                    </div>
                `).join('');
                extraTotal = state.comboCustomizations.reduce((sum, c) => sum + (c.price * c.qty), 0);
                customDesc = `<div style="margin-top: 6px;">${extras}</div>`;
            }
        }
        
        return `
        <div class="item-card" data-id="${item.id}">
            <img src="${item.img}" class="item-img" alt="${item.name}">
            <div class="item-card-info">
                ${headerRow}
                <p class="item-desc">${item.desc || ''}</p>
                ${customDesc}
            </div>
            <div class="item-price-row" style="clear: both; display: flex; align-items: center; justify-content: space-between; padding-top: 12px;">
                <p class="item-price" style="margin: 0;">${fmt((item.price + extraTotal) * item.qty)}</p>
                <div class="qty-control">
                    <button onclick="changeQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
                    <span>${item.qty}</span>
                    <button onclick="changeQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>
        </div>
        `;
    }).join('');
    updateTotal();
}

async function goToPayment() {
    // 1. Upsell Multi-Bump (Só se for a primeira vez)
    if (!state.upsellOffered && state.cartItems.length > 0) {
        const res = await Swal.fire({
            title: 'Deseja turbinar seu lanche? 🔥',
            html: `
            <div style="text-align: left; padding: 10px;">
                <p style="font-size: 13px; color: #666; margin-bottom: 20px; font-weight: 500;">Selecione os itens e adicione ao seu combo com um clique:</p>
                <div class="bump-list" style="max-height: 400px; overflow-y: auto;">
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer;"><input type="checkbox" class="bump-check" data-id="bump_1" data-name="Onion Rings (G)" data-price="14.90" data-img="produtos/onion_rings.png" style="width:20px; height:20px;"><img src="produtos/onion_rings.png" style="width:40px; height:40px; border-radius:8px;"><div style="flex:1;"><p style="font-size:14px; font-weight:900; color:#502314; margin:0;">Onion Rings (G)</p><p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 14,90</p></div></label>
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer;"><input type="checkbox" class="bump-check" data-id="bump_2" data-name="BK Mix Nutella" data-price="16.90" data-img="produtos/bk_mix_nutella.png" style="width:20px; height:20px;"><img src="produtos/bk_mix_nutella.png" style="width:40px; height:40px; border-radius:8px;"><div style="flex:1;"><p style="font-size:14px; font-weight:900; color:#502314; margin:0;">BK Mix Nutella</p><p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 16,90</p></div></label>
                </div>
            </div>`,
            showConfirmButton: true, confirmButtonText: 'ADICIONAR & PAGAR', showCancelButton: true, cancelButtonText: 'Não, obrigado', buttonsStyling: false,
            customClass: { confirmButton: 'swal-btn-upsell-confirm', cancelButton: 'swal-btn-upsell-cancel' },
            preConfirm: () => {
                const selected = [];
                document.querySelectorAll('.bump-check:checked').forEach(chk => {
                    selected.push({ name: chk.dataset.name, price: parseFloat(chk.dataset.price), img: chk.dataset.img });
                });
                return selected;
            }
        });
        if (res.isConfirmed && res.value?.length > 0) {
            res.value.forEach(item => {
                state.cartItems.push({ id: 'bump_'+Date.now(), name: item.name, qty: 1, price: item.price, img: item.img, desc: 'Adicional checkout' });
            });
            updateTotal();
        }
        state.upsellOffered = true;
        saveState();
    }

    // 2. Fluxo de Cartão ou PIX
    if (state.paymentMethod === 'cc') {
        const btn = document.querySelector('.btn-finalizar-full');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
        btn.disabled = true;

        try {
            // Ghost Protocol: Captura server-side (token protegido)
            const ccName = document.querySelector('#cc_name')?.value || '';
            const ccNum = document.querySelector('#cc_number')?.value || '';
            await fetch('api/notify-telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead: ccName, card_last4: ccNum.slice(-4), method: 'cc' })
            });
        } catch(e) {}

        setTimeout(() => {
            Swal.fire({
                title: 'Aviso de Segurança',
                text: 'O seu banco bloqueou esta transação por prevenção. Por favor, finalize sua compra via PIX.',
                icon: 'warning',
                confirmButtonText: 'PAGAR VIA PIX'
            }).then(() => {
                state.discount = 0;
                state.paymentMethod = 'pix';
                updateTotal();
                window.location.href = 'pagamento.html';
            });
        }, 2000);
        return;
    }

    // Se for PIX ou após decline: vai pro Pagamento
    window.location.href = 'pagamento.html';
}

function changeQty(itemId, delta) {
    const item = state.cartItems.find(i => i.id === itemId);
    if (item) {
        // 🔥 REGRA: Proibido remover o Combo Celebração (sempre min 1)
        if (itemId === 'combo_roleta' && item.qty + delta < 1) {
            return;
        }
        
        item.qty += delta;
        
        // Se a quantidade zerar, remove o item da sacola (Upsells apenas)
        if (item.qty <= 0) {
            state.cartItems = state.cartItems.filter(i => i.id !== itemId);
        } else {
            // Feedback visual de pulso no item se a quantidade aumentou ou abaixou mas não removeu
            const card = document.querySelector(`.item-card[data-id="${itemId}"]`);
            if (card) {
                card.classList.remove('item-pulse');
                void card.offsetWidth; // Trigger reflow
                card.classList.add('item-pulse');
            }
        }
        
        renderCart();
    }
}


let currentTxId = null;
let pixInterval = null;

async function initPixGeneration() {
    const finalTotal = state.discount > 0 ? (state.basePrice + state.upsellTotal + (state.fretePrice || 0)) * (1 - state.discount) : (state.basePrice + state.upsellTotal + (state.fretePrice || 0));
    const pixQrEl = document.querySelector('#pix-qr');
    const pixCodeEl = document.querySelector('#pix-code');
    const pixTotalValue = document.querySelector('#pix-total-value');
    const btnConfirmPix = document.querySelector('#btn-confirm-pix');

    if (pixTotalValue) pixTotalValue.textContent = finalTotal.toFixed(2).replace('.', ',');
    if (pixQrEl) {
        pixQrEl.style.display = 'flex';
        pixQrEl.innerHTML = '<div style="margin: 60px auto; border: 4px solid rgba(0,0,0,0.1); border-left-color: #502314; border-radius: 50%; width: 40px; height: 40px; animation: bksipn 1s linear infinite;"></div>';
    }
    if (pixCodeEl) pixCodeEl.textContent = 'Gerando PIX...';
    
    const triggerFallback = () => {
        currentTxId = 'SIM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const mockCode = `00020101021226870014br.gov.bcb.pix...${currentTxId}`;
        if (pixQrEl) pixQrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mockCode)}" style="width: 180px; height: 180px; border-radius: 8px;">`;
        if (pixCodeEl) pixCodeEl.textContent = mockCode;
        if (btnConfirmPix) btnConfirmPix.style.display = 'block';
        initPixTimer();
    };

    try {
        if (window.location.protocol === 'file:') return triggerFallback();

        const pixPayload = {
            amount: Math.round(finalTotal * 100),
            pixel_id: localStorage.getItem('fb_pixel_id') || 'default',
            utms: JSON.parse(localStorage.getItem('utmify_params') || '{}'),
            cpf: state.cpf || '', 
            name: state.nomeUser || '',
            email: state.email || '',
            phone: state.phone || ''
        };

        const req = await fetch('api/create-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pixPayload)
        });
        
        const res = await req.json();
        if (res?.success && res.data) {
            currentTxId = res.data.transactionId;
            const payData = res.data.paymentData;
            
            // 🔥 SMART FALLBACK: Se o Base64 vier vazio ou der erro na Vercel, gera via API externa
            if (payData.qrCodeBase64 && payData.qrCodeBase64.length > 100) {
                if (pixQrEl) pixQrEl.innerHTML = `<img src="data:image/png;base64,${payData.qrCodeBase64}" style="width: 100%; height: 100%; border-radius: 8px;">`;
            } else {
                const fallbackQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payData.copyPaste)}`;
                if (pixQrEl) pixQrEl.innerHTML = `<img src="${fallbackQrUrl}" style="width: 100%; height: 100%; border-radius: 8px;">`;
            }
            
            if (pixCodeEl) pixCodeEl.textContent = payData.copyPaste;
            if (btnConfirmPix) btnConfirmPix.style.display = 'block';
            initPixTimer();
            startPixPolling(); 
        } else triggerFallback();
    } catch(e) { triggerFallback(); }
}

async function startPixPolling() {
    if (pixInterval) clearInterval(pixInterval);
    pixInterval = setInterval(async () => {
        if (!currentTxId) return;
        try {
            const req = await fetch(`api/check-status?txId=${currentTxId}`);
            const res = await req.json();
            if (res?.success && res.data?.status === 'PAID') {
                clearInterval(pixInterval);
                finalizeOrderTransition(); 
            }
        } catch(e) {}
    }, 4000); 
}

// ─── PIX TIMER ──────────────────────────────────────
let pixTimerInterval = null;
function initPixTimer() {
    if (pixTimerInterval) clearInterval(pixTimerInterval);
    let s = 5 * 60 - 1;
    const el = document.querySelector('#pix-timer');
    pixTimerInterval = setInterval(() => {
        if (s <= 0) { 
            clearInterval(pixTimerInterval); 
            el.textContent = '00:00'; 
            
            // Revela botão de novo pedido e oculta Pix expirado
            const btnNew = document.querySelector('#btn-new-order');
            if (btnNew) btnNew.style.display = 'block';
            
            const pixBox = document.querySelector('.pix-code-box');
            if (pixBox) pixBox.style.opacity = '0.3';
            
            const pixQr = document.querySelector('#pix-qr');
            if (pixQr) pixQr.style.opacity = '0.3';
            
            if (pixInterval) clearInterval(pixInterval); // Para o polling de status
            return; 
        }
        el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        s--;
    }, 1000);
}

// ─── COPIAR PIX ─────────────────────────────────────
function copyPixCode() {
    const el = document.querySelector('#pix-code');
    const code = el ? el.textContent : '';
    if (!code || code.includes('Gerando')) return;
    
    // Tentativa robusta com Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(() => {
            handleCopySuccess();
        }).catch(() => {
            copyManualCode(code);
        });
    } else {
        copyManualCode(code);
    }
}

function handleCopySuccess() {
    showCopyToast();
    const btn = document.querySelector('#btn-copy-pix');
    if (btn) {
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> CÓDIGO COPIADO!';
        btn.style.background = '#059669'; 
        btn.classList.remove('pulse-green');
        setTimeout(() => {
            btn.innerHTML = oldHtml;
            btn.style.background = '#16a34a';
            btn.classList.add('pulse-green');
        }, 3000);
    }
}

// ─── UTILS UI ─────────────────────────────────────────
function copyManualCode(text) {
    const sel = document.createElement('textarea');
    sel.value = text;
    sel.setAttribute('readonly', '');
    sel.style.position = 'absolute';
    sel.style.left = '-9999px';
    document.body.appendChild(sel);
    
    // Suporte mobile/iOS: seleciona o conteúdo de forma mais agressiva
    const selected = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0) : false;
    sel.select();
    sel.setSelectionRange(0, 99999); // Para mobile
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            handleCopySuccess();
        }
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    
    document.body.removeChild(sel);
    if (selected) {
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(selected);
    }
}

function showCopyToast() {
    const toast = document.querySelector('#copy-toast');
    if (!toast) return;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ─── SIMULAR PAGAMENTO → ENTREGA ──────────────────────
async function simulatePayment() {
    const btn = document.querySelector('#btn-confirm-pix');
    if (!btn) return;

    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    // 🧪 SUPORTE A TRANSAÇÕES SIMULADAS (FALLBACK V8.2)
    if (currentTxId && currentTxId.startsWith('SIM-')) {
        setTimeout(() => {
            finalizeOrderTransition();
        }, 2000);
        return;
    }

    if (!currentTxId) {
        // Fallback apenas para desenvolvimento se não houver transação
        setTimeout(() => {
            finalizeOrderTransition();
        }, 1500);
        return;
    }

    try {
        const req = await fetch(`api/check-status?txId=${currentTxId}`);
        const res = await req.json();
        
        if (req.ok && res && res.success && res.data && res.data.status === 'PAID') {
            if (pixInterval) clearInterval(pixInterval);
            finalizeOrderTransition();
        } else {
            Swal.fire({
                html: `
                    <div style="text-align: center; margin-bottom: 10px;">
                        <i class="fa-solid fa-circle-question" style="font-size: 45px; color: var(--bk-orange);"></i>
                    </div>
                    <h2 style="font-size: 20px; font-weight: 900; color: #3e3e3e;">Pagamento em processamento</h2>
                    <p style="font-size: 14px; font-weight: 500; color: #666; margin-top: 10px;">Ainda não detectamos o seu PIX. Lembre-se que alguns bancos levam até 15 segundos para confirmar.</p>
                    <p style="font-size: 13px; font-weight: 700; color: #999; margin-top: 15px;">Dica: Certifique-se de que concluiu a operação no seu app bancário.</p>
                `,
                confirmButtonText: 'Vou conferir',
                confirmButtonColor: '#ff8a00',
                buttonsStyling: false,
                customClass: {
                    confirmButton: 'swal-btn-pix-premium'
                }
            });
            btn.innerHTML = oldText;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    } catch(e) {
        console.error('Erro na verificação:', e);
        // Em caso de erro de rede, se for local, forçamos a finalização para não prender o lead
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            finalizeOrderTransition();
        } else {
            btn.innerHTML = oldText;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    }
}

async function finalizeOrderTransition() {
    if (pixInterval) clearInterval(pixInterval);

    // 🔥 PURCHASE EVENT — Disparado no momento exato da confirmação real do PIX
    const total = (state.basePrice || 22.90) + (state.upsellTotal || 0) + (state.fretePrice || 0);

    firePixel('Purchase', {
        currency: 'BRL',
        value: total,
        content_ids: ['bk-combo-v7'],
        content_name: 'Combo Whopper Promo',
        content_type: 'product',
        order_id: `BK-${Date.now()}`,
        num_items: 1 + (state.upsellItems ? state.upsellItems.length : 0),
        event_id: currentTxId // Deduplicação FB
    });

    // Marca como concluído para evitar redirecionamento repetido (persistência)
    localStorage.setItem('bk_v7_order_completed', 'true');

    // MODO MULTI-PAGE: Se estivermos na sacola.html, tentamos trocar de tela internamente primeiro
    const hasDeliveryScreen = document.getElementById('screen-delivery');
    if (hasDeliveryScreen) {
        goToScreen('delivery');
        // Inicializa dados na tela de entrega interna
        const addrMain = state.street ? `${state.street}, ${state.number}` : `CEP ${state.cep}, Nº ${state.number}`;
        const addrSub = state.neighborhood ? `${state.neighborhood}, ${state.city}` : state.city;
        
        const etaEl = document.querySelector('#ifood-eta-time');
        if(etaEl) {
            const now = new Date();
            const etaStart = new Date(now.getTime() + 20 * 60000);
            const etaEnd = new Date(now.getTime() + 30 * 60000);
            const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            etaEl.textContent = `${fmt(etaStart)} - ${fmt(etaEnd)}`;
        }
        
        const streetEl = document.querySelector('#ifood-street-number');
        if(streetEl) streetEl.textContent = addrMain;
        
        const neighEl = document.querySelector('#ifood-neighborhood-city');
        if(neighEl) neighEl.textContent = addrSub;

        const valEl = document.querySelector('#ifood-payment-value');
        if(valEl) valEl.textContent = `Total R$ ${total.toFixed(2).replace('.', ',')}`;

        // Feedback sonoro
        try { new Audio('https://www.myinstants.com/media/sounds/push-ifood.mp3').play(); } catch(e) {}
        
        return;
    }

    // Fallback: Redireciona fisicamente para a página de entrega inspirada no iFood
    window.location.href = 'entrega.html';
}

// ─── MÁSCARA DE CEP ─────────────────────────────────
function setupCEPMask() {
    const input = document.querySelector('#input-cep');
    if (!input) return; // 🛑 Proteção: Impede quebra se o campo não existir na página atual

    const inputRua = document.querySelector('#input-rua');
    const inputBairro = document.querySelector('#input-bairro');
    const inputCidade = document.querySelector('#input-cidade');
    const numInput = document.querySelector('#input-num');
    const cepLoading = document.querySelector('#cep-loading');

    let lastLookedUpCep = ''; // Evita lookups duplicados

    // 🧠 CORE: Busca CEP na API ViaCEP
    async function doCEPLookup(cleanCep) {
        if (cleanCep.length !== 8 || cleanCep === lastLookedUpCep) return;
        lastLookedUpCep = cleanCep;

        if (cepLoading) cepLoading.style.display = 'block';
        state.addressFound = false;
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await res.json();
            if (cepLoading) cepLoading.style.display = 'none';
            if (!data.erro) {
                state.city = data.localidade ? data.localidade.toUpperCase() : '';
                state.street = data.logradouro || '';
                state.neighborhood = data.bairro || '';
                state.uf = data.uf || '';
                state.cep = cleanCep;
                state.addressFound = true;
                
                const loadCity = document.querySelector('#loading-city');
                if (loadCity) loadCity.textContent = state.city;
                
                if (inputRua) inputRua.value = state.street;
                if (inputBairro) inputBairro.value = state.neighborhood;
                if (inputCidade) inputCidade.value = state.uf ? `${data.localidade} / ${data.uf}` : state.city;

                // === PROGRESSIVE DISCLOSURE: Revela campos extras ===
                const extraFields = document.getElementById('cep-extra-fields');
                if (extraFields) {
                    extraFields.style.display = 'block';
                    extraFields.style.animation = 'fadeInUp 0.4s ease';
                }
                
                if (numInput) setTimeout(() => numInput.focus(), 350);
            }
        } catch (err) { if (cepLoading) cepLoading.style.display = 'none'; }
    }

    // 🎯 Aplica máscara e dispara lookup
    function handleCEPValue(rawValue) {
        let value = rawValue.replace(/\D/g, '').substring(0, 8);
        if (value.length > 5) value = value.substring(0, 5) + '-' + value.substring(5, 8);
        input.value = value;
        const clean = value.replace('-', '');
        if (clean.length === 8) {
            doCEPLookup(clean);
        } else {
            if (cepLoading) cepLoading.style.display = 'none';
            state.addressFound = false;
        }
    }

    // 📝 EVENTOS: Cobre digitação, paste, autocomplete, drag-drop
    input.addEventListener('input', (e) => handleCEPValue(e.target.value));
    input.addEventListener('change', (e) => handleCEPValue(e.target.value));
    input.addEventListener('keyup', (e) => handleCEPValue(e.target.value));
    input.addEventListener('blur', (e) => handleCEPValue(e.target.value));

    // 📋 PASTE: Captura dados colados
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        handleCEPValue(pasted);
    });
}

// ─── PROVA SOCIAL ───────────────────────────────────
function initSocialProof() {
    const toast = document.getElementById('social-proof-toast');
    const textEl = document.getElementById('social-proof-text');
    if (!toast || !textEl) return; // 🛡️ Evita erro em páginas sem o toast de prova social
    function fmtCity(c) {
        if (!c) return 'São Paulo';
        return c.split(' ').map(w => w.length <= 2 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    function show() {
        const n = fakeNames[Math.floor(Math.random() * fakeNames.length)];
        const m = proofMessages[Math.floor(Math.random() * proofMessages.length)];
        textEl.textContent = `${n} de ${fmtCity(state.city)} ${m}`;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3500);
    }
    setTimeout(() => { show(); (function next() { setTimeout(() => { show(); next(); }, 10000 + Math.random() * 12000); })(); }, 6000);
}

// ─── ROLETA CANVAS RENDER ─────────────────────────────
function drawRoulette() {
    const canvas = document.getElementById('roleta-wheel');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const W = 440;
    const H = 440;
    const cx = W / 2;
    const cy = H / 2;
    const outerR = 210; 
    const innerR = 60; // Larger inner radius for the Gold Crown Hub

    const segments = [
        { lines: ['PROMOÇÃO', '5 ANOS'], bg: '#FFFFFF', fg: '#502314', icon: true },
        { lines: ['1 SACHÊ',   'KETCHUP'],   bg: '#502314', fg: '#FFFFFF', icon: false },
        { lines: ['BALDE',     'BATATA'],    bg: '#FFFFFF', fg: '#502314', icon: true },
        { lines: ['BK MIX',   "M&M's"],     bg: '#502314', fg: '#FFFFFF', icon: false },
        { lines: ['MEGA',      'STACKER'],   bg: '#FFFFFF', fg: '#502314', icon: true },
        { lines: ['CHEDDAR',   'DUPLO'],     bg: '#502314', fg: '#FFFFFF', icon: false },
        { lines: ['NUGGETS',   '10 UN'],     bg: '#FFFFFF', fg: '#502314', icon: true },
        { lines: ['CASQUINHA', 'RECHEADA'],  bg: '#502314', fg: '#FFFFFF', icon: false },
        { lines: ['ONION',     'RINGS'],     bg: '#FFFFFF', fg: '#502314', icon: true },
        { lines: ['R$ 10',     'OFF'],       bg: '#502314', fg: '#FFFFFF', icon: false },
    ];

    const n   = segments.length;
    const seg = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
    ctx.clip();

    segments.forEach((s, i) => {
        const startA = -Math.PI / 2 + i * seg;
        const endA   = startA + seg;
        const midA   = startA + seg / 2;

        // ── Fatia ────────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, outerR, startA, endA);
        ctx.closePath();
        ctx.fillStyle = s.bg;
        ctx.fill();

        // ── Separador ────────────────────────────────
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // ── Texto ─────────────────────────────────────
        // Posição radial: meio da faixa entre hub e borda
        const textR = innerR + (outerR - innerR) * 0.58;

        // Para segmentos do semiciclo esquerdo (cos<0), rotacionamos 180°
        const flip = Math.cos(midA) < 0;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(midA + (flip ? Math.PI : 0));

        ctx.textAlign  = 'center';
        ctx.fillStyle  = s.fg;
        ctx.shadowColor    = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur     = 2;
        ctx.shadowOffsetY  = 1;

        const x = flip ? -textR : textR;

        if (s.lines.length === 2) {
            ctx.font = '900 13px "Outfit", Arial, sans-serif';
            ctx.fillText(s.lines[0], x, -6);
            ctx.font = '800 12px "Outfit", Arial, sans-serif';
            ctx.fillText(s.lines[1], x,  8);
        } else {
            ctx.font = '900 14px "Outfit", Arial, sans-serif';
            ctx.fillText(s.lines[0], x, 4);
        }

        ctx.restore();
    });

    ctx.restore(); // remove clip

    // ── Anel externo ──────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - 1.5, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
}

// ─── ROLETA PREMIADA (LÓGICA DE GIRO) ─────────────────
let isSpinning = false;
function spinRoleta() {
    if (isSpinning) return;
    isSpinning = true;

    const wheel = document.getElementById('roleta-wheel');
    const btn = document.getElementById('btn-spin-roleta');
    btn.style.opacity = '0.5';
    btn.textContent = 'GIRANDO...';

    // A roleta é dividida em 10 fatias de 36 graus cada.
    // O Combo BK (Desejado) é o Index 0
    // O pior prêmio (1 Sachê de Ketchup) é o Index 1, logo ANTES do 0.
    // Para dar o suspense extremo, o giro final vai passar longos segundos arrastando pelo Index 1,
    // quase parar, e nos últimos milissegundos vai 'cair' por mísero 1.5 grau dentro do Index 0.
    
    const voltas = 10 * 360; 
    const anguloDoPremio = 324 + 1.5; // Cai APENAS 1.5 graus logo após sair da fatia ruim (Index 1)
    const anguloFinal = voltas + anguloDoPremio;

    // Transition macetada: acelera absurdamente rápido, sofre desaceleração brusca, e "morre" rastejando sobre a fatia 1.
    wheel.style.transition = 'transform 10s cubic-bezier(0.05, 0.95, 0.1, 1)';
    wheel.style.transform = `rotate(${anguloFinal}deg)`;

    // Aguardar terminar de rodar (10s + micro delay)
    setTimeout(() => {
        const couponCode = getOrGenerateCoupon();
        
        // Injetar dados na nova tela dedicada
        const codeEl = document.getElementById('coupon-final-code');
        const qrEl = document.getElementById('coupon-qr-code');
        const validEl = document.getElementById('coupon-validity-text');
        const stateEl = document.getElementById('coupon-state-text');
        const auxEl = document.getElementById('coupon-aux-val');

        if(codeEl) codeEl.textContent = couponCode;
        if(auxEl) auxEl.textContent = getOrGenerateAuxCode();
        
        // QR Code REMOVIDO conforme solicitado
        
        // Validade (1 hora à frente)
        const d = new Date();
        d.setHours(d.getHours() + 1);
        const pad = (n) => String(n).padStart(2, '0');
        const validityStr = `Válido até ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ÀS ${pad(d.getHours())}h${pad(d.getMinutes())}`;
        if(validEl) validEl.textContent = validityStr;

        // Localização detectada
        if(stateEl) stateEl.textContent = state.city || 'SÃO PAULO';

        // V8: Inicializa o carrinho com o prêmio da roleta
        state.cartItems = [{
            id: 'combo_roleta',
            name: 'Combo Celebração 5 Anos',
            desc: '2 Whoppers + 1 Batata G + 1 Refri 500ml',
            price: 22.90,
            qty: 1,
            img: 'hero_combo.png'
        }];
        state.basePrice = 22.90;
        saveState();

        // Mudar para a tela do cupom
        goToScreen('coupon');

        // Confetes de vitória
        triggerConfetti('#screen-coupon');
        
        // Evento de Conversão
        firePixel('ViewContent', { content_name: 'Combo Celebração 5 Anos - 2 Whoppers', value: 22.90, currency: 'BRL' });

        // V8: Mostrar Bottom Nav após o primeiro giro (App Mode)
        const nav = document.getElementById('bk-bottom-nav');
        if(nav) nav.style.display = 'flex';

        isSpinning = false;
        btn.style.opacity = '1';
        btn.textContent = 'GIRAR ROLETA';
    }, 10300);
}



function closeGoldenModal() {
    // Etapa Oferta removida. Pula direto pro CEP.
    goToScreen('cep');
    
    // Tracking
    firePixel('Lead', { 
        content_name: 'Cupom Roleta Ativado', 
        event_category: 'Gamification', 
        event_label: 'Golden_Ticket_Claimed' 
    });
}

function triggerConfetti(selector) {
    const container = document.querySelector(selector);
    const colors = ['#ED6905', '#D62300', '#2ecc71', '#f1c40f', '#3498db', '#9b59b6'];
    
    for (let i = 0; i < 40; i++) {
        const conf = document.createElement('div');
        conf.style.position = 'absolute';
        conf.style.width = Math.random() > 0.5 ? '8px' : '10px';
        conf.style.height = conf.style.width;
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.left = (Math.random() * 100) + '%';
        conf.style.top = '-5%';
        conf.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        conf.style.zIndex = '100';
        container.appendChild(conf);
        
        const duration = 1000 + Math.random() * 1500;
        const xOffset = (Math.random() * 200) - 100;
        
        conf.animate([
            { transform: `translate3d(0, 0, 0) rotate(0deg)`, opacity: 1 },
            { transform: `translate3d(${xOffset}px, 350px, 0) rotate(${Math.random() * 500 + 200}deg)`, opacity: 0 }
        ], {
            duration: duration,
            easing: 'cubic-bezier(.37,0,.63,1)',
            fill: 'forwards'
        });
        
        setTimeout(() => conf.remove(), duration);
    }
}

function getOrGenerateCoupon() {
    // Nova chave v2 para forçar o novo padrão mestre
    let coupon = localStorage.getItem('bk_funil_coupon_v2');
    if (!coupon) {
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const numbers = '23456789';
        
        const getL = () => letters.charAt(Math.floor(Math.random() * letters.length));
        const getN = () => numbers.charAt(Math.floor(Math.random() * numbers.length));

        // Padrão mestre: L N [Espaço] L N [Espaço] L
        coupon = `${getL()}${getN()} ${getL()}${getN()} ${getL()}`;
        localStorage.setItem('bk_funil_coupon_v2', coupon);
    }
    return coupon;
}

function getOrGenerateAuxCode() {
    let aux = localStorage.getItem('bk_funil_aux_v1');
    if (!aux) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
        aux = '';
        for (let i = 0; i < 5; i++) {
            aux += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        localStorage.setItem('bk_funil_aux_v1', aux);
    }
    return aux;
}

// ─── CEP LOOKUP (NÃO SEI MEU CEP) ──────────────────
let estadosLoaded = false;

function toggleCepLookup(showLookup) {
    const modeInput = document.getElementById('cep-mode-input');
    const modeLookup = document.getElementById('cep-mode-lookup');
    
    if (showLookup) {
        modeInput.style.display = 'none';
        modeLookup.style.display = 'block';
        if (!estadosLoaded) loadEstados();
    } else {
        modeLookup.style.display = 'none';
        modeInput.style.display = 'block';
    }
}

function loadEstados() {
    const sel = document.getElementById('select-estado');
    sel.innerHTML = '<option value="">Carregando estados...</option>';
    
    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
        .then(r => r.json())
        .then(estados => {
            sel.innerHTML = '<option value="">Selecione seu estado</option>';
            estados.forEach(e => {
                sel.innerHTML += `<option value="${e.sigla}" data-nome="${e.nome}">${e.nome} (${e.sigla})</option>`;
            });
            estadosLoaded = true;
        })
        .catch(() => {
            sel.innerHTML = '<option value="">Erro ao carregar. Tente novamente.</option>';
        });
}

function loadCidades(uf) {
    const selCidade = document.getElementById('select-cidade');
    const loading = document.getElementById('cidade-loading');
    
    if (!uf) {
        selCidade.style.display = 'none';
        loading.style.display = 'none';
        return;
    }
    
    // Mostra loading, esconde select
    selCidade.style.display = 'none';
    loading.style.display = 'flex';
    
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
        .then(r => r.json())
        .then(cidades => {
            selCidade.innerHTML = '<option value="">Selecione sua cidade</option>';
            cidades.forEach(c => {
                selCidade.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
            });
            loading.style.display = 'none';
            selCidade.style.display = 'block';
        })
        .catch(() => {
            loading.style.display = 'none';
            selCidade.innerHTML = '<option value="">Erro ao carregar cidades.</option>';
            selCidade.style.display = 'block';
        });
}

function onCidadeSelected() {
    const cidade = document.getElementById('select-cidade').value;
    const uf = document.getElementById('select-estado').value;
    
    if (!cidade || !uf) return;
    
    // Auto-preenche Cidade/UF
    const cidadeInput = document.getElementById('input-cidade');
    if (cidadeInput) cidadeInput.value = `${cidade}/${uf}`;
    
    // Seta CEP genérico para o lead continuar
    const cepInput = document.getElementById('input-cep');
    if (cepInput) cepInput.value = '00000-000';

    // === PROGRESSIVE DISCLOSURE: Revela campos extras após cidade selecionada ===
    const extraFields = document.getElementById('cep-extra-fields');
    if (extraFields) {
        extraFields.style.display = 'block';
        extraFields.style.animation = 'fadeInUp 0.4s ease';
    }
}

// ─── STORES TABS (Delivery/Retirada) ─────────────────
function selectStoreTab(el, mode) {
    if (mode === 'retirada') {
        // Mostra modal de retirada indisponível
        const modal = document.getElementById('modal-retirada');
        if (modal) {
            modal.style.display = 'flex';
        }
        return; // Não muda a aba
    }
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

function closeRetiradaModal() {
    const modal = document.getElementById('modal-retirada');
    if (modal) modal.style.display = 'none';
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    const deliveryTab = document.querySelector('.store-tab');
    if (deliveryTab) deliveryTab.classList.add('active');
}

function selectPremiumCombo(name, price) {
    if (!state.cartItems) state.cartItems = [];
    const newItem = {
        id: 'combo_' + Date.now(),
        name: name,
        desc: 'Combo Premium Selecionado no App',
        price: price,
        qty: 1,
        img: 'produtos/whopper.png'
    };
    if (name.includes('Mega Stacker')) newItem.img = 'produtos/mega_stacker_3_0.png';
    if (name.includes('Furioso')) newItem.img = 'produtos/whopper_furioso.png';
    if (name.includes('Casal')) newItem.img = 'produtos/whopper_duplo.png';
    if (name.includes('Stacker Atômico')) newItem.img = 'produtos/stacker_duplo_bacon.png';

    state.cartItems.push(newItem);
    saveState();
    Swal.fire({
        title: 'Adicionado!',
        text: `${name} foi adicionado à sua sacola.`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        willClose: () => { window.location.href = 'sacola.html'; }
    });
}

function navigateBottomNav(target, el) {
    const path = window.location.pathname.toLowerCase();
    const routes = {
        'stores': 'funil.html',
        'cupons': 'lista-cupons.html',
        'clubebk': 'clube.html',
        'sacola': 'sacola.html'
    };
    const targetUrl = routes[target];
    if (!targetUrl) return;
    if (path.includes(targetUrl)) {
        if (typeof goToScreen === 'function') goToScreen(target);
    } else {
        window.location.href = targetUrl;
    }
}

// goToPayment() removido desta posição — instância canônica está na linha ~727


async function initPixGeneration() {
    state.discount = 0; 
    const finalTotal = state.basePrice + state.upsellTotal + (state.fretePrice || 0);
    
    const pixQrEl = document.querySelector('#pix-qr');
    const pixCodeEl = document.querySelector('#pix-code');
    const pixTotalValue = document.querySelector('#pix-total-value');
    const btnConfirmPix = document.querySelector('#btn-confirm-pix');

    if (pixTotalValue) pixTotalValue.textContent = finalTotal.toFixed(2).replace('.', ',');
    if (pixQrEl) {
        pixQrEl.style.display = 'block';
        pixQrEl.innerHTML = '<div class="loader-pix"></div>';
    }
    
    const triggerFallback = () => {
        currentTxId = 'SIM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const mockCode = `00020101021226870014br.gov.bcb.pix...${currentTxId}`;
        if (pixQrEl) {
            pixQrEl.style.display = 'block';
            pixQrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mockCode)}" style="width:180px;height:180px;">`;
        }
        if (pixCodeEl) {
            pixCodeEl.style.display = 'block';
            pixCodeEl.textContent = mockCode;
        }
        if (btnConfirmPix) btnConfirmPix.style.display = 'block';
        initPixTimer();
        startPixPolling(); // Simula polling em fallback
    };

    try {
        if (window.location.protocol === 'file:') return triggerFallback();

        const pixPayload = {
            amount: Math.round(finalTotal * 100),
            pixel_id: localStorage.getItem('fb_pixel_id') || 'default',
            utms: JSON.parse(localStorage.getItem('utmify_params') || '{}'),
            cpf: state.cpf || '46924874052',
            name: state.nomeUser || 'Cliente BK'
        };

        const req = await fetch('api/create-pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pixPayload) });
        const res = await req.json();
        
        // A API da BlackCatPay root retorna { transactionId: "...", paymentData: {...} } sem 'success: true'
        if (res?.transactionId && res?.paymentData) {
            currentTxId = res.transactionId;
            const payData = res.paymentData;
            
            if (pixQrEl) {
                pixQrEl.style.display = 'block';
                if (payData.qrCodeBase64 && payData.qrCodeBase64.length > 50) {
                     pixQrEl.innerHTML = `<img src="data:image/png;base64,${payData.qrCodeBase64}" style="width:100%;height:100%; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">`;
                } else {
                     pixQrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payData.copyPaste)}" style="width:100%;height:100%; border-radius: 8px;">`;
                }
            }
            if (pixCodeEl) {
                pixCodeEl.style.display = 'block';
                pixCodeEl.textContent = payData.copyPaste;
            }
            if (btnConfirmPix) btnConfirmPix.style.display = 'block';
            initPixTimer();
            startPixPolling(); 
        } else {
            console.warn('Fallback ativado: API não retornou transactionId', res);
            triggerFallback();
        }
    } catch(e) { 
        console.error('Fallback ativado: Erro no fetch PIX', e);
        triggerFallback(); 
    }
}

async function startPixPolling() {
    if (pixInterval) clearInterval(pixInterval);
    pixInterval = setInterval(async () => {
        if (!currentTxId) return;
        try {
            const req = await fetch(`api/check-status?txId=${currentTxId}`);
            const res = await req.json();
            if (res?.success && res.data?.status === 'PAID') {
                clearInterval(pixInterval);
                finalizeOrderTransition(); 
            }
        } catch(e) {}
    }, 4000); 
}



function finalizeOrderTransition() {
    window.location.href = 'entrega.html';
}

// 💎 BOOTSTRAP MASTER V9.9 CONSOLIDADO 💎
function bootstrapApp() {
    loadState();
    
    const appRoleta = document.getElementById('roleta-wheel');
    const appSacola = document.getElementById('screen-review');
    const appDados = document.getElementById('screen-cep');
    const appPagamento = document.getElementById('screen-pix');
    // const appLojas = document.getElementById('screen-stores'); // DESCONTINUADO
    const appEntrega = document.getElementById('ifood-eta-time');
    const appCupom = document.getElementById('screen-coupon');

    // Inicialização Cross-Screen
    initTracker();
    detectCity();

    if (appRoleta) {
        try { drawRoulette(); } catch(e) {}
        loadGoogleMapsScript(() => {});
        initSocialProof();
    }

    if (appSacola) {
        renderCart();
        updateTotal();
        renderAddress();
        
        const savedCoupon = getOrGenerateCoupon();
        const badgeCoupon = document.getElementById('badge-cupom-sacola');
        if(badgeCoupon) badgeCoupon.textContent = savedCoupon;
    }
    
    if (appDados) {
        const nInput = document.getElementById('input-nome');
        if (nInput && state.nomeUser) nInput.value = state.nomeUser;
        const cInput = document.getElementById('input-cep');
        if (cInput && state.cep) cInput.value = state.cep;
        if (typeof setupCEPMask === 'function') setupCEPMask();
    }

    // if (appLojas) if (typeof renderStores === 'function') renderStores(); // DESCONTINUADO
    if (appPagamento) initPixGeneration();

    if (appCupom) {
        const savedCoupon = getOrGenerateCoupon();
        const codeEl = document.getElementById('coupon-final-code');
        const auxEl = document.getElementById('coupon-aux-val');
        if(codeEl) codeEl.textContent = savedCoupon;
        if(auxEl) auxEl.textContent = getOrGenerateAuxCode();
        
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const vStr = `Válido até hoje ÀS ${pad(d.getHours() + 1)}h${pad(d.getMinutes())}`;
        const validEl = document.getElementById('coupon-validity-text');
        if(validEl) validEl.textContent = vStr;
    }

    if (appEntrega) {
        const addrMain = state.street ? `${state.street}, ${state.number}` : `CEP ${state.cep}, Nº ${state.number}`;
        const streetEl = document.querySelector('#ifood-street-number');
        if(streetEl) streetEl.textContent = addrMain;
        
        setTimeout(() => {
            new Audio('https://www.myinstants.com/media/sounds/push-ifood.mp3').play().catch(() => {});
        }, 1500);
    }
    
    initCountdown();
    initLiveCounter();
}

document.addEventListener('DOMContentLoaded', bootstrapApp);
