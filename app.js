// ============================================
// Trading Dashboard Pro - Main Application
// ============================================

const API_BASE = 'https://finnhub.io/api/v1';

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
    if (!state.apiKey) {
        document.getElementById('apiModal').classList.add('active');
        return;
    }
    
    initApp();
});

async function initApp() {
    loadSettings();
    updateMarketStatus();
    renderWatchlist();
    selectStock(state.selectedStock);
    setupEventListeners();
    
    // Refresh data every 30 seconds
    setInterval(refreshPrices, 30000);
    
    // Check market status every minute
    setInterval(updateMarketStatus, 60000);
}

function loadSettings() {
    document.getElementById('settingsApiKey').value = state.apiKey;
}

// ============================================
// API CALLS
// ============================================

async function apiCall(endpoint, params = {}) {
    if (!state.apiKey) {
        document.getElementById('apiModal').classList.add('active');
        return null;
    }
    
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.set('token', state.apiKey);
    
    Object.keys(params).forEach(key => {
        url.searchParams.set(key, params[key]);
    });
    
    try {
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showNotification('Fehler beim Laden der Daten', 'error');
        return null;
    }
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
        const changeClass = priceData && priceData.change >= 0 ? 'positive' : (priceData ? 'negative' : '');
        const changeSymbol = priceData && priceData.change >= 0 ? '+' : '';
        
        item.innerHTML = `
            <div>
                <div class="symbol">${stock.symbol}</div>
                <div class="name">${stock.name}</div>
            </div>
            <div class="price-section">
                ${priceData ? `
                    <span class="price">${priceData.price.toFixed(2)}</span>
                    <span class="change ${changeClass}">${changeSymbol}${priceData.change.toFixed(2)}%</span>
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
        const data = await apiCall('/quote', { symbol });
        if (data) {
            state.prices[symbol] = data;
        }
    }
    
    renderWatchlist();
    
    // Update selected stock display
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
    const data = await apiCall('/quote', { symbol });
    if (data) {
        state.prices[symbol] = data;
        updateStockHeader(data);
    }
}

function updateStockHeader(data) {
    const stock = state.watchlist.find(s => s.symbol === state.selectedStock);
    
    document.getElementById('selectedStock').textContent = state.selectedStock;
    document.getElementById('selectedStockName').textContent = stock ? stock.name : '';
    
    const price = data.c || data.pc;
    const change = data.dp || 0;
    const changeValue = data.d || 0;
    
    document.getElementById('currentPrice').textContent = `$${price.toFixed(2)}`;
    
    const changeEl = document.getElementById('priceChange');
    const sign = changeValue >= 0 ? '+' : '';
    changeEl.className = `change ${changeValue >= 0 ? 'positive' : 'negative'}`;
    changeEl.textContent = `${sign}$${changeValue.toFixed(2)} (${sign}${change.toFixed(2)}%)`;
    
    document.getElementById('openPrice').textContent = `$${(data.o || '--').toFixed(2)}`;
    document.getElementById('dayHigh').textContent = `$${(data.h || '--').toFixed(2)}`;
    document.getElementById('dayLow').textContent = `$${(data.l || '--').toFixed(2)}`;
    
    if (data.v) {
        document.getElementById('volume').textContent = formatVolume(data.v);
    }
}

async function loadChart(symbol) {
    const canvas = document.getElementById('priceChart');
    const range = state.timeframe;
    
    // Determine parameters based on range
    let params = { symbol };
    let labels = [], data = [];
    let endTime = Math.floor(Date.now() / 1000);
    let startTime;
    
    switch (range) {
        case '1D':
            startTime = endTime - 86400;
            break;
        case '5D':
            startTime = endTime - 432000;
            break;
        case '1M':
            startTime = endTime - 2592000;
            break;
        case '3M':
            startTime = endTime - 7776000;
            break;
        case '6M':
            startTime = endTime - 15552000;
            break;
        case '1Y':
            startTime = endTime - 31536000;
            break;
        case '5Y':
            startTime = endTime - 157680000;
            break;
    }
    
    params.from = startTime;
    params.to = endTime;
    params.resolution = range === '1D' || range === '5D' ? 5 : 60;
    
    const chartData = await apiCall('/stock/candle', params);
    
    if (!chartData || chartData.s !== 'ok') return;
    
    // Process data
    const timestamps = chartData.t || [];
    const closes = chartData.c || [];
    
    for (let i = 0; i < timestamps.length; i++) {
        const date = new Date(timestamps[i] * 1000);
        labels.push(formatDate(date, range));
        data.push(closes[i]);
    }
    
    // Update or create chart
    if (chart) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
    } else {
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        const isPositive = data.length > 0 && data[data.length - 1] >= data[0];
        const mainColor = isPositive ? '#00c853' : '#ff3d00';
        const shadowColor = isPositive ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 61, 0, 0.3)';
        
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
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
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
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#6b8299',
                            maxTicksLimit: 8,
                            maxRotation: 0
                        }
                    },
                    y: {
                        position: 'right',
                        grid: {
                            color: 'rgba(45, 66, 88, 0.5)'
                        },
                        ticks: {
                            color: '#6b8299',
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }
}

// ============================================
// NEWS & SENTIMENT
// ============================================

async function loadNews(symbol) {
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    const newsData = await apiCall('/company-news', {
        symbol: symbol,
        from: Math.floor(Date.now() / 1000) - 86400000,
        to: Math.floor(Date.now() / 1000),
        pagesize: 20
    });
    
    if (!newsData || newsData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-newspaper"></i>
                <p>Keine Nachrichten verfügbar</p>
            </div>
        `;
        return;
    }
    
    // Group by category and analyze sentiment
    const news = newsData.map(item => ({
        ...item,
        id: item.url,
        sentiment: analyzeSentiment(item.summary + ' ' + item.headline),
        saved: state.savedNews[item.url] || false,
        tags: extractTags(item.summary + ' ' + item.headline),
        timeAgo: getTimeAgo(new Date(item.datetime * 1000))
    }));
    
    // Sort by sentiment (extremes first)
    news.sort((a, b) => {
        const sentimentOrder = { 'bullish': -1, 'bearish': 0, 'neutral': 1 };
        return sentimentOrder[a.sentiment.type] - sentimentOrder[b.sentiment.type];
    });
    
    renderNews(container, news);
}

function renderNews(container, news) {
    // Add filter bar
    container.innerHTML = `
        <div class="news-filter-bar">
            <button class="filter-btn active" data-filter="all">Alle</button>
            <button class="filter-btn" data-filter="bullish">Bullish</button>
            <button class="filter-btn" data-filter="bearish">Bearish</button>
            <button class="filter-btn" data-filter="neutral">Neutral</button>
            <button class="filter-btn" data-filter="saved">Gespeichert</button>
        </div>
    `;
    
    // Add filter handlers
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
            
            // Remove old news cards
            const oldCards = container.querySelectorAll('.news-card');
            oldCards.forEach(c => c.remove());
            
            filtered.slice(0, 10).forEach(item => {
                itemsContainer.appendChild(createNewsCard(item));
            });
        });
    });
    
    // Render first 10 news
    const itemsContainer = document.createElement('div');
    container.appendChild(itemsContainer);
    
    news.slice(0, 10).forEach(item => {
        itemsContainer.appendChild(createNewsCard(item));
    });
}

function createNewsCard(news) {
    const card = document.createElement('div');
    card.className = `news-card sentiment-${news.sentiment.type}`;
    
    const sentimentLabel = {
        'bullish': 'Bullish',
        'bearish': 'Bearish',
        'neutral': 'Neutral'
    }[news.sentiment.type];
    
    card.innerHTML = `
        <div class="news-header">
            <span class="news-source">${news.source || 'Unknown'}</span>
            <span class="news-date">${news.timeAgo}</span>
        </div>
        <h3 class="news-title">${news.headline || ''}</h3>
        <p class="news-excerpt">${news.summary || 'Keine Zusammenfassung verfügbar.'}</p>
        <div class="news-footer">
            <span class="sentiment-badge ${news.sentiment.type}">
                ${sentimentLabel} (${Math.round(news.sentiment.confidence * 100)}%)
            </span>
            <div class="news-tags">
                ${news.sentiment.keywords.slice(0, 3).map(k => `<span class="news-tag">${k}</span>`).join('')}
            </div>
        </div>
        <div class="news-actions">
            <button class="news-action-btn ${news.saved ? 'saved' : ''}" data-url="${news.id}">
                ${news.saved ? '✓ Gespeichert' : '♡ Speichern'}
            </button>
            <a href="${news.url}" target="_blank" class="news-action-btn">
                📖 Lesen
            </a>
            <button class="news-action-btn" data-share="${news.headline}">
                📤 Teilen
            </button>
        </div>
    `;
    
    // Add event listeners
    const saveBtn = card.querySelector('.news-action-btn[data-url]');
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSaveNews(news.id, saveBtn);
    });
    
    const shareBtn = card.querySelector('.news-action-btn[data-share]');
    shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shareNews(news);
    });
    
    return card;
}

// ============================================
// SENTIMENT ANALYSIS
// ============================================

function analyzeSentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Bullish indicators
    const bullish = [
        'gain', 'rise', 'rally', 'surge', 'growth', 'profit', 'record', 'beat',
        'strong', 'bull', 'buy', 'upgrade', 'positive', 'optimistic', 'demand',
        'innovation', 'breakthrough', 'momentum', 'outperform', 'dividend',
        'expansion', 'recovery', 'high', 'target', 'opportunity', 'success',
        'gewinn', 'anstieg', 'wachstum', 'stark', 'kursziel', 'kaufempfehlung',
        'superior', 'leading', 'excellent', 'outstanding'
    ];
    
    // Bearish indicators
    const bearish = [
        'drop', 'fall', 'decline', 'loss', 'crash', 'weak', 'bear', 'sell',
        'downgrade', 'negative', 'pessimistic', 'risk', 'concern', 'threat',
        'layoff', 'cut', 'miss', 'below', 'slump', 'downturn', 'recession',
        'debt', 'fraud', 'scandal', 'lawsuit', 'investigation', 'bankruptcy',
        'verlust', 'rückgang', 'schwäche', 'risiko', 'abwertung', 'pleite',
        'krisen', 'sanktionen', 'strafe', 'untersuchung'
    ];
    
    let bullishScore = 0;
    let bearishScore = 0;
    const keywords = [];
    
    bullish.forEach(word => {
        const regex = new RegExp(word, 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
            bullishScore += matches.length;
            if (keywords.length < 5) keywords.push(word);
        }
    });
    
    bearish.forEach(word => {
        const regex = new RegExp(word, 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
            bearishScore += matches.length;
            if (keywords.length < 5) keywords.push(word);
        }
    });
    
    const total = bullishScore + bearishScore;
    
    if (bullishScore > bearishScore) {
        return {
            type: 'bullish',
            confidence: total > 0 ? Math.min(bullishScore / (total * 0.5), 1) : 0.5,
            keywords: keywords
        };
    } else if (bearishScore > bullishScore) {
        return {
            type: 'bearish',
            confidence: total > 0 ? Math.min(bearishScore / (total * 0.5), 1) : 0.5,
            keywords: keywords
        };
    } else {
        return {
            type: 'neutral',
            confidence: 0.5,
            keywords: keywords.length > 0 ? keywords : ['keine signifikanten Hinweise']
        };
    }
}

function extractTags(text) {
    const tags = [];
    const commonTerms = ['und', 'der', 'die', 'das', 'ein', 'eine', 'is', 'are', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = [...new Set(words.filter(w => w.length > 3 && !commonTerms.includes(w)))];
    
    return uniqueWords.slice(0, 5);
}

// ============================================
// NEWS ACTIONS
// ============================================

function toggleSaveNews(url, btn) {
    if (state.savedNews[url]) {
        delete state.savedNews[url];
        btn.textContent = '♡ Speichern';
        btn.classList.remove('saved');
    } else {
        state.savedNews[url] = true;
        btn.textContent = '✓ Gespeichert';
        btn.classList.add('saved');
    }
    
    localStorage.setItem('saved_news', JSON.stringify(state.savedNews));
    showNotification('Nachricht gespeichert!', 'success');
}

async function shareNews(news) {
    if (navigator.share) {
        try {
            await navigator.share({
                title: news.headline,
                text: news.summary,
                url: news.url
            });
        } catch (err) {
            console.log('Share cancelled');
        }
    } else {
        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(`${news.headline} - ${news.url}`);
            showNotification('In die Zwischenablage kopiert!', 'success');
        } catch (err) {
            showNotification('Fehler beim Kopieren', 'error');
        }
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // API Key modal
    document.getElementById('saveApiKey').addEventListener('click', () => {
        const key = document.getElementById('apiKeyInput').value.trim();
        if (key) {
            state.apiKey = key;
            localStorage.setItem('finnhub_api_key', key);
            document.getElementById('apiModal').classList.remove('active');
            initApp();
        }
    });
    
    // Add stock button
    document.getElementById('addStockBtn').addEventListener('click', () => {
        document.getElementById('addStockModal').classList.add('active');
    });
    
    // Add stock submit
    document.getElementById('addStockSubmit').addEventListener('click', () => {
        const symbol = document.getElementById('symbolInput').value.trim().toUpperCase();
        if (symbol) {
            addStockToWatchlist(symbol);
        }
    });
    
    // Close modals
    document.getElementById('closeAddModal').addEventListener('click', () => {
        document.getElementById('addStockModal').classList.remove('active');
    });
    
    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });
    
    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('active');
        loadSettings();
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
    
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        refreshPrices();
        loadNews(state.selectedStock);
    });
    
    // Timeframe buttons
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
// WATCHLIST MANAGEMENT
// ============================================

async function addStockToWatchlist(symbol) {
    // Check if symbol already exists
    if (state.watchlist.find(s => s.symbol === symbol)) {
        showNotification('Aktie ist bereits in der Watchlist', 'error');
        return;
    }
    
    // Get company name
    const nameData = await apiCall(`/search?q=${symbol}`);
    const name = nameData && nameData.result ? nameData.result[0].description : symbol;
    
    state.watchlist.push({ symbol, name });
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
    
    renderWatchlist();
    selectStock(symbol);
    
    document.getElementById('addStockModal').classList.remove('active');
    document.getElementById('symbolInput').value = '';
    
    showNotification(`${symbol} zur Watchlist hinzugefügt`, 'success');
}

// ============================================
// MARKET STATUS
// ============================================

function updateMarketStatus() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();
    
    // US Market: Mon-Fri, 14:30 - 21:00 UTC
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
// UTILITY FUNCTIONS
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
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
