// ─── VERCEL SERVERLESS: WEBHOOK BLACKCATPAY → FACEBOOK CAPI ───
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const FB_ACCESS_TOKEN  = process.env.FB_ACCESS_TOKEN;
    const FB_PIXEL_ID      = process.env.ID_PIXEL_FB || process.env.FB_PIXEL_ID;
    const FB_TEST_CODE     = process.env.FB_TEST_CODE || '';
    const EXTERNAL_WEBHOOK = process.env.URL_WEBHOOK_EXTERNA || process.env.EXTERNAL_WEBHOOK_URL || '';

    const data = req.body;

    if (!data || data.status !== 'PAID') {
        return res.status(200).json({ status: data?.status || 'unknown', ignored: true });
    }

    const transactionId = data.transactionId;
    const amount = (data.amount || 0) / 100;

    let metadata = {};
    try { metadata = JSON.parse(data.metadata || '{}'); } catch(e) {}

    const pixelId = metadata.pixel_id || FB_PIXEL_ID;
    const utms = metadata.utms || {};

    if (!pixelId || !FB_ACCESS_TOKEN) {
        return res.status(200).json({ message: 'Pixel ID ou Token ausente. Evento ignorado.' });
    }

    const sha256 = async (str) => {
        if (!str) return undefined;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(str.trim().toLowerCase()));
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const userData = {
        client_ip_address: data.customer?.ip || req.headers['x-forwarded-for'] || '',
        client_user_agent: data.customer?.userAgent || 'Webhook/BCat',
    };
    if (data.customer?.email) userData.em = [await sha256(data.customer.email)];
    if (data.customer?.phone) userData.ph = [await sha256(data.customer.phone.replace(/\D/g, ''))];

    const fbPayload = {
        data: [{
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: transactionId,
            action_source: 'email',
            user_data: userData,
            custom_data: {
                ...utms,
                value: amount,
                currency: 'BRL',
                content_name: 'Combo Whopper Promo',
                content_category: 'BK Funil V7',
                agent: 'Janus-Webhook-Omniscient'
            }
        }]
    };
    if (FB_TEST_CODE) fbPayload.test_event_code = FB_TEST_CODE;

    const fbUrl = `https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${FB_ACCESS_TOKEN}`;

    try {
        const fbRes = await fetch(fbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fbPayload)
        });
        const fbData = await fbRes.json();

        // Repasse para o Webhook externo do mestre (N8N etc.)
        if (EXTERNAL_WEBHOOK) {
            fetch(EXTERNAL_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'BK_FUNIL_V7',
                    event: 'Purchase_Confirmed',
                    transaction_data: data,
                    metadata
                })
            }).catch(() => {});
        }

        return res.status(200).json({ ok: true, fb_response: fbData });
    } catch (error) {
        console.error('[webhook-blackcat] Erro:', error);
        return res.status(500).json({ error: error.message });
    }
}
