// ─── VERCEL SERVERLESS: FACEBOOK CAPI RELAY ───
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const FB_ACCESS_TOKEN  = process.env.FB_ACCESS_TOKEN;
    const FB_PIXEL_ID      = process.env.ID_PIXEL_FB || process.env.FB_PIXEL_ID;
    const FB_TEST_CODE     = process.env.FB_TEST_CODE || '';
    const EXTERNAL_WEBHOOK = process.env.URL_WEBHOOK_EXTERNA || process.env.EXTERNAL_WEBHOOK_URL || '';

    const { event_name, event_id, pixel_id, custom_data, user } = req.body;

    const pixelId = pixel_id || FB_PIXEL_ID;
    if (!pixelId || !FB_ACCESS_TOKEN) {
        return res.status(500).json({ error: 'Pixel ID ou Access Token ausente nas variáveis de ambiente.' });
    }

    const sha256 = async (str) => {
        if (!str) return undefined;
        const encoder = new TextEncoder();
        const data = encoder.encode(str.trim().toLowerCase());
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const userData = {
        client_ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        client_user_agent: req.headers['user-agent'] || '',
        fbc:  req.cookies?._fbc  || undefined,
        fbp:  req.cookies?._fbp  || undefined,
    };

    if (user?.email) userData.em = await sha256(user.email);
    if (user?.phone) userData.ph = await sha256(user.phone.replace(/\D/g, ''));
    if (user?.external_id) userData.external_id = await sha256(user.external_id);

    const payload = {
        data: [{
            event_name,
            event_id: event_id || undefined,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: req.headers.referer || '',
            user_data: userData,
            custom_data: custom_data || {}
        }]
    };
    if (FB_TEST_CODE) payload.test_event_code = FB_TEST_CODE;

    const fbUrl = `https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${FB_ACCESS_TOKEN}`;

    try {
        const fbRes = await fetch(fbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const fbData = await fbRes.json();

        // Repasse para o Webhook externo (N8N etc.)
        if (EXTERNAL_WEBHOOK) {
            fetch(EXTERNAL_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'BK_FUNIL_V7',
                    event: event_name,
                    client_data: req.body,
                    server_side_data: { ip: userData.client_ip_address, ua: userData.client_user_agent }
                })
            }).catch(() => {}); // Fire-and-forget
        }

        return res.status(fbRes.status).json(fbData);
    } catch (error) {
        console.error('[fb-capi] Erro:', error);
        return res.status(500).json({ error: error.message });
    }
}
