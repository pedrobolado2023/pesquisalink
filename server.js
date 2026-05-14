const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config(); // Carrega o .env da pasta atual

const app = express();
const PORT = 3002;

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
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// Lista de Marcas para Priorização de Qualidade
const PREMIUM_BRANDS = [
    'NIKE', 'ADIDAS', 'PUMA', 'MIZUNO', 'SAMSUNG', 'APPLE', 'IPHONE', 'XIAOMI', 'ASUS', 
    'DELL', 'LOGITECH', 'RAZER', 'CORSAIR', 'HYPERX', 'LENOVO', 'MOTOROLA', 'PHILIPS',
    'LG', 'SONY', 'STANLEY', 'OAKLEY', 'CONVERSE', 'VANS', 'LACOSTE', 'TOMMY', 'CALVIN'
];

// Palavras-chave para Filtrar Acessórios (Lixo de busca)
const TRASH_KEYWORDS = [
    'CAPINHA', 'PELICULA', 'CABO', 'ADAPTADOR', 'CADARÇO', 'LIMPEZA', 'REFIL', 'SUPOSTE', 
    'CASE', 'PROTEÇÃO', 'ADESIVO', 'MINIATURA', 'PINGENTE', 'CORRENTE'
];

function isRelevantProduct(name, keyword) {
    const n = name.toUpperCase();
    const k = keyword.toUpperCase();
    
    // Se o nome contém termos de lixo mas a busca não pediu por eles, ignora
    const hasTrash = TRASH_KEYWORDS.some(t => n.includes(t));
    const askedForTrash = TRASH_KEYWORDS.some(t => k.includes(t));
    if (hasTrash && !askedForTrash) return false;

    const words = k.split(' ');
    return words.every(word => n.includes(word));
}

function rankProducts(products, keyword) {
    const seen = new Set();
    const ranked = products.map(p => {
        let score = 0;
        const nameUpper = p.name.toUpperCase();
        
        // 1. Bônus por Promoção (Desconto Real)
        if (p.originalPrice && p.originalPrice > p.price) {
            const discountPercent = ((p.originalPrice - p.price) / p.originalPrice) * 100;
            score += discountPercent; 
        }

        // 2. Bônus por Marcas Premium
        if (PREMIUM_BRANDS.some(brand => nameUpper.includes(brand))) {
            score += 50; 
        }

        // 3. Penalidade leve por preço muito baixo (geralmente acessório/lixo)
        if (p.price < 15 && !keyword.toUpperCase().includes('BARATO')) {
            score -= 30;
        }

        return { ...p, score };
    }).sort((a, b) => b.score - a.score);

    // Remover duplicatas baseadas no nome (limpo) e preço
    return ranked.filter(p => {
        const key = `${p.name.substring(0, 30).toUpperCase()}_${p.price}_${p.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ===== API ENDPOINT =====
app.post('/api/analyze-link', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Busca obrigatória' });
    const keyword = url.startsWith('http') ? 'Produto' : url;
    console.log(`\n🚀 [Lab Root] Pesquisando: "${keyword}" (Ranking Ativado)`);
    
    const platforms = [
        { name: 'Shopee', fn: searchShopee },
        { name: 'Amazon', fn: searchAmazon },
        { name: 'Mercado Livre', fn: searchMercadoLivre },
        { name: 'Shein', fn: searchShein }
    ];

    try {
        const results = await Promise.allSettled(platforms.map(p => p.fn(keyword)));
        let finalProducts = [];
        const stats = { shopee: 0, amazon: 0, mercadolivre: 0, shein: 0 };

        results.forEach((res, index) => {
            const platformName = platforms[index].name.toLowerCase().replace(' ', '');
            if (res.status === 'fulfilled' && res.value && res.value.length > 0) {
                finalProducts.push(...res.value);
                stats[platformName] = res.value.length;
            }
        });

        // Aplicar Ranking Inteligente (Promoção + Marcas)
        const rankedProducts = rankProducts(finalProducts, keyword);

        res.json({ 
            success: true, 
            originalProduct: { title: keyword, image: null, platform: 'Search' }, 
            comparison: rankedProducts, 
            stats 
        });
    } catch (e) {
        console.error('❌ Erro na busca:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===== PLATAFORMAS (Mesma lógica consolidada) =====
async function searchShopee(keyword) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        // Removido originalPrice pois a API está rejeitando o campo
        const query = `query { productOfferV2(keyword: "${keyword}", limit: 12) { nodes { productName imageUrl price offerLink } } }`;
        const body = JSON.stringify({ query });
        const signature = crypto.createHash('sha256').update(SHOPEE_CONFIG.APP_ID + timestamp + body + SHOPEE_CONFIG.SECRET).digest('hex');
        const response = await axios.post(SHOPEE_CONFIG.API_URL, body, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `SHA256 Credential=${SHOPEE_CONFIG.APP_ID}, Timestamp=${timestamp}, Signature=${signature}` },
            timeout: 10000
        });

        if (response.data.errors) {
            console.error('❌ Erro API Shopee:', response.data.errors);
            return [];
        }

        return (response.data?.data?.productOfferV2?.nodes || [])
            .filter(p => isRelevantProduct(p.productName, keyword))
            .map(p => {
                const currentPrice = parseFloat(p.price) || 0;
                return {
                    name: p.productName, 
                    price: currentPrice,
                    originalPrice: null, // Campo indisponível nesta versão da API
                    image: p.imageUrl, 
                    link: p.offerLink, 
                    source: 'Shopee', 
                    sales: '💎 Afiliado'
                };
            });
    } catch (e) { 
        console.error('❌ Erro Request Shopee:', e.message);
        return []; 
    }
}

async function searchAmazon(keyword) {
    try {
        const { data } = await axios.get(`https://www.amazon.com.br/s?k=${encodeURIComponent(keyword)}`, {
            headers: { 'User-Agent': USER_AGENTS.desktop, 'Cookie': AMAZON_CREDENTIALS.cookie }, timeout: 12000
        });
        const $ = cheerio.load(data);
        const products = [];
        $('.s-result-item[data-component-type="s-search-result"]').each((i, el) => {
            if (products.length >= 10) return false;
            const $el = $(el);
            const name = $el.find('h2 span').first().text().trim();
            const asin = $el.attr('data-asin');
            if (!name || !asin || !isRelevantProduct(name, keyword)) return true;

            // Preço Atual
            const priceText = $el.find('.a-price:not(.a-text-price) .a-offscreen').first().text();
            const price = priceText ? parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0;
            if (price <= 0) return true;

            // Preço Original
            let originalPrice = 0;
            const strikeText = $el.find('.a-price.a-text-price .a-offscreen').first().text() || 
                             $el.find('.a-text-strike').first().text() ||
                             $el.find('span[data-a-strike="true"]').text();
                             
            if (strikeText) {
                originalPrice = parseFloat(strikeText.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            }
            
            // Fallback Regex
            if (originalPrice <= price) {
                const htmlContent = $el.html();
                const strikeMatch = htmlContent.match(/De:\s*R\$\s*(\d+[\d\.,]*)/i) || 
                                   htmlContent.match(/span class="a-offscreen">R\$\s*(\d+[\d\.,]*)[^<]*?<\/span>[^<]*?span class="a-text-price/i);
                if (strikeMatch) {
                    originalPrice = parseFloat(strikeMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
                }
            }

            products.push({ 
                name, 
                price, 
                originalPrice: (originalPrice > price) ? originalPrice : null, 
                image: $el.find('img.s-image').attr('src'), 
                source: 'Amazon', 
                sales: '📦 amzn.to', 
                link: `https://www.amazon.com.br/dp/${asin}?tag=${AMAZON_CREDENTIALS.tag}` 
            });
        });
        return products;
    } catch (e) { return []; }
}

async function searchMercadoLivre(keyword) {
    try {
        const { data } = await axios.get(`https://lista.mercadolivre.com.br/${encodeURIComponent(keyword)}`, {
            headers: { 'User-Agent': USER_AGENTS.desktop, 'Cookie': ML_CREDENTIALS.cookie }, timeout: 12000
        });
        const $ = cheerio.load(data);
        const raw = [];
        $('.poly-card, .ui-search-layout__item').each((i, el) => {
            if (raw.length >= 10) return false;
            const $el = $(el);
            const name = $el.find('.poly-component__title, .ui-search-item__title').text().trim();
            if (!name || !isRelevantProduct(name, keyword)) return true;
            const currentPriceEl = $el.find('.andes-money-amount:not(.andes-money-amount--previous)').first();
            const priceWhole = currentPriceEl.find('.andes-money-amount__fraction').text().replace(/[^0-9]/g, '');
            const priceCents = currentPriceEl.find('.andes-money-amount__cents').text().replace(/[^0-9]/g, '') || '00';
            const price = priceWhole ? parseFloat(`${priceWhole}.${priceCents.substring(0,2)}`) : 0;
            if (price <= 0) return true;
            const prevEl = $el.find('.andes-money-amount--previous');
            let originalPrice = null;
            if (prevEl.length > 0) {
                const prevWhole = prevEl.find('.andes-money-amount__fraction').text().replace(/[^0-9]/g, '');
                const prevCents = prevEl.find('.andes-money-amount__cents').text().replace(/[^0-9]/g, '') || '00';
                if (prevWhole) originalPrice = parseFloat(`${prevWhole}.${prevCents.substring(0,2)}`);
            }
            raw.push({ name, price, originalPrice: (originalPrice > price) ? originalPrice : null, image: $el.find('img').first().attr('data-src') || $el.find('img').first().attr('src'), link: $el.find('a').first().attr('href'), source: 'Mercado Livre' });
        });
        
        const list = raw.map(p => ({ ...p, link: p.link.startsWith('http') ? p.link : 'https://www.mercadolivre.com.br' + p.link })).slice(0, 5);
        
        return await Promise.all(list.map(async (p) => {
            let finalLink = p.link;
            try {
                const csrfToken = (ML_CREDENTIALS.cookie.match(/_csrf=([^;]+)/) || [])[1] || '';
                const mlRes = await axios.post('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink', 
                    { urls: [p.link], tag: ML_CREDENTIALS.tag }, 
                    { headers: { 'cookie': ML_CREDENTIALS.cookie, 'x-csrf-token': csrfToken, 'User-Agent': USER_AGENTS.desktop, 'origin': 'https://www.mercadolivre.com.br' }, timeout: 5000 }
                );
                if (mlRes.data?.urls?.[0]?.created) finalLink = mlRes.data.urls[0].short_url || mlRes.data.urls[0].url;
            } catch (e) {}
            return { ...p, link: finalLink, sales: finalLink.includes('mercadolivre.com.br/afiliados/') || finalLink.length < 70 ? '💎 ML Afiliado' : '🔥 Oferta ML' };
        }));
    } catch (e) { return []; }
}

async function searchShein(keyword) {
    try {
        const timestamp = Date.now();
        const deviceId = "FEC65E18_4B1D_24F4_3DEE_093E7768A57";
        const xoest = Buffer.from(`${deviceId}|${timestamp}|B`).toString('base64');
        
        const headers = { 
            'Cookie': SHEIN_CREDENTIALS.cookie, 
            'mi': String(SHEIN_CREDENTIALS.memberId), 
            'Token': SHEIN_CREDENTIALS.token, 
            'siteUid': 'mbr',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', 
            'x-oest': xoest 
        };

        const res = await axios.post('https://m.shein.com/br/affiliate/api/search/keywordsNew', 
            { "language": "pt-br", "playId": 5, "page": 1, "mid": String(SHEIN_CREDENTIALS.memberId), "keywords": keyword, "limit": 10, "sort": 0 }, 
            { headers, timeout: 20000 }
        );

        if (res.data?.code !== "0") {
            headers['x-oest'] = 'NDRBRUQxMUVfRUNEMV85NTM0Xzc1NDFfNDE0MDBCMTFDNEU5';
            const retry = await axios.post('https://m.shein.com/br/affiliate/api/search/keywordsNew', 
                { "language": "pt-br", "playId": 5, "page": 1, "mid": String(SHEIN_CREDENTIALS.memberId), "keywords": keyword, "limit": 10, "sort": 0 }, 
                { headers, timeout: 20000 }
            );
            if (retry.data?.code === "0") return await processSheinResults(retry.data, keyword, headers);
            return [];
        }

        return await processSheinResults(res.data, keyword, headers);
    } catch (e) { return []; }
}

async function processSheinResults(data, keyword, headers) {
    const list = (data?.info?.goodsList || []).filter(p => isRelevantProduct(p.goodsName, keyword)).slice(0, 5);
    
    const converted = await Promise.all(list.map(async (p) => {
        let finalLink = `https://m.shein.com/br/product-p-${p.goodsId}.html`;
        try {
            const genRes = await axios.post('https://m.shein.com/br/affiliate/api/share/link/realtime/generate', {
                "abtVersion": 1, "activityId": 20, "goodsId": p.goodsId, "type": 2, "language": "pt-br", "uid": String(SHEIN_CREDENTIALS.memberId),
                "translations": "{\"SHEIN_KEY_H5_48336\":\"Pesquise meu código no app da SHEIN\",\"SHEIN_KEY_H5_34201\":\"vendido\"}",
                "ogpParamRequest": { "orgImgUrl": p.mainImage, "shareTitle": p.goodsName },
                "goodsPicRequestList": [{ "goodsId": p.goodsId, "goodsName": p.goodsName, "mainImage": p.mainImage, "salesPriceText": `R$${p.salesPrice}`, "siteUid": "mbr" }]
            }, { headers, timeout: 8000 });
            
            if (genRes.data?.info?.shareLink) {
                finalLink = genRes.data.info.shareLink;
            } else if (genRes.data?.info?.list?.[0]?.shareLink) {
                finalLink = genRes.data.info.list[0].shareLink;
            } else {
                // Fallback trackeado se a geração falhar
                finalLink += `?aff_id=${SHEIN_CREDENTIALS.memberId}&src_identifier=onelink`;
            }
        } catch (err) { 
            finalLink += `?aff_id=${SHEIN_CREDENTIALS.memberId}&src_identifier=onelink`;
        }

        return {
            name: p.goodsName, 
            price: parseFloat(p.salesPrice) || 0, 
            originalPrice: (p.retailPrice && parseFloat(p.retailPrice) > parseFloat(p.salesPrice)) ? parseFloat(p.retailPrice) : null,
            image: p.mainImage?.startsWith('//') ? 'https:' + p.mainImage : p.mainImage, 
            link: finalLink, 
            source: 'Shein', 
            sales: (finalLink.includes('shein.top') || finalLink.includes('aff_id=')) ? '💎 Shein Afiliado' : '✨ Oferta Shein'
        };
    }));

    return converted;
}

app.listen(PORT, () => console.log(`🚀 Lab pronto na porta ${PORT}`));
