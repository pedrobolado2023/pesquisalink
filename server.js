const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

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
    const userSearchedForAccessory = negativeWords.some(word => keywordLower.includes(word));
    if (!userSearchedForAccessory) {
        if (negativeWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(nameLower))) return false;
    }
    const tokens = keywordLower.split(/\s+/).filter(w => w.length > 1 && w !== 'de' && w !== 'para');
    if (tokens.length > 0) {
        let matchCount = tokens.reduce((count, token) => nameLower.includes(token) ? count + 1 : count, 0);
        if (matchCount < Math.ceil(tokens.length * 0.5)) return false;
    }
    return true;
}

// ===== API ENDPOINT =====
app.post('/api/analyze-link', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Busca obrigatória' });
    const keyword = url.startsWith('http') ? 'Produto' : url;
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
                const filtered = res.value.filter(p => !p.sales.includes('Direto'));
                if (filtered.length > 0) {
                    finalProducts.push(...filtered);
                    stats[name.toLowerCase().replace(' ', '')] = filtered.length;
                }
            }
        });

        finalProducts.sort((a, b) => a.price - b.price);
        res.json({ success: true, originalProduct: { title: keyword, image: null, platform: 'Search' }, comparison: finalProducts, stats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===== SHOPEE =====
async function searchShopee(keyword) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        // Removido originalPrice e priceBeforeDiscount pois a API está rejeitando o campo
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
                    originalPrice: null,
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

// ===== SHEIN =====
async function searchShein(keyword) {
    try {
        const timestamp = Date.now();
        const xoest = Buffer.from(`1E|${timestamp}|0BA68F_5BD9_61C4_692E_92A1801D94AB`).toString('base64');
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
            console.log("⚠️ Shein retornou erro:", res.data?.code, res.data?.message);
            return [];
        }

        const goodsList = res.data?.info?.goodsList || [];
        return goodsList
            .filter(p => isRelevantProduct(p.goodsName, keyword))
            .map(p => {
                const currentPrice = parseFloat(p.salesPrice) || 0;
                const origPrice = p.retailPrice ? parseFloat(p.retailPrice) : null;
                return {
                    name: p.goodsName, 
                    price: currentPrice, 
                    originalPrice: (origPrice && origPrice > currentPrice) ? origPrice : null,
                    image: p.mainImage?.startsWith('//') ? 'https:' + p.mainImage : p.mainImage,
                    link: `https://m.shein.com/br/product-p-${p.goodsId}.html`,
                    source: 'Shein', 
                    sales: '✨ Onelink'
                };
            });
    } catch (e) { 
        console.error("❌ Erro Shein:", e.message);
        return []; 
    }
}

// ===== AMAZON =====
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

            // Extração de Preço Atual
            const priceText = $el.find('.a-price:not(.a-text-price) .a-offscreen').first().text();
            const price = priceText ? parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0;
            if (price <= 0) return true;

            // Extração de Preço Original (Riscado)
            let originalPrice = 0;
            // Tenta múltiplos seletores comuns na Amazon Brasil
            const strikeText = $el.find('.a-price.a-text-price .a-offscreen').first().text() || 
                             $el.find('.a-text-strike').first().text() ||
                             $el.find('span[data-a-strike="true"]').text();
                             
            if (strikeText) {
                originalPrice = parseFloat(strikeText.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            }
            
            // Fallback Regex se o seletor falhar ou for igual ao preço atual
            if (originalPrice <= price) {
                const htmlContent = $el.html();
                // Procura por valores riscados no HTML
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

// ===== MERCADO LIVRE =====
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

            raw.push({ name, price, originalPrice: (originalPrice > price) ? originalPrice : null, image: $el.find('img').first().attr('data-src') || $el.find('img').first().attr('src'), link: $el.find('a').first().attr('href') });
        });

        // Fallback Regex ML
        if (raw.length < 3) {
            const itemRegex = /"id":"(MLB\d+)"[^}]{0,1500}?"title":"([^"]+)"[^}]{0,500}?"price":([0-9.]+)[^}]{0,500}?(?:"original_price":([0-9.]+)[^}]{0,500}?)?"permalink":"([^"]+)"[^}]{0,500}?"thumbnail":"([^"]+)"/g;
            let match;
            while ((match = itemRegex.exec(data)) !== null && raw.length < 10) {
                const [, id, title, priceStr, original_price, permalink, thumbnail] = match;
                if (isRelevantProduct(title, keyword)) {
                    raw.push({
                        name: title.replace(/\\u(\w{4})/gi, (m, g) => String.fromCharCode(parseInt(g, 16))),
                        price: parseFloat(priceStr), originalPrice: original_price ? parseFloat(original_price) : null,
                        image: thumbnail.replace(/\\\//g, '/').replace('http://', 'https://'), link: permalink.split('?')[0].replace(/\\\//g, '/')
                    });
                }
            }
        }

        return raw.map(p => ({ ...p, source: 'Mercado Livre', sales: '🔥 Afiliado ML', link: p.link.startsWith('http') ? p.link : 'https://www.mercadolivre.com.br' + p.link }));
    } catch (e) { return []; }
}

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
