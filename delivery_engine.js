document.addEventListener('DOMContentLoaded', async () => {
    // 1. HYDRATE STATE & DOM
    if (typeof loadState === 'function') loadState();
    
    const streetEl = document.getElementById('ifood-street-number');
    const neighEl = document.getElementById('ifood-neighborhood-city');
    const merchantEl = document.getElementById('ifood-merchant-name');
    const orderEl = document.getElementById('ifood-order-info');
    const payEl = document.getElementById('ifood-payment-value');
    const etaEl = document.getElementById('ifood-eta-time');
    const titleEl = document.getElementById('ifood-status-title');
    const badgeEl = document.getElementById('status-badge');
    const pushEl = document.getElementById('fake-push');
    const audEl = document.getElementById('push-sound');

    const city = state?.city || 'São Paulo';
    const street = state?.street || '';
    const num = state?.number || '';
    const neigh = state?.neighborhood || '';
    const cep = state?.cep || '';
    
    if (streetEl) streetEl.textContent = street ? `${street}, ${num}` : (cep ? `CEP ${cep}, Nº ${num}` : 'Endereço em processamento...');
    if (neighEl) neighEl.textContent = neigh ? `${neigh}, ${city}` : city;
    if (merchantEl) merchantEl.textContent = `BK - ${state?.selectedStore || 'Fast Delivery'}`;
    
    const itemCount = (state?.cartItems?.reduce((a, i) => a + i.qty, 0) || 3) + (state?.upsellItems?.length || 0);
    if (orderEl) orderEl.textContent = `Pedido Nº ${Math.floor(1000 + Math.random() * 9000)} • ${itemCount} itens`;
    
    if (payEl) {
        const total = (state?.basePrice || 22.90) + (state?.upsellTotal || 0) + (state?.fretePrice || 0);
        payEl.textContent = `Total R$ ${total.toFixed(2).replace('.', ',')}`;
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function updateETA(mins) {
        if (etaEl) {
            const now = new Date();
            const e1 = new Date(now.getTime() + mins * 60000);
            const e2 = new Date(now.getTime() + (mins + 5) * 60000);
            const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            etaEl.innerHTML = `${fmt(e1)} - ${fmt(e2)}`;
        }
    }
    
    function setPush(msg) {
        if (pushEl) {
            pushEl.querySelector('.push-msg').textContent = msg;
            pushEl.classList.add('visible');
            if (audEl) audEl.play().catch(()=>{});
            setTimeout(() => pushEl.classList.remove('visible'), 5000);
        }
    }

    // 2. INIT LEAFLET ENGINE (Concealed until geocoded)
    const mapRoot = document.getElementById('map-root');
    if (mapRoot) {
        mapRoot.style.opacity = '0';
        mapRoot.style.transition = 'opacity 0.8s ease-in-out';
    }

    const map = L.map('map-root', { zoomControl: false, attributionControl: false }).setView([-23.5505, -46.6333], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

    // 3. GEOCODE ADDRESS
    let destLat = -23.5505, destLng = -46.6333;
    try {
        const query = encodeURIComponent(`${street} ${num} ${city} Brazil`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`).then(r => r.json());
        if (res && res.length > 0) {
            destLat = parseFloat(res[0].lat);
            destLng = parseFloat(res[0].lon);
        } else {
             const cityRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city + ' Brazil')}&limit=1`).then(r => r.json());
             if (cityRes && cityRes.length > 0) {
                 destLat = parseFloat(cityRes[0].lat);
                 destLng = parseFloat(cityRes[0].lon);
             }
        }
    } catch(e) { console.error("Geocoding failed", e); }

    // Pin Home Address
    const homeIcon = L.divIcon({ html: '<i class="fa-solid fa-house" style="color:#ea1d2c; font-size:24px; text-shadow: 0 0 5px white;"></i>', className: '', iconSize: [24,24], iconAnchor: [12, 24] });
    L.marker([destLat, destLng], {icon: homeIcon}).addTo(map);

    // 4. GENERATE FAKE NODES (Tight radius to prevent ocean-spawning in coastal cities)
    // 1 lat ~= 111km -> 0.006 ~= 600m. Random direction.
    const angleBK = Math.random() * Math.PI * 2;
    const bkLat = destLat + (Math.sin(angleBK) * 0.006);
    const bkLng = destLng + (Math.cos(angleBK) * 0.006);

    const angleDriver = Math.random() * Math.PI * 2;
    const driverLat = bkLat + (Math.sin(angleDriver) * 0.004);
    const driverLng = bkLng + (Math.cos(angleDriver) * 0.004);

    const bkIcon = L.divIcon({ html: '<i class="fa-solid fa-store" style="color:#502314; font-size:28px; text-shadow: 0 0 5px white;"></i>', className: '', iconSize: [28,28], iconAnchor: [14, 28] });
    L.marker([bkLat, bkLng], {icon: bkIcon}).addTo(map);

    // 5. OSRM ROUTING FETCH
    async function getRoute(startLat, startLng, endLat, endLng) {
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
            const req = await fetch(url).then(r => r.json());
            if (req.code === 'Ok') return req.routes[0];
        } catch(e) { console.error('OSRM fail', e); }
        // Fallback straight line
        return { duration: 300, distance: 3000, geometry: { coordinates: [[startLng, startLat], [endLng, endLat]] } };
    }

    const routeDriverToBK = await getRoute(driverLat, driverLng, bkLat, bkLng);
    const routeBKToHome = await getRoute(bkLat, bkLng, destLat, destLng);

    // Render Routes
    const routeCoordsBK_Home = routeBKToHome.geometry.coordinates.map(c => [c[1], c[0]]);
    const polyBKHome = L.polyline(routeCoordsBK_Home, {color: '#ea1d2c', weight: 4, dashArray: '5, 10'}).addTo(map);
    
    const routeCoordsDriver_BK = routeDriverToBK.geometry.coordinates.map(c => [c[1], c[0]]);
    const polyDriverBK = L.polyline(routeCoordsDriver_BK, {color: '#888', weight: 3, dashArray: '4, 8'}).addTo(map);

    // Fit camera with dynamic padding
    map.fitBounds(L.latLngBounds([[driverLat, driverLng], [bkLat, bkLng], [destLat, destLng]]), {padding: [70, 70]});

    // Reveal map smoothly
    setTimeout(() => {
        if (mapRoot) mapRoot.style.opacity = '1';
    }, 400);

    // 6. ANIMATION CORE (Dynamic Motorcycle Icon)
    const driverHtml = `
        <div style="position:relative; transform: translate(-50%, -100%); width: 40px; height: 40px; display:flex; justify-content:center; align-items:center;">
           <i class="fa-solid fa-motorcycle" style="font-size: 26px; color: #ea1d2c; filter: drop-shadow(0px 3px 2px rgba(0,0,0,0.4));"></i>
        </div>
    `;
    const driverIcon = L.divIcon({ html: driverHtml, className: '', iconSize: [0,0], iconAnchor: [0,0] });
    const driverMarker = L.marker([driverLat, driverLng], {icon: driverIcon, zIndexOffset: 1000}).addTo(map);

    function animateMarker(geoJson, durationMs, onTick) {
        return new Promise(resolve => {
            const coords = geoJson.coordinates;
            const startStrd = performance.now();
            let isCancelled = false;

            function step(time) {
                if (isCancelled) return resolve({cancelled: true});

                let progress = Math.min((time - startStrd) / durationMs, 1);
                const totalSegments = coords.length - 1;
                const exactSegment = progress * totalSegments;
                const index = Math.floor(exactSegment);
                
                if (index < totalSegments) {
                    const remainder = exactSegment - index;
                    const c1 = coords[index], c2 = coords[index + 1];
                    driverMarker.setLatLng([c1[1] + (c2[1] - c1[1]) * remainder, c1[0] + (c2[0] - c1[0]) * remainder]);
                } else {
                    driverMarker.setLatLng([coords[totalSegments][1], coords[totalSegments][0]]);
                }
                
                if (onTick) {
                    if (onTick(progress) === 'STOP') {
                        isCancelled = true;
                        return resolve({cancelled: true});
                    }
                }

                if (progress < 1) requestAnimationFrame(step);
                else resolve({cancelled: false});
            }
            requestAnimationFrame(step);
        });
    }

    // --- EXECUTE THE SIMULATION STATE MACHINE ---

    // Chat mock helper
    const btnChat = document.getElementById('btn-chat-motoboy');
    if (btnChat) {
        btnChat.onclick = () => {
            Swal.fire({ title: 'Chat iFood', text: 'O entregador está focado no trânsito e não pode responder pelo app.', icon: 'info', confirmButtonText: 'Entendido', confirmButtonColor: '#ea1d2c' });
        };
    }

    // STATE 1: Going to Restaurant
    document.getElementById('ifp-1')?.classList.add('filled');
    badgeEl.textContent = 'Indo ao restaurante';
    titleEl.textContent = 'O motorista está a caminho do BK';
    updateETA(15);
    
    // Simulate ~15 seconds to reach restaurant (accelerated for flow)
    await animateMarker(routeDriverToBK.geometry, 15000);

    // STATE 2: Waiting at BK
    document.getElementById('ifp-2')?.classList.add('filled');
    badgeEl.textContent = 'Em preparo';
    titleEl.textContent = 'O motoboy está aguardando o pedido';
    setPush('O entregador chegou no BK e aguarda o lanche.');
    
    // Hide driver's path after arriving
    map.removeLayer(polyDriverBK);

    // STRICT REQUIREMENT: Random wait between 3 and 5 real-world minutes
    const waitTimeMs = Math.floor(Math.random() * (300000 - 180000 + 1) + 180000);
    // Fake ETA drop
    updateETA(12);
    const tickInt = setInterval(() => { updateETA(9); }, waitTimeMs / 2);
    
    // Yield execution for the exact wait time
    await sleep(waitTimeMs);
    clearInterval(tickInt);

    // STATE 3: Out for Delivery
    document.getElementById('ifp-3')?.classList.add('filled');
    badgeEl.textContent = 'Em rota';
    titleEl.textContent = 'Pedido saiu para entrega!';
    setPush('O entregador acabou de sair com seu BK!');
    
    // Simulate ~60 real seconds for the delivery drive segment
    const deliveryDriveTime = 60000; 

    await animateMarker(routeBKToHome.geometry, deliveryDriveTime, (progress) => {
        // ETA counts down from 8 mins. 
        const predictedETA = Math.ceil(8 * (1 - progress));
        updateETA(predictedETA);
        
        // 🚨 TRIGGER: The 3 Minute Mark 🚨
        if (predictedETA <= 3) {
            return 'STOP';
        }
    });

    // STATE 4: The Strike (Order Abandonment)
    if (btnChat) btnChat.style.display = 'none';

    Swal.fire({
        title: '<strong style="color:#ea1d2c; font-family: Lilita One, sans-serif; font-size: 28px; line-height: 1;">Aconteceu um imprevisto!</strong>',
        html: '<p style="font-size: 15px; font-weight: 500; color: #3e3e3e; text-align: left;"><b style="color:#000;">⚠️ O ENTREGADOR CANCELOU O PEDIDO.</b><br><br>O reembolso total do seu PIX foi acionado com sucesso e será creditado em sua conta em <b>até 2 horas</b> através do nosso banco emissor.<br><br>Gostaríamos muito de pedir desculpas pelo ocorrido, e você pode <u>realizar a compra novamente</u> agora para acionar rapidamente um novo motorista disponível.</p>',
        icon: 'error',
        confirmButtonText: 'COMPRAR NOVAMENTE',
        confirmButtonColor: '#ea1d2c',
        allowOutsideClick: false,
        allowEscapeKey: false,
        background: '#fff',
        color: '#3e3e3e',
        customClass: {
            confirmButton: 'swal2-confirm-shadow pulse-green'
        }
    }).then(() => {
        // Clear caches potentially stopping another funnel round
        localStorage.removeItem('bk_v7_order_completed');
        window.location.href = 'index.html';
    });
});
