// ─── VERCEL SERVERLESS: CREATE PIX (BlackCatPay) ───
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const BLACKCAT_API_KEY = process.env.BLACKCAT_API_KEY;
    if (!BLACKCAT_API_KEY) {
        return res.status(500).json({ success: false, message: 'BLACKCAT_API_KEY não configurada no Vercel.' });
    }

    const { amount, pixel_id, utms, cpf, name, email, phone } = req.body;

    // Valida CPF (garante 11 dígitos ou fallback funcional)
    let validCpf = cpf ? String(cpf).replace(/\D/g, '') : '';
    if (validCpf.length !== 11) {
        validCpf = '46924874052'; // Exemplo de CPF "hardcoded funcional" (ou use o gerado)
    }

    const metadata = {
        pixel_id: pixel_id || process.env.FB_PIXEL_ID || '',
        ...(utms || {})
    };

    const payload = {
        amount: parseInt(amount),
        currency: 'BRL',
        paymentMethod: 'pix',
        items: [{
            title: process.env.OFERTA_NOME || process.env.OFFER_NAME || 'Combo BK Vantagens',
            unitPrice: parseInt(amount),
            quantity: 1,
            tangible: false
        }],
        customer: {
            name: name || 'Cliente BK',
            email: email || 'bkcliente@email.com',
            phone: phone || '11999998888',
            document: { number: validCpf, type: 'cpf' }
        },
        pix: { expiresInDays: 1 },
        metadata
    };

    try {
        const response = await fetch('https://api.blackcatpay.com.br/api/sales/create-sale', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': BLACKCAT_API_KEY
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('[create-pix] Erro:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
