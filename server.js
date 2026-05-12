const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config(); // Carrega o .env local

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ===== CREDENCIAIS E CONFIGURAÇÕES =====
const SHOPEE_CONFIG = {
    APP_ID: process.env.SHOPEE_APP_ID || '',
    SECRET: process.env.SHOPEE_SECRET || '',
    API_URL: 'https://open-api.affiliate.shopee.com.br/graphql'
};

const ML_CREDENTIALS = {
    tag: process.env.ML_TAG || 'hp692480',
    cookie: process.env.ML_COOKIE || '',
    csrfToken: process.env.ML_CSRF_TOKEN || ''
};

const AMAZON_CREDENTIALS = {
    tag: process.env.AMAZON_TAG || 'ph17022026-20',
    cookie: process.env.AMAZON_COOKIE || ''
};

const SHEIN_CREDENTIALS = {
    token: process.env.SHEIN_TOKEN || '',
    memberId: process.env.SHEIN_MEMBER_ID || '',
    cookie: process.env.SHEIN_COOKIE || ''
};

const USER_AGENTS = {
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
};

// ===== AUXILIARES =====
function mergeCookies(oldCookieString, setCookieArray) {
    let cookieMap = {};
    if (oldCookieString) {
        oldCookieString.split(';').forEach(c => {
            const [key, ...val] = c.trim().split('=');
            if (key) cookieMap[key] = val.join('=');
        });
    }
    if (setCookieArray && Array.isArray(setCookieArray)) {
        setCookieArray.forEach(c => {
            const cookiePart = c.split(';')[0];
            const [key, ...val] = cookiePart.trim().split('=');
            if (key) cookieMap[key] = val.join('=');
        });
    }
    return Object.keys(cookieMap).map(key => `${key}=${cookieMap[key]}`).join('; ');
}

function isRelevantProduct(productName, searchKeyword) {
    if (!productName || !searchKeyword) return true;
    
    const nameLower = productName.toLowerCase();
    const keywordLower = searchKeyword.toLowerCase();
    
    const negativeWords = ['capa', 'capinha', 'case', 'pelicula', 'película', 'cabo', 'carregador', 'suporte', 'pulseira', 'caixa vazia', 'cinta', 'tampa'];
    
    // Se a busca original já for por um acessório, ignoramos o filtro negativo
    const userSearchedForAccessory = negativeWords.some(word => keywordLower.includes(word));
    
    if (!userSearchedForAccessory) {
        const hasNegativeWord = negativeWords.some(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(nameLower);
        });
        if (hasNegativeWord) return false;
    }
    
    // Validação de match das palavras da busca
    const keywordTokens = keywordLower.split(/\s+/).filter(w => w.length > 1 && w !== 'de' && w !== 'para');
    if (keywordTokens.length > 0) {
        let matchCount = 0;
        for (const token of keywordTokens) {
            if (nameLower.includes(token)) matchCount++;
        }
        // Se a busca tem múltiplas palavras e quase nenhuma aparece no título, bloqueamos
        if (matchCount < Math.ceil(keywordTokens.length * 0.5)) {
            return false;
        }
    }
    return true;
}

// ===== API ENDPOINT =====
app.post('/api/analyze-link', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Termo de busca é obrigatório' });

    const isUrl = url.startsWith('http');
    const keyword = isUrl ? 'Produto' : url;

    console.log(`\n🚀 [Lab] Pesquisando: "${keyword}"`);

    const platforms = [
        { name: 'Shopee', fn: searchShopee },
        { name: 'Amazon', fn: searchAmazon },
        { name: 'Mercado Livre', fn: searchMercadoLivre },
        { name: 'Shein', fn: searchShein }
    ];

    try {
        const results = await Promise.allSettled(platforms.map(p => p.fn(keyword)));
        const finalProducts = [];
        const stats = { shopee: 0, amazon: 0, mercadolivre: 0, shein: 0 };

        results.forEach((res, index) => {
            const name = platforms[index].name;
            if (res.status === 'fulfilled' && res.value && res.value.length > 0) {
                const affiliateProducts = res.value.filter(p => !p.sales.includes('Direto'));
                if (affiliateProducts.length > 0) {
                    finalProducts.push(...affiliateProducts);
                    stats[name.toLowerCase().replace(' ', '')] = affiliateProducts.length;
                    console.log(`✅ ${name}: ${affiliateProducts.length} ofertas (Premium Tracking)`);
                } else {
                    console.log(`⚠️ ${name}: Sem resultados após filtrar diretos.`);
                }
            } else {
                console.log(`⚠️ ${name}: Sem resultados.`);
            }
        });

        finalProducts.sort((a, b) => a.price - b.price);

        res.json({
            success: true,
            originalProduct: { title: isUrl ? 'Link Externo' : url, image: null, platform: isUrl ? 'URL' : 'Search' },
            comparison: finalProducts,
            stats: stats
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===== SHOPEE (AFILIADO NATIVO) =====
async function searchShopee(keyword) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const query = `query { productOfferV2(keyword: "${keyword}", limit: 10) { nodes { productName imageUrl price shopName offerLink } } }`;
        const body = JSON.stringify({ query });
        const signature = crypto.createHash('sha256').update(SHOPEE_CONFIG.APP_ID + timestamp + body + SHOPEE_CONFIG.SECRET).digest('hex');

        const response = await axios.post(SHOPEE_CONFIG.API_URL, body, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `SHA256 Credential=${SHOPEE_CONFIG.APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
            },
            timeout: 10000
        });

        return (response.data?.data?.productOfferV2?.nodes || [])
            .filter(p => isRelevantProduct(p.productName, keyword))
            .map(p => ({
                name: p.productName, price: parseFloat(p.price) || 0, image: p.imageUrl,
                link: p.offerLink, source: 'Shopee', sales: '💎 Afiliado'
            }));
    } catch (e) { return []; }
}

// ===== SHEIN (CONVERSÃO ONELINK) =====
async function searchShein(keyword) {
    try {
        const timestamp = Date.now();
        const xoestPlain = `1E|${timestamp}|0BA68F_5BD9_61C4_692E_92A1801D94AB`;
        const xoestEncoded = Buffer.from(xoestPlain).toString('base64');

        const headers = {
            'accept': 'application/json',
            'content-type': 'application/json; charset=utf-8',
            'cookie': SHEIN_CREDENTIALS.cookie,
            'mi': String(SHEIN_CREDENTIALS.memberId),
            'siteuid': 'mbr',
            'token': SHEIN_CREDENTIALS.token,
            'user-agent': USER_AGENTS.mobile,
            'x-oest': xoestEncoded
        };

        const response = await axios.post('https://m.shein.com/br/affiliate/api/search/keywordsNew',
            { "language": "pt-br", "playId": 5, "page": 1, "mid": String(SHEIN_CREDENTIALS.memberId), "keywords": keyword, "limit": 10, "sort": 0 },
            { headers, timeout: 20000 }
        );

        if (response.data?.code !== "0") return [];

        const list = response.data?.info?.goodsList || [];
        const converted = [];

        for (const p of list) {
            if (!isRelevantProduct(p.goodsName, keyword)) continue;
            
            try {
                const genPayload = {
                    "abtVersion": 1, "activityId": 20, "goodsId": parseInt(p.goodsId),
                    "behaviorId": `goods.${Math.random().toString(36).substring(2, 12)}`,
                    "goodsPicRequestList": [{ 
                        "commentRankAverage": "5.00",
                        "detailImage": p.mainImage,
                        "discount": 0,
                        "goodsId": parseInt(p.goodsId), 
                        "goodsName": p.goodsName, 
                        "imageOrder": 0,
                        "language": "pt-br",
                        "mainImage": p.mainImage, 
                        "salesPriceText": "R$0,00",
                        "siteUid": "mbr",
                        "spuSales": "100+"
                    }],
                    "language": "pt-br", "type": 2, "uid": String(SHEIN_CREDENTIALS.memberId), "t": Date.now(),
                    "ogpParamRequest": { "orgImgUrl": p.mainImage, "shareTitle": p.goodsName },
                    "translations": "{\"SHEIN_KEY_H5_48336\":\"Pesquise meu código no app da SHEIN\",\"SHEIN_KEY_H5_34201\":\"vendido\",\"SHEIN_KEY_H5_48335\":\"Descontos e promoções estão sujeitos a alterações. Consulte o site e o app da SHEIN para os preços mais atualizados.\",\"SHEIN_KEY_H5_48674\":\"Envio Rápido\",\"SHEIN_KEY_H5_48337\":\"Minhas escolhas para você\",\"SHEIN_KEY_H5_48338\":\"Pesquise {0} no app da SHEIN\"}"
                };
                const genRes = await axios.post('https://m.shein.com/br/affiliate/api/share/link/realtime/generate', genPayload, { headers, timeout: 5000 });
                const affLink = genRes.data?.info?.oneLink;

                converted.push({
                    name: p.goodsName, price: parseFloat(p.salesPrice) || 0,
                    image: p.mainImage?.startsWith('//') ? 'https:' + p.mainImage : p.mainImage,
                    link: affLink || `https://m.shein.com/br/product-p-${p.goodsId}.html`,
                    source: 'Shein', sales: affLink ? '✨ Onelink' : '🛍️ Direto'
                });
            } catch (e) {
                converted.push({ name: p.goodsName, price: parseFloat(p.salesPrice) || 0, image: p.mainImage, link: `https://m.shein.com/br/product-p-${p.goodsId}.html`, source: 'Shein', sales: '🛍️ Direto' });
            }
        }
        return converted;
    } catch (e) { return []; }
}

// ===== AMAZON (CONVERSÃO AMZN.TO) =====
async function searchAmazon(keyword) {
    try {
        const { data } = await axios.get(`https://www.amazon.com.br/s?k=${encodeURIComponent(keyword)}`, {
            headers: { 'User-Agent': USER_AGENTS.desktop, 'Cookie': AMAZON_CREDENTIALS.cookie },
            timeout: 12000
        });
        const $ = cheerio.load(data);
        const products = [];
        const items = $('.s-result-item[data-component-type="s-search-result"]').toArray();

        for (const el of items) {
            if (products.length >= 10) break;
            const $el = $(el);
            const name = $el.find('h2 span').first().text().trim();
            const price = parseFloat($el.find('.a-price-whole').first().text().replace(/[^0-9]/g, '')) || 0;
            const image = $el.find('img.s-image').attr('src');
            const asin = $el.attr('data-asin');

            if (name && price > 0 && asin && isRelevantProduct(name, keyword)) {
                const longUrl = `https://www.amazon.com.br/dp/${asin}?tag=${AMAZON_CREDENTIALS.tag}`;
                let finalLink = longUrl;

                try {
                    const shortRes = await axios.get('https://www.amazon.com.br/associates/sitestripe/getShortUrl', {
                        params: { longUrl, marketplaceId: '526970' },
                        headers: { 'Cookie': AMAZON_CREDENTIALS.cookie, 'User-Agent': USER_AGENTS.desktop, 'Referer': longUrl },
                        timeout: 5000
                    });
                    if (shortRes.data?.shortUrl) finalLink = shortRes.data.shortUrl;
                } catch (e) { /* Fallback to long */ }

                products.push({ name, price, image, source: 'Amazon', sales: finalLink.includes('amzn.to') ? '📦 amzn.to' : '🏷️ Tag', link: finalLink });
            }
        }
        return products;
    } catch (e) { return []; }
}

// ===== MERCADO LIVRE (CONVERSÃO /SEC/ OU SOCIAL) =====
async function searchMercadoLivre(keyword) {
    try {
        const { data } = await axios.get(`https://lista.mercadolivre.com.br/${encodeURIComponent(keyword)}`, {
            headers: { 'User-Agent': USER_AGENTS.desktop, 'Cookie': ML_CREDENTIALS.cookie }, timeout: 12000
        });
        const $ = cheerio.load(data);
        const raw = [];
        const seenNames = new Set();
        $('.poly-card, .ui-search-layout__item').each((i, el) => {
            if (raw.length >= 10) return false;
            const $el = $(el);
            const name = $el.find('.poly-component__title, .ui-search-item__title').text().trim();
            const price = parseFloat($el.find('.andes-money-amount__fraction').first().text().replace(/[^0-9]/g, '')) || 0;
            const image = $el.find('img').first().attr('data-src') || $el.find('img').first().attr('src');
            let link = $el.find('a').first().attr('href');
            
            // Pular anúncios patrocinados (click1) pois a API de afiliados recusa esses links
            if (link && link.includes('click1.mercadolivre')) return true;

            if (name && price > 0 && link && !seenNames.has(name) && isRelevantProduct(name, keyword)) {
                seenNames.add(name);
                if (!link.startsWith('http')) link = 'https://www.mercadolivre.com.br' + link;
                raw.push({ name, price, image, link });
            }
        });

        const converted = [];
        let cookies = ML_CREDENTIALS.cookie;
        const headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'origin': 'https://www.mercadolivre.com.br',
            'priority': 'u=1, i',
            'referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
            'sec-ch-ua': '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': USER_AGENTS.desktop,
            'cookie': cookies
        };

        try {
            const linkBuilderRes = await axios.get('https://www.mercadolivre.com.br/afiliados/linkbuilder', {
                headers,
                validateStatus: (status) => status < 500, timeout: 5000
            });
            const setCookie = linkBuilderRes.headers['set-cookie'];
            if (setCookie) cookies = mergeCookies(cookies, setCookie);
        } catch (e) { /* silent */ }

        const cleanUrls = raw.map(p => p.link.split('?')[0].split('#')[0]);
        const csrfToken = ML_CREDENTIALS.csrfToken || cookies.match(/_csrf=([^;]+)/)?.[1] || '';

        try {
            if (cleanUrls.length > 0) {
                const affRes = await axios.post('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
                    { urls: cleanUrls, tag: ML_CREDENTIALS.tag },
                    {
                        headers: { ...headers, 'cookie': cookies, 'x-csrf-token': csrfToken },
                        timeout: 8000
                    }
                );

                const setCookie = affRes.headers['set-cookie'];
                if (setCookie) cookies = mergeCookies(cookies, setCookie);

                const items = affRes.data?.urls || [];
                
                for (let i = 0; i < raw.length; i++) {
                    const p = raw[i];
                    // Busca pelo item correspondente no array retornado ou usa a mesma ordem
                    const item = items.find(it => p.link.includes(it.original_url || it.url)) || items[i];
                    const affLink = item?.short_url || item?.url;

                    converted.push({
                        ...p, link: affLink || p.link,
                        source: 'Mercado Livre',
                        sales: (affLink && (affLink.includes('/sec/') || affLink.includes('/social/') || affLink.includes('meli.la'))) ? '🔥 Afiliado ML' : '🛒 Direto'
                    });
                }
            }
        } catch (e) {
            console.error("Erro na conversão em lote ML:", e.message);
            for (const p of raw) {
                converted.push({ ...p, source: 'Mercado Livre', sales: '🛒 Direto' });
            }
        }

        return converted;
    } catch (e) { return []; }
}

app.listen(PORT, () => console.log(`🚀 Lab pronto na porta ${PORT}`));
