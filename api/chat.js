export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const baseUrl = process.env.VLLM_BASE_URL;
    const apiKey = process.env.VLLM_API_KEY;
    const modelId = process.env.VLLM_MODEL_ID;

    if (!baseUrl || !apiKey || !modelId) {
        res.status(500).json({ error: 'Missing VLLM configuration on server' });
        return;
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const upstreamPayload = {
            stream: true,
            max_tokens: 4000,
            temperature: 0.7,
            ...body,
            model: modelId
        };

        const upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(upstreamPayload)
        });

        if (!upstream.ok || !upstream.body) {
            const text = await upstream.text().catch(() => '');
            res.status(upstream.status || 500).send(text || 'Upstream error');
            return;
        }

        // SSE passthrough
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of upstream.body) {
            res.write(chunk);
        }

        res.end();
    } catch (e) {
        console.error(e);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Proxy error' });
        } else {
            res.end();
        }
    }
}

