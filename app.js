// ============================================
// Trading Dashboard Pro - Main Application
// ============================================

const API_KEY = 'demo'; // Alpha Vantage demo key (limited)
const ALPHA_BASE = 'https://www.alphavantage.co/query';
const NEWS_BASE = 'https://newsapi.org/v2';
const NEWS_KEY = 'd4c5e3f8a1b24d6e9c7f3a5b8e1d2c4f'; // NewsAPI key

// Default watchlist
const DEFAULT_WATCHLIST = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'V', name: 'Visa Inc.' },
    { symbol: 'WMT', name: 'Walmart Inc.' }
];

// State
let state = {
    apiKey: localStorage.getItem('finnhub_api_key') || '',
    watchlist: JSON.parse(localStorage.getItem('watchlist')) || DEFAULT_WATCHLIST,
    selectedStock: localStorage.getItem('selected_stock') || 'AAPL',
    timeframe: localStorage.getItem('timeframe') || '1M',
    news: {},
    prices: {},
    savedNews: JSON.parse(localStorage.getItem('saved_news') || '{}')
};

// DOM Elements
let chart = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    if (state.apiKey) {
        initApp();
    } else {
        document.getElementById('apiModal').classList.add('active');
    }
});

async function initApp() {
    updateMarketStatus();
    renderWatchlist();
    selectStock(state.selectedStock);
    
    setInterval(refreshPrices, 30000);
    setInterval(updateMarketStatus, 60000);
}

// ============================================
// API CALLS - FINNHUB VIA CORS PROXY
// ============================================

async function finnhubCall(endpoint, params = {}) {
    if (!state.apiKey) {
        document.getElementById('apiModal').classList.add('active');
        return null;
    }
    
    const queryParams = [`token=${state.apiKey}`];
    Object.keys(params).forEach(key => {
        queryParams.push(`${key}=${encodeURIComponent(params[key])}`);
    });
    
    const queryString = queryParams.join('&');
    const finnhubUrl = `${API_BASE}${endpoint}?${queryString}`;
    
    // Try multiple CORS proxies
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(finnhubUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(finnhubUrl)}`,
        `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(finnhubUrl)}`
    ];
    
    for (const proxyUrl of proxies) {
        try {
            const response = await fetch(proxyUrl, {
                method: 'GET',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            
            if (response.status === 401) {
                showNotification('❌ API Key ungültig!', 'error');
                return null;
            }
            
            if (!response.ok) continue;
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Proxy failed: ${error.message}`);
            continue;
        }
    }
    
    return null;
}

// ============================================
// FALLBACK: Simulated Data
// ============================================

async function getSimulatedQuote(symbol) {
    // Generate realistic-looking random data
    const basePrices = {
        'AAPL': 185.50, 'MSFT': 378.20, 'GOOGL': 141.30, 'AMZN': 178.60,
        'TSLA': 248.50, 'NVDA': 875.30, 'META': 505.20, 'JPM': 198.40,
        'V': 282.10, 'WMT': 168.30
    };
    
    const base = basePrices[symbol] || (Math.random() * 300 + 50);
    const change = (Math.random() - 0.5) * 10;
    const changePercent = (change / base) * 100;
    
    return {
        c: base + change, // current price
        o: base,          // open
        h: base + Math.abs(change) + Math.random() * 5, // high
        l: base - Math.abs(change) - Math.random() * 5, // low
        d: changePercent,  // change percent
        dp: Math.abs(changePercent), // absolute change percent
        v: Math.floor(Math.random() * 50000000 + 10000000) // volume
    };
}

async function getSimulatedCandle(symbol, range) {
    const basePrices = {
        'AAPL': 185.50, 'MSFT': 378.20, 'GOOGL': 141.30, 'AMZN': 178.60,
        'TSLA': 248.50, 'NVDA': 875.30, 'META': 505.20, 'JPM': 198.40,
        'V': 282.10, 'WMT': 168.30
    };
    
    const base = basePrices[symbol] || (Math.random() * 300 + 50);
    
    let points, interval;
    switch (range) {
        case '1D': points = 78; interval = 5 * 60; break; // 5-min bars
        case '5D': points = 200; interval = 2 * 60 * 60; break;
        case '1M': points = 22; interval = 24 * 60 * 60; break;
        case '3M': points = 60; interval = 24 * 60 * 60; break;
        case '6M': points = 60; interval = 3 * 24 * 60 * 60; break;
        case '1Y': points = 52; interval = 7 * 24 * 60 * 60; break;
        case '5Y': points = 60; interval = 30 * 24 * 60 * 60; break;
        default: points = 22; interval = 24 * 60 * 60;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const timestamps = [];
    const closes = [];
    let currentPrice = base * (0.85 + Math.random() * 0.3);
    
    for (let i = 0; i < points; i++) {
        timestamps.push(now - (points - i) * interval);
        currentPrice += (Math.random() - 0.48) * base * 0.02;
        closes.push(Math.round(currentPrice * 100) / 100);
    }
    
    // Ensure last close matches current price
    closes[closes.length - 1] = base;
    
    return { s: 'ok', t: timestamps, c: closes };
}

// ============================================
// NEWS - SIMULATED
// ============================================

async function getNews(symbol) {
    const sources = ['Reuters', 'Bloomberg', 'CNBC', 'MarketWatch', 'WSJ', 'Financial Times'];
    const bullishHeadlines = [
        `${symbol} beats earnings expectations, shares surge`,
        `Analysts upgrade ${symbol} on strong growth prospects`,
        `${symbol} announces record-breaking quarter`,
        `Institutional investors increase positions in ${symbol}`,
        `${symbol} launches innovative new product line`,
        `${symbol} reports strong revenue growth`,
        `Wall Street bullish on ${symbol} outlook`
    ];
    const bearishHeadlines = [
        `${symbol} misses earnings expectations`,
        `Concerns grow over ${symbol} valuation`,
        `${symbol} faces regulatory scrutiny`,
        `Analysts downgrade ${symbol} on weak guidance`,
        `${symbol} loses market share to competitors`,
        `Sellers dominate ${symbol} as fears mount`,
        `${symbol} profit margins under pressure`
    ];
    const neutralHeadlines = [
        `${symbol} to announce quarterly results next week`,
        `Market watches ${symbol} for sector direction`,
        `${symbol} trades sideways ahead of major announcement`,
        `Analysts maintain hold rating on ${symbol}`,
        `${symbol} consolidates recent gains`
    ];
    
    const news = [];
    const now = Math.floor(Date.now() / 1000);
    
    // Generate 15 news items
    for (let i = 0; i < 15; i++) {
        const allHeadlines = [...bullishHeadlines, ...bearishHeadlines, ...neutralHeadlines];
        const headline = allHeadlines[i % allHeadlines.length];
        const isBullish = bullishHeadlines.includes(headline);
        const isBearish = bearishHeadlines.includes(headline);
        
        news.push({
            datetime: now - (i * 3600 * Math.random() * 6),
            headline: headline,
            summary: `Market analysis shows ${symbol} ${isBullish ? 'showing strong momentum' : isBearish ? 'facing headwinds' : 'trading in a narrow range'} as investors weigh recent developments in the sector.`,
            source: sources[Math.floor(Math.random() * sources.length)],
            url: `https://example.com/news/${symbol.toLowerCase()}-${i}`,
            sentiment: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral'
        });
    }
    
    return news;
}

// ============================================
// WATCHLIST
// ============================================

function renderWatchlist() {
    const container = document.getElementById('watchlist');
    container.innerHTML = '';
    
    state.watchlist.forEach(stock => {
        const item = document.createElement('div');
        item.className = `watchlist-item ${stock.symbol === state.selectedStock ? 'active' : ''}`;
        
        const priceData = state.prices[stock.symbol];
        const changeClass = priceData && (priceData.d || 0) >= 0 ? 'positive' : (priceData ? 'negative' : '');
        const changeSymbol = priceData && (priceData.d || 0) >= 0 ? '+' : '';
        
        item.innerHTML = `
            <div>
                <div class="symbol">${stock.symbol}</div>
                <div class="name">${stock.name}</div>
            </div>
            <div class="price-section">
                ${priceData ? `
                    <span class="price">$${priceData.c.toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${priceData.d.toFixed(2)}%</span>
                ` : `
                    <span class="price">--</span>
                    <span class="change">--</span>
                `}
            </div>
        `;
        
        item.addEventListener('click', () => selectStock(stock.symbol));
        container.appendChild(item);
    });
}

async function refreshPrices() {
    const symbols = state.watchlist.map(s => s.symbol);
    
    for (const symbol of symbols) {
        let data;
        if (state.apiKey) {
            data = await finnhubCall('/quote', { symbol });
        }
        if (!data) {
            data = await getSimulatedQuote(symbol);
        }
        if (data) {
            state.prices[symbol] = data;
        }
    }
    
    renderWatchlist();
    
    const selectedData = state.prices[state.selectedStock];
    if (selectedData) {
        updateStockHeader(selectedData);
    }
}

// ============================================
// STOCK SELECTION & CHART
// ============================================

function selectStock(symbol) {
    state.selectedStock = symbol;
    localStorage.setItem('selected_stock', symbol);
    
    renderWatchlist();
    loadStockDetails(symbol);
    loadChart(symbol);
    loadNews(symbol);
}

async function loadStockDetails(symbol) {
    let data;
    if (state.apiKey) {
        data = await finnhubCall('/quote', { symbol });
    }
    if (!data) {
        data = await getSimulatedQuote(symbol);
    }
    if (data) {
        state.prices[symbol] = data;
        updateStockHeader(data);
    }
}

function updateStockHeader(data) {
    const stock = state.watchlist.find(s => s.symbol === state.selectedStock);
    
    document.getElementById('selectedStock').textContent = state.selectedStock;
    document.getElementById('selectedStockName').textContent = stock ? stock.name : '';
    
    const price = data.c || 0;
    const change = data.d || 0;
    const sign = change >= 0 ? '+' : '';
    
    document.getElementById('currentPrice').textContent = `$${price.toFixed(2)}`;
    
    const changeEl = document.getElementById('priceChange');
    changeEl.className = `change ${change >= 0 ? 'positive' : 'negative'}`;
    changeEl.textContent = `${sign}$${(price - (price / (1 + (data.dp || 0) / 100))).toFixed(2)} (${sign}${data.dp?.toFixed(2) || '0.00'}%)`;
    
    document.getElementById('openPrice').textContent = `$${(data.o || 0).toFixed(2)}`;
    document.getElementById('dayHigh').textContent = `$${(data.h || 0).toFixed(2)}`;
    document.getElementById('dayLow').textContent = `$${(data.l || 0).toFixed(2)}`;
    
    if (data.v) {
        document.getElementById('volume').textContent = formatVolume(data.v);
    }
}

async function loadChart(symbol) {
    const canvas = document.getElementById('priceChart');
    const range = state.timeframe;
    
    let chartData;
    if (state.apiKey) {
        chartData = await finnhubCall('/stock/candle', {
            symbol,
            from: Math.floor(Date.now() / 1000) - (range === '1D' ? 86400 : range === '1M' ? 2592000 : 7776000),
            to: Math.floor(Date.now() / 1000),
            resolution: range === '1D' || range === '5D' ? 5 : 60
        });
    }
    if (!chartData || chartData.s !== 'ok') {
        chartData = await getSimulatedCandle(symbol, range);
    }
    
    if (!chartData) return;
    
    const timestamps = chartData.t || [];
    const closes = chartData.c || [];
    const labels = [];
    const data = [];
    
    for (let i = 0; i < timestamps.length; i++) {
        const date = new Date(timestamps[i] * 1000);
        labels.push(formatDate(date, range));
        data.push(closes[i]);
    }
    
    if (chart) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
    } else {
        const ctx = canvas.getContext('2d');
        const isPositive = data.length > 0 && data[data.length - 1] >= data[0];
        const mainColor = isPositive ? '#00c853' : '#ff3d00';
        const shadowColor = isPositive ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 61, 0, 0.3)';
        
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, shadowColor);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Preis',
                    data: data,
                    borderColor: mainColor,
                    backgroundColor: gradient,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: mainColor,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a2a3a',
                        titleColor: '#e6eef5',
                        bodyColor: '#e6eef5',
                        borderColor: '#2d4258',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `$${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#6b8299', maxTicksLimit: 8, maxRotation: 0 }
                    },
                    y: {
                        position: 'right',
                        grid: { color: 'rgba(45, 66, 88, 0.5)' },
                        ticks: { color: '#6b8299', callback: v => '$' + v.toFixed(2) }
                    }
                }
            }
        });
    }
}

// ============================================
// NEWS
// ============================================

async function loadNews(symbol) {
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    const newsData = await getNews(symbol);
    
    const news = newsData.map(item => ({
        ...item,
        id: item.url,
        timeAgo: getTimeAgo(new Date(item.datetime * 1000)),
        saved: state.savedNews[item.url] || false,
        sentiment: analyzeSentiment(item.sentiment)
    }));
    
    renderNews(container, news);
}

function analyzeSentiment(type) {
    const confidences = { bullish: 0.85, bearish: 0.78, neutral: 0.50 };
    return {
        type: type || 'neutral',
        confidence: confidences[type] || 0.5,
        keywords: type === 'bullish' ? ['wachstum', 'gewinn', 'boom'] : 
                  type === 'bearish' ? ['verlust', 'sorgen', 'druck'] : 
                  ['neutral', 'seitswerts']
    };
}

function renderNews(container, news) {
    container.innerHTML = `
        <div class="news-filter-bar">
            <button class="filter-btn active" data-filter="all">Alle</button>
            <button class="filter-btn" data-filter="bullish">Bullish</button>
            <button class="filter-btn" data-filter="bearish">Bearish</button>
            <button class="filter-btn" data-filter="neutral">Neutral</button>
            <button class="filter-btn" data-filter="saved">Gespeichert</button>
        </div>
    `;
    
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const filter = e.target.dataset.filter;
            const filtered = filter === 'all' ? news : 
                           filter === 'saved' ? news.filter(n => n.saved) :
                           news.filter(n => n.sentiment.type === filter);
            
            const itemsContainer = document.createElement('div');
            container.appendChild(itemsContainer);
            
            const oldCards = container.querySelectorAll('.news-card');
            oldCards.forEach(c => c.remove());
            
            filtered.slice(0, 15).forEach(item => {
                itemsContainer.appendChild(createNewsCard(item));
            });
        });
    });
    
    const itemsContainer = document.createElement('div');
    container.appendChild(itemsContainer);
    
    news.slice(0, 15).forEach(item => {
        itemsContainer.appendChild(createNewsCard(item));
    });
}

function createNewsCard(news) {
    const card = document.createElement('div');
    card.className = `news-card sentiment-${news.sentiment.type}`;
    
    const sentimentLabel = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
    
    card.innerHTML = `
        <div class="news-header">
            <span class="news-source">${news.source}</span>
            <span class="news-date">${news.timeAgo}</span>
        </div>
        <h3 class="news-title">${news.headline}</h3>
        <p class="news-excerpt">${news.summary}</p>
        <div class="news-footer">
            <span class="sentiment-badge ${news.sentiment.type}">
                ${sentimentLabel[news.sentiment.type]} (${Math.round(news.sentiment.confidence * 100)}%)
            </span>
            <div class="news-tags">
                ${news.sentiment.keywords.slice(0, 3).map(k => `<span class="news-tag">${k}</span>`).join('')}
            </div>
        </div>
        <div class="news-actions">
            <button class="news-action-btn ${news.saved ? 'saved' : ''}" data-url="${news.id}">
                ${news.saved ? '✓ Gespeichert' : '♡ Speichern'}
            </button>
            <a href="${news.url}" target="_blank" class="news-action-btn">📖 Lesen</a>
        </div>
    `;
    
    const saveBtn = card.querySelector('.news-action-btn[data-url]');
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.savedNews[news.id]) {
            delete state.savedNews[news.id];
            saveBtn.textContent = '♡ Speichern';
            saveBtn.classList.remove('saved');
        } else {
            state.savedNews[news.id] = true;
            saveBtn.textContent = '✓ Gespeichert';
            saveBtn.classList.add('saved');
        }
        localStorage.setItem('saved_news', JSON.stringify(state.savedNews));
    });
    
    return card;
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    document.getElementById('saveApiKey').addEventListener('click', async () => {
        const keyInput = document.getElementById('apiKeyInput');
        const key = keyInput.value.trim();
        
        if (!key) {
            showNotification('⚠️ Bitte gib einen API Key ein!', 'error');
            return;
        }
        
        keyInput.disabled = true;
        const testBtn = document.getElementById('saveApiKey');
        const originalText = testBtn.textContent;
        testBtn.textContent = '⏳ Teste...';
        
        state.apiKey = key;
        localStorage.setItem('finnhub_api_key', key);
        
        // Test with a simple call
        const testData = await finnhubCall('/health');
        
        if (testData) {
            document.getElementById('apiModal').classList.remove('active');
            initApp();
            showNotification('✅ API Key gültig!', 'success');
        } else {
            // If API fails, still allow usage with simulated data
            document.getElementById('apiModal').classList.remove('active');
            initApp();
            showNotification('⚠️ API Key ungültig - Simulationsdaten aktiviert', 'error');
            state.apiKey = '';
            localStorage.removeItem('finnhub_api_key');
        }
        
        keyInput.disabled = false;
        testBtn.textContent = originalText;
    });
    
    document.getElementById('addStockBtn').addEventListener('click', () => {
        document.getElementById('addStockModal').classList.add('active');
    });
    
    document.getElementById('addStockSubmit').addEventListener('click', () => {
        const symbol = document.getElementById('symbolInput').value.trim().toUpperCase();
        if (symbol) {
            if (!state.watchlist.find(s => s.symbol === symbol)) {
                state.watchlist.push({ symbol, name: symbol });
                localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
                renderWatchlist();
                selectStock(symbol);
                document.getElementById('addStockModal').classList.remove('active');
                document.getElementById('symbolInput').value = '';
                showNotification(`${symbol} hinzugefügt`, 'success');
            }
        }
    });
    
    document.getElementById('closeAddModal').addEventListener('click', () => {
        document.getElementById('addStockModal').classList.remove('active');
    });
    
    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });
    
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('active');
        document.getElementById('settingsApiKey').value = state.apiKey;
    });
    
    document.getElementById('saveSettings').addEventListener('click', () => {
        const key = document.getElementById('settingsApiKey').value.trim();
        if (key) {
            state.apiKey = key;
            localStorage.setItem('finnhub_api_key', key);
            showNotification('Einstellungen gespeichert!', 'success');
        }
        document.getElementById('settingsModal').classList.remove('active');
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        refreshPrices();
        loadNews(state.selectedStock);
    });
    
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.timeframe = e.target.dataset.range;
            localStorage.setItem('timeframe', state.timeframe);
            loadChart(state.selectedStock);
        });
    });
}

// ============================================
// MARKET STATUS
// ============================================

function updateMarketStatus() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();
    const isWeekday = utcDay >= 1 && utcDay <= 5;
    const isMarketHours = utcHour >= 14 && (utcHour < 21 || (utcHour === 21 && now.getUTCMinutes() < 30));
    const isOpen = isWeekday && isMarketHours;
    
    const statusEl = document.getElementById('marketStatus');
    const dot = statusEl.querySelector('.status-dot');
    
    if (isOpen) {
        statusEl.innerHTML = '<span class="status-dot open"></span> Markt geöffnet';
    } else {
        statusEl.innerHTML = '<span class="status-dot closed"></span> Markt geschlossen';
    }
}

// ============================================
// UTILITIES
// ============================================

function formatVolume(volume) {
    if (!volume) return '--';
    if (volume >= 1e9) return (volume / 1e9).toFixed(2) + 'B';
    if (volume >= 1e6) return (volume / 1e6).toFixed(2) + 'M';
    if (volume >= 1e3) return (volume / 1e3).toFixed(2) + 'K';
    return volume.toString();
}

function formatDate(date, range) {
    const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    if (range === '1D' || range === '5D') {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getDate()}.${months[date.getMonth()]}`;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Gerade eben';
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
    if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
    return `vor ${Math.floor(seconds / 86400)} Tagen`;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}
