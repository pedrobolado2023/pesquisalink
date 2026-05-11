const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ===== CREDENCIAIS E CONFIGURAÇÕES =====
const SHOPEE_CONFIG = {
    APP_ID: '18300890048',
    SECRET: 'THTCKJVZLZCZV77X2S2AW2ULFDW6AZ3F',
    API_URL: 'https://open-api.affiliate.shopee.com.br/graphql'
};

const ML_CREDENTIALS = {
    tag: 'hp692480',
    cookie: `_d2id=ccf977bc-fac6-4d4c-aeb8-18316aa81d83; orgnickp=HP692480; orguseridp=142018015; ftid=GISvwrRP7lLcOqugbEWq0sPZ2SXQN80o-1766577762571; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; p_dsid=fe450ffa-4232-4526-a901-9de866639f87-1766577810702; p_edsid=dd8a9be6-645d-4f08-8e1d-2ecaa425a857-1766577810702; g_state={"i_l":0,"i_ll":1770732986558,"i_b":"qyHJBOw8K5qOFUvR36CYApkeCwds5sTBoXuO/O4OmvA","i_e":{"enable_itp_optimization":0}}; ssid=ghy-020916-e1mo4mVTKb32GWK2mqy779sUYmubcG-__-142018015-__-1865363982986--RRR_0-RRR_0; orguserid=d0TZZHd07d09; _csrf=WatuolyoF3PIvUGogd27ePbc; _mldataSessionId=f11f47ab-0dd9-4c8b-8543-5f9b44e91333; cookiesPreferencesLogged=%7B%22userId%22%3A142018015%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A142018015%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; c_ZxMWlg=1; cp=74952240; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiNjQ5OWE5YTktMzNkZS00NWU1LWIxNzYtOTRjYjQzNWE4YWMxIiwicm90YXRpb25faWQiOiIwZjhhNWE0NS0xNGMzLTQ2MjMtOWI3ZC0xMjFlYWZlZWJkMDQiLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc3ODUxNDE2NywiZXhwIjoxNzgxMTA1NTY3LCJqdGkiOiI4YmJkZmEzOC0xZWM2LTQzZGUtOWFjYS0yYzNmYjcyYTViOTQiLCJpYXQiOjE3Nzg1MTM1NjcsInN1YiI6IjY0OTlhOWE5LTMzZGUtNDVlNS1iMTc2LTk0Y2I0MzVhOGFjMSJ9.jzcqlkW82DfL-7h5KjJBTBBiEIrK8ElP4t4bJxVkWi9Daho-HE62OrjP7yYrKpaOWzTH_PITUgp3gx6E6Zq4NVvRwj1W1PXoM-WPJGYNxKi0TslM-_5yBwaHFGo8FnvrzInNHK7XvIuizy5sIDzPcJOohhPhvs1CbGD4D7AXGwT9KScr769SSPZEp87LnhsYU3sVr26_dIeQUYb1RrtuCS4MR2XPyYnGz_34YSpfoEFAg_1OLTiFGO4xepe6rmm3Dtbnk2eawqr7RE0S1gYMF7Kyn-7TgsvNAQ9VC8rpMqGYI1Bldz3z3UaEq-qpHfWUkgYrH4xpqANJ3zasBVjlhQ; ml_cart-quantity=14; hide-cookie-banner=0-COOKIE_PREFERENCES_ALREADY_SET`
};

const AMAZON_CREDENTIALS = {
    tag: 'ph17022026-20',
    cookie: `aws-waf-token=07b8e810-9f09-4256-bdab-0837fa4270e7:EAoAg+WeFekrAAAA:HV59/5SrfR2h2xGeTolLN7QSk2AJQgpcdZ43K2+NhB8IHrmCYJn+QfRuBf0alB1biI9aT/q+yyWHNtwzYv/crHEMQEltlULjozLH2rmBhQGuzQI+/gz0P7InT9h4k+ns5XR7/3yqTdk+ELf41TLNqSrEstuCSf7cyrOReV/asQVacI+sefIGAll0cBzIeuJuqk++1Q==; session-id=141-8521114-5492548; i18n-prefs=BRL; lc-acbbr=pt_BR; ubid-acbbr=131-7665118-9813119; id_pkel=n0; id_pk=eyJuIjoiMCIsImFmIjoiMSIsImNjIjoiMSJ9; sso-state-acbbr=Xdsso|ZQEjgh4UBiggjwXs0WABxNLZlVP5OH2T6xTyPLBXkRT-wyEv-BINPjouE56C_xIFGVDFeliQEOJBIgyKPHVUi89valI2Rk-1hStPZ0dHkulLlAxT; sid=aa6pRqMVgGPY2u1B7aBHPg==|JO565umvXCTWeHn1xtesv2mK+74W/qUZigmyjTQ1n4Y=; at-acbbr=Atza|gQBMqk-iAwEBAEIeNJBelgVs-20uDyHuEwqXoL7HhEJgN2IKN5VTAdioaVwOAo6H7uC2jLBL3pyBVfRLiOnxsaqiIhy9SWcMlwLbAIOOZnlFX3iL-mFFk2nQWzKGdNzxTHr5PkVfrfrBndSnfeKwTIZd3FYqS6QMdpFXF0KV72IKGbFaa486ldwwcs7PFeKJ_1Py0OQdIF9VinYOrHSWWA_-Ieu9xCzNYAzSJQDU1qrgsy0HKBsh3SppHXD9c4cvk0wttt6Tzlx2NtMpl10MdwRvYF2QgwMuM4tin6I1xJ5CmXyOqYqAiDn7L0xRBepz8BOVdqmHBZkxbdBcWkQv-O4EybIgtfxGiY_-yANvCUA_lqUBzf47KLiM5__pa3f6DZeuZNWP2QaSfs5FOkhQAiK6piVwc6Bw8WiqCDG7GD0xsbrRSlXVQuyKHTMljTef; sess-at-acbbr=LFqT1mfebU8C4Yq1cnUpukc61JEf8Jvfu6Ikqm0da1U=; sst-acbbr=Sst1|PQJwhF30clYmfaFaBA2FehcMCUV8bbAglzSUMIjvS9l4-2BwLFf6zjUMxEcfKcuTU5i7NHOp41AwV_BCwNUBYZceQYIIXOaT_VjFpARQ1Q_kEhccD3eGXpxMizGKOI3TU2tgj_SVt2C1E-42GZi84NCpdduaHPMpfawIwqDi9r7-SaQYryv5ECX2ZRo7HwMCtjowE975BjH-B9S6EWYX8tKvnydv67IoPggzq8F3Z3HlKqASkdCIsDgMbOLcyvICAOIurVTbacDqkINUKuzV3bQvx98VavP0g7Yl4ZDr3CpsKp0; x-acbbr="8WiwJ376Xwq0DZGHSqEn?XRbaOa327b@h2yAaUvxeqm?sGGNOy3F8LYfbNqC0aDI"; session-token="kP83o2qyZ1Wu9GsoJUmY/Mg5Y7fOUsdeGWt5/TKbXsCK4GhksQazuZPytRtwoYqf1bqnrAvU7b1u5Xq/UOcGNrzgmR2POCmo16cE2wBxtOJZhC/AfFwRPgk0j4mhV9dKaHUGJfcj3VLHLyyM8HlLHkr9u5H4bPpGaUYLDnRk0jeoETCKU9HAu1soAxyUcoymD4zU1cavqmvNlmULDvJAa5s+YCpwfiiqX26H9m0BMVT0062AyTDcFn1F3HtSRpIj1JD790xMm8c="; session-id-time=2082787201l; rxc=AAclgbXAdV8nDaxAMy8; csm-hit=tb:s-8XKFCGJQHVRRYRQ98AKF|1773355078310&t:1773355078310&adb:adblk_yes`
};

const SHEIN_CREDENTIALS = {
    token: `MDEwMDE.eyJiIjo3LCJnIjoxNzc3MjI2MDM1LCJyIjoiSlNsNkI5IiwidCI6MiwibSI6MzkwNzE0NTYxNSwibCI6MTc3NzIyNjAzNX0.b2b89f9576f46101.3acc2313238404bab9799d258b89d8b369c59f9108274052379bb5789e98785b`,
    memberId: '3907145615',
    cookie: `zpnvSrwrNdywdz=center; smidV2=20260316203247d9590fe8293823c030de3c35866891c300d9b8bd5f28c38f0; memberId=3907145615; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzc3MjI2MDM1LCJyIjoiSlNsNkI5IiwidCI6MiwibSI6MzkwNzE0NTYxNSwibCI6MTc3NzIyNjAzNX0.b2b89f9576f46101.3acc2313238404bab9799d258b89d8b369c59f9108274052379bb5789e98785b; sessionID_shein_m_pwa=s%3Af1WfkwyQtAjc9tFqB0Sw8oQ8tJmX5xNF.g%2BlU4OfN7UG8CzoQmJ%2BCjDtqd6xu%2B7EFDR6M5WJ88Po; armorUuid=20260317073234034c068f63c8199872756c3a28bd082200a616aeaf1960e600; _cbp=fb.1.1777226077157.1562120072; _cfuvid=PVCD.ppP5p6zzjV_j7kbW.jGY8CZaB19t41x92heCFg-1778514056.8331153-1.0.1.1-fuwTAz4z.0FrtW8OwCk2QaGvmNfF5qnUfHdInRi7rQQ; cf_clearance=.51o.AVa2x6B89T0bzXJkpFGje0OXSbZP158MLQ_hEg-1778514058-1.2.1.1-XCAEBOQSxuBBeNjpqJnI66MbCYgzWUSr1FJQ2WQBxBPo.pHvr_lkRjnL5NhOv_HMafV0GI66_qhcQrIwH10EJlClj0iOVfLMlaxkAu5vajoUNF6IVjPkXbXsvk4dB6W7iHiz4rP0SxgyZucdevDok54qd5O7t7yx4jWWxwiYAboRfBaCLHULqkwmFJniKFRsZzXEgN8mXcXsA7zzQXIon4glaRjpwJk9dfAZI9itVCS7xdF3Xt9NYdi0s99rPF4mtOuap168eQAF.gu3NKexQ4lMSeB60t0O1NXBwaTbTyjYvjfj4qT2CdmNxt1w2LbzOULnw5Cc43A3HvKel_bevQ; jump_to_mbr=1; language=br`
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
                finalProducts.push(...res.value);
                stats[name.toLowerCase().replace(' ', '')] = res.value.length;
                console.log(`✅ ${name}: ${res.value.length} ofertas (Premium Tracking)`);
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

        return (response.data?.data?.productOfferV2?.nodes || []).map(p => ({
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

            if (name && price > 0 && asin) {
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
        $('.poly-card, .ui-search-layout__item').each((i, el) => {
            if (raw.length >= 10) return false;
            const $el = $(el);
            const name = $el.find('.poly-component__title, .ui-search-item__title').text().trim();
            const price = parseFloat($el.find('.andes-money-amount__fraction').first().text().replace(/[^0-9]/g, '')) || 0;
            const image = $el.find('img').first().attr('data-src') || $el.find('img').first().attr('src');
            let link = $el.find('a').first().attr('href');
            if (name && price > 0 && link) {
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

        for (const p of raw) {
            try {
                const cleanUrl = p.link.split('?')[0].split('#')[0];
                const csrfToken = cookies.match(/_csrf=([^;]+)/)?.[1] || '';

                const affRes = await axios.post('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
                    { urls: [cleanUrl], tag: ML_CREDENTIALS.tag },
                    {
                        headers: { ...headers, 'cookie': cookies, 'x-csrf-token': csrfToken },
                        timeout: 5000
                    }
                );

                // Pegar cookies novos se houver (para manter a sessão viva)
                const setCookie = affRes.headers['set-cookie'];
                if (setCookie) cookies = mergeCookies(cookies, setCookie);

                const item = affRes.data?.urls?.[0];
                const affLink = item?.short_url || item?.url;

                converted.push({
                    ...p, link: affLink || p.link,
                    source: 'Mercado Livre',
                    sales: (affLink && (affLink.includes('/sec/') || affLink.includes('/social/') || affLink.includes('meli.la'))) ? '🔥 Afiliado ML' : '🛒 Direto'
                });
            } catch (e) {
                converted.push({ ...p, source: 'Mercado Livre', sales: '🛒 Direto' });
            }
        }
        return converted;
    } catch (e) { return []; }
}

app.listen(PORT, () => console.log(`🚀 Lab pronto na porta ${PORT}`));
