// ─── VERCEL SERVERLESS: CHECK STATUS (BlackCatPay) ───
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const BLACKCAT_API_KEY = process.env.BLACKCAT_API_KEY;
    const txId = req.query.txId;

    if (!txId) {
        return res.status(400).json({ success: false, message: 'txId é obrigatório.' });
    }

    try {
        const response = await fetch(`https://api.blackcatpay.com.br/api/sales/${txId}/status`, {
            method: 'GET',
            headers: { 'X-API-Key': BLACKCAT_API_KEY }
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('[check-status] Erro:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
