const elements = {
    linkInput: document.getElementById('linkInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    loader: document.getElementById('loader'),
    btnText: document.querySelector('.btn-text'),
    statusDot: document.querySelector('.status-dot'),
    statusMessage: document.getElementById('statusMessage'),
    resultsSection: document.getElementById('resultsSection'),
    platformStats: document.getElementById('platformStats'),
    origImg: document.getElementById('origImg'),
    origTitle: document.getElementById('origTitle'),
    origPlatform: document.getElementById('origPlatform'),
    comparisonGrid: document.getElementById('comparisonGrid'),
    resultCount: document.getElementById('resultCount'),
    toast: document.getElementById('toast')
};

let currentComparison = [];
let activeFilter = 'all';

// ===== API =====

async function analyzeLink() {
    const url = elements.linkInput.value.trim();
    if (!url) return showStatus('Digite um produto ou cole um link!', 'yellow');

    setLoading(true);
    showStatus('🔍 Buscando nas plataformas...', 'yellow');
    elements.resultsSection.style.display = 'none';
    elements.platformStats.style.display = 'none';
    elements.comparisonGrid.innerHTML = '';

    try {
        const response = await fetch('/api/analyze-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (data.success) {
            renderResults(data);
            const total = data.comparison.length;
            showStatus(`✅ ${total} oferta${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}!`, 'green');
        } else {
            showStatus(data.error || 'Nenhum resultado encontrado.', 'yellow');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showStatus('❌ Erro de conexão com o servidor. Verifique se o servidor está rodando.', 'red');
    } finally {
        setLoading(false);
    }
}

// ===== UI HELPERS =====

function setLoading(isLoading) {
    if (isLoading) {
        elements.loader.style.display = 'block';
        elements.btnText.style.display = 'none';
        elements.analyzeBtn.disabled = true;
    } else {
        elements.loader.style.display = 'none';
        elements.btnText.style.display = 'flex';
        elements.analyzeBtn.disabled = false;
    }
}

function showStatus(message, colorClass) {
    elements.statusMessage.innerText = message;
    elements.statusDot.className = `status-dot ${colorClass}`;
}

// ===== RENDER =====

function renderResults(data) {
    const { originalProduct, comparison, stats } = data;
    currentComparison = comparison;

    // Produto original
    if (originalProduct.image) {
        elements.origImg.src = originalProduct.image;
        elements.origImg.style.display = 'block';
    } else {
        elements.origImg.style.display = 'none';
    }

    elements.origTitle.innerText = originalProduct.title || 'Busca por nome';
    elements.origPlatform.innerText = originalProduct.platform === 'Search'
        ? '🔍 Pesquisa por nome'
        : `🔗 Link: ${originalProduct.platform}`;

    // Stats por plataforma
    if (stats) {
        document.getElementById('count-shopee').innerText = stats.shopee || 0;
        document.getElementById('count-amazon').innerText = stats.amazon || 0;
        document.getElementById('count-ml').innerText = stats.mercadolivre || 0;
        document.getElementById('count-shein').innerText = stats.shein || 0;
        elements.platformStats.style.display = 'flex';
    }

    elements.resultsSection.style.display = 'block';
    resetFilters();
    renderGrid(comparison);

    elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetFilters() {
    activeFilter = 'all';
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('filterAll')?.classList.add('active');
}

function renderGrid(products) {
    elements.comparisonGrid.innerHTML = '';
    elements.resultCount.innerText = `(${products.length})`;

    if (products.length === 0) {
        elements.comparisonGrid.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-mask-sad"></i>
                <p>Nenhuma oferta encontrada para este filtro.</p>
                <p class="empty-sub">Tente um termo mais genérico ou limpe os filtros.</p>
            </div>`;
        return;
    }

    products.forEach((product, idx) => {
        const card = document.createElement('div');
        card.className = 'product-card glassy';
        card.style.animationDelay = `${idx * 0.05}s`;

        const platformKey = product.source.toLowerCase().replace(' ', '-');
        const platformEmoji = { shopee: '🛍️', amazon: '📦', 'mercado-livre': '🛒', shein: '✨' }[platformKey] || '🏪';

        const ratingHtml = product.rating
            ? `<div class="rating-tag"><i class="ph ph-star-fill"></i> ${product.rating}</div>`
            : '';

        const commissionHtml = product.commission && product.commission !== 'N/A'
            ? `<div class="commission-tag"><i class="ph ph-trend-up"></i> ${product.commission}</div>`
            : '';

        const originalPriceHtml = product.originalPrice && product.originalPrice > product.price
            ? `<div class="original-price">De R$ ${product.originalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>`
            : '';

        const safeLink = (product.link || '#').replace(/'/g, "\\'");

        card.innerHTML = `
            <div class="card-image-content">
                <img class="card-image" 
                    src="${product.image || ''}" 
                    alt="${product.name}"
                    onerror="this.src='https://placehold.co/200x200/1e293b/94a3b8?text=Sem+Imagem'; this.onerror=null;">
                <div class="platform-badge ${platformKey}">${platformEmoji} ${product.source}</div>
                ${ratingHtml}
            </div>
            <div class="card-body">
                <div class="card-title" title="${product.name}">${product.name}</div>
                <div class="card-meta">
                    <span class="sales-text">
                        <i class="ph ph-shopping-cart"></i> ${product.sales || 'Disponível'}
                    </span>
                    ${commissionHtml}
                </div>
                <div class="card-footer">
                    <div class="price-box">
                        ${originalPriceHtml}
                        <div class="current-price">
                            <span class="currency">R$</span>
                            <span class="price-value">${product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-copy" onclick="copyLink('${safeLink}')" title="Copiar link">
                            <i class="ph ph-copy"></i>
                        </button>
                        <button class="btn-buy" onclick="handleBuy('${safeLink}')" title="Ver oferta">
                            <i class="ph ph-arrow-right"></i>
                        </button>
                    </div>
                </div>
            </div>`;

        elements.comparisonGrid.appendChild(card);
    });
}

function handleBuy(link) {
    if (!link || link === '#') return;
    showToast('Abrindo oferta... ✅');
    setTimeout(() => window.open(link, '_blank'), 400);
}

function copyLink(link) {
    if (!link || link === '#') return;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link copiado! 📋');
    }).catch(() => {
        showToast('Não foi possível copiar.');
    });
}

function showToast(message) {
    elements.toast.innerText = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2500);
}

// ===== EVENT LISTENERS =====

elements.analyzeBtn.addEventListener('click', analyzeLink);
elements.linkInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') analyzeLink();
});

// Atualiza ícone do input baseado se é link ou texto
elements.linkInput.addEventListener('input', () => {
    const val = elements.linkInput.value.trim();
    const icon = document.getElementById('inputIcon');
    if (val.startsWith('http')) {
        icon.className = 'ph ph-link';
    } else {
        icon.className = 'ph ph-magnifying-glass';
    }
});

// Quick tags
document.querySelectorAll('.quick-tag').forEach(tag => {
    tag.addEventListener('click', () => {
        elements.linkInput.value = tag.dataset.query;
        analyzeLink();
    });
});

// Filtros
document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelector('.filter-chip.active')?.classList.remove('active');
        chip.classList.add('active');

        const filter = chip.dataset.filter;
        activeFilter = filter;

        if (filter === 'all') {
            renderGrid(currentComparison);
        } else if (filter === 'price') {
            const sorted = [...currentComparison].sort((a, b) => a.price - b.price);
            renderGrid(sorted);
        } else {
            // Filtro por plataforma (ex: "shopee", "amazon", "mercado livre", "shein")
            const filtered = currentComparison.filter(p =>
                p.source.toLowerCase() === filter
            );
            renderGrid(filtered);
        }
    });
});
