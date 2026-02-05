/**
 * Stats Loader - CSVファイルからプレイヤースタッツを読み込みで表示
 * シーズン切り替えとリーグ表示に対応
 */

const StatsLoader = {
    // CSV繝代せ險ｭ螳・
    allStatsPath: 'data/all_stats.csv',
    seasonStatsPathTemplate: 'data/season_{id}_stats.csv',
    seasonsConfigPath: 'config/seasons.json',

    // 繝・・繧ｿ繧ｭ繝｣繝・す繝･
    seasonsConfig: null,
    allStatsData: null,
    seasonStatsData: {},
    currentView: 'all',  // 'all' 縺ｾ縺溘・ season id
    pageMode: null,  // 'season', 'all', 縺ｾ縺溘・ null・亥ｾ捺擂蜍穂ｽ懶ｼ・

    // 繧ｽ繝ｼ繝郁ｨｭ螳・
    currentSortColumn: '収支',  // 繝・ヵ繧ｩ繝ｫ繝医・収支縺ｧ繧ｽ繝ｼ繝・
    currentSortOrder: 'desc',  // desc: 髯埼・ asc: 譏・・

    /**
     * 蛻晄悄蛹・
     */
    async init() {
        try {
            // 繧ｫ繧ｹ繧ｿ繝繝代せ縺瑚ｨｭ螳壹＆繧後※縺・ｋ蝣ｴ蜷医・荳頑嶌縺・
            if (window.CUSTOM_STATS_PATH) {
                this.allStatsPath = window.CUSTOM_STATS_PATH;
            }

            // 繝壹・繧ｸ繝｢繝ｼ繝峨ｒ蜿門ｾ・
            this.pageMode = window.STATS_PAGE_MODE || null;

            // 繧ｷ繝ｼ繧ｺ繝ｳ險ｭ螳壹ｒ隱ｭ縺ｿ霎ｼ縺ｿ
            await this.loadSeasonsConfig();

            // 繝壹・繧ｸ繝｢繝ｼ繝峨↓蠢懊§縺溷・譛溷喧
            if (this.pageMode === 'all') {
                // 蜈ｨ譛滄俣蟆ら畑繝｢繝ｼ繝会ｼ壹ち繝悶↑縺励∝・譛滄俣繝・・繧ｿ縺ｮ縺ｿ
                this.hideSeasonTabs();
                const data = await this.loadAllStats();
                this.renderTable(data);
                this.updateSummary(data);
            } else if (this.pageMode === 'season') {
                // 繧ｷ繝ｼ繧ｺ繝ｳ蟆ら畑繝｢繝ｼ繝会ｼ壹す繝ｼ繧ｺ繝ｳ繧ｿ繝悶・縺ｿ
                this.renderSeasonOnlyTabs();
                // 譛蛻昴・繧ｷ繝ｼ繧ｺ繝ｳ縺ｾ縺溘・迴ｾ蝨ｨ縺ｮ繧ｷ繝ｼ繧ｺ繝ｳ繧定｡ｨ遉ｺ
                const firstSeasonId = this.getDefaultSeasonId();
                if (firstSeasonId) {
                    const data = await this.loadSeasonStats(firstSeasonId);
                    this.currentView = firstSeasonId;
                    this.renderTable(data);
                    this.updateSummary(data);
                } else {
                    this.showNoSeasonMessage();
                }
                this.setupTabEvents();
            } else {
                // 蠕捺擂蜍穂ｽ懶ｼ壼・譛滄俣 + 繧ｷ繝ｼ繧ｺ繝ｳ繧ｿ繝・
                this.renderTabs();
                const data = await this.loadAllStats();
                this.renderTable(data);
                this.updateSummary(data);
                this.setupTabEvents();
            }
        } catch (error) {
            console.error('スタッツデータ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆:', error);
            this.showError();
        }
    },

    /**
     * 繝・ヵ繧ｩ繝ｫ繝医・繧ｷ繝ｼ繧ｺ繝ｳID繧貞叙蠕・
     */
    getDefaultSeasonId() {
        if (!this.seasonsConfig || !this.seasonsConfig.seasons || this.seasonsConfig.seasons.length === 0) {
            return null;
        }
        // current_season_id 縺後≠繧後・縺昴ｌ繧剃ｽｿ逕ｨ縲√↑縺代ｌ縺ｰ譛蛻昴・繧ｷ繝ｼ繧ｺ繝ｳ
        if (this.seasonsConfig.current_season_id) {
            return this.seasonsConfig.current_season_id;
        }
        return this.seasonsConfig.seasons[0].id;
    },

    /**
     * 繧ｷ繝ｼ繧ｺ繝ｳ繧ｿ繝悶ｒ髱櫁｡ｨ遉ｺ
     */
    hideSeasonTabs() {
        const tabContainer = document.getElementById('season-tabs');
        if (tabContainer) {
            tabContainer.style.display = 'none';
        }
    },

    /**
     * 繧ｷ繝ｼ繧ｺ繝ｳ蟆ら畑繧ｿ繝悶ｒ逕滓・・亥・譛滄俣縺ｪ縺暦ｼ・
     */
    renderSeasonOnlyTabs() {
        const tabContainer = document.getElementById('season-tabs');
        if (!tabContainer) return;

        if (!this.seasonsConfig || !this.seasonsConfig.seasons || this.seasonsConfig.seasons.length === 0) {
            tabContainer.innerHTML = '';
            return;
        }

        let tabsHtml = '';
        const defaultSeasonId = this.getDefaultSeasonId();

        this.seasonsConfig.seasons.forEach((season, index) => {
            const isActive = season.id === defaultSeasonId;
            tabsHtml += `
                <button class="season-tab${isActive ? ' active' : ''}" data-season="${season.id}">
                    ${this.escapeHtml(season.name)}
                </button>
            `;
        });

        tabContainer.innerHTML = tabsHtml;
    },

    /**
     * 繧ｷ繝ｼ繧ｺ繝ｳ繝・・繧ｿ縺後↑縺・ｴ蜷医・繝｡繝・そ繝ｼ繧ｸ繧定｡ｨ遉ｺ
     */
    showNoSeasonMessage() {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="py-12 text-center text-gray-500">
                    <i class="fas fa-calendar-xmark text-2xl mb-4 block text-gold/50"></i>
                    シーズンデータがありません。
                </td>
            </tr>
        `;
    },

    /**
     * 繧ｷ繝ｼ繧ｺ繝ｳ險ｭ螳壹ｒ隱ｭ縺ｿ霎ｼ縺ｿ
     */
    async loadSeasonsConfig() {
        try {
            if (window.EMBEDDED_SEASONS_CONFIG) {
                this.seasonsConfig = window.EMBEDDED_SEASONS_CONFIG;
                return;
            }
            if (window.EMBEDDED_SEASON_STATS) {
                const ids = Object.keys(window.EMBEDDED_SEASON_STATS)
                    .map(key => {
                        if (key.startsWith('season_')) {
                            return parseInt(key.replace('season_', ''), 10);
                        }
                        return parseInt(key, 10);
                    })
                    .filter(id => !Number.isNaN(id))
                    .sort((a, b) => a - b);
                this.seasonsConfig = {
                    seasons: ids.map(id => ({
                        id,
                        name: `Season ${id}`,
                        status: 'active'
                    })),
                    current_season_id: ids.length ? ids[0] : null
                };
                return;
            }
            const response = await fetch(this.seasonsConfigPath);
            if (response.ok) {
                this.seasonsConfig = await response.json();
            } else {
                // 險ｭ螳壹ヵ繧｡繧､繝ｫ縺後↑縺・ｴ蜷医・繝・ヵ繧ｩ繝ｫ繝・
                this.seasonsConfig = {
                    seasons: [],
                    current_season_id: null
                };
            }
        } catch (error) {
            console.warn('繧ｷ繝ｼ繧ｺ繝ｳ險ｭ螳壹・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨・', error);
            this.seasonsConfig = {
                seasons: [],
                current_season_id: null
            };
        }
    },

    /**
     * 蜈ｨ譛滄俣繧ｹ繧ｿ繝・ヤ繧定ｪｭ縺ｿ霎ｼ縺ｿ
     */
    async loadAllStats() {
        if (this.allStatsData) {
            return this.allStatsData;
        }
        console.log('Loading stats from:', this.allStatsPath);
        const response = await fetch(this.allStatsPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        this.allStatsData = this.parseCSV(csvText);
        return this.allStatsData;
    },

    /**
     * 繧ｷ繝ｼ繧ｺ繝ｳ蛻･繧ｹ繧ｿ繝・ヤ繧定ｪｭ縺ｿ霎ｼ縺ｿ
     */
    async loadSeasonStats(seasonId) {
        if (window.EMBEDDED_SEASON_STATS) {
            const numericId = Number(seasonId);
            const seasonKey = Number.isFinite(numericId)
                ? `season_${numericId}`
                : (typeof seasonId === 'string' && seasonId.startsWith('season_') ? seasonId : null);
            const embedded = window.EMBEDDED_SEASON_STATS[seasonId]
                || (seasonKey ? window.EMBEDDED_SEASON_STATS[seasonKey] : null);
            if (embedded) {
                return embedded;
            }
        }
        if (this.seasonStatsData[seasonId]) {
            return this.seasonStatsData[seasonId];
        }
        const path = this.seasonStatsPathTemplate.replace('{id}', seasonId);
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        this.seasonStatsData[seasonId] = this.parseCSV(csvText);
        return this.seasonStatsData[seasonId];
    },

    /**
     * CSV譁・ｭ怜・繧偵ヱ繝ｼ繧ｹ縺励※繧ｪ繝悶ず繧ｧ繧ｯ繝磯・蛻励↓螟画鋤
     */
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header.trim()] = values[index].trim();
                });
                data.push(row);
            }
        }

        return data;
    },

    /**
     * CSV陦後ｒ繝代・繧ｹ・医き繝ｳ繝槭ｒ蜷ｫ繧蛟､縺ｫ蟇ｾ蠢懶ｼ・
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);
        return values;
    },

    /**
     * 繧ｿ繝悶ｒ逕滓・
     */
    renderTabs() {
        const tabContainer = document.getElementById('season-tabs');
        if (!tabContainer) return;

        let tabsHtml = `
            <button class="season-tab active" data-season="all">
                蜈ｨ譛滄俣
            </button>
        `;

        if (this.seasonsConfig && this.seasonsConfig.seasons) {
            this.seasonsConfig.seasons.forEach(season => {
                tabsHtml += `
                    <button class="season-tab" data-season="${season.id}">
                        ${this.escapeHtml(season.name)}
                    </button>
                `;
            });
        }

        tabContainer.innerHTML = tabsHtml;
    },

    /**
     * 繧ｿ繝悶け繝ｪ繝・け繧､繝吶Φ繝医ｒ險ｭ螳・
     */
    setupTabEvents() {
        const tabs = document.querySelectorAll('.season-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', async (e) => {
                // 繧｢繧ｯ繝・ぅ繝也憾諷九ｒ譖ｴ譁ｰ
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                const seasonId = e.target.dataset.season;
                this.currentView = seasonId;

                try {
                    let data;
                    if (seasonId === 'all') {
                        data = await this.loadAllStats();
                    } else {
                        data = await this.loadSeasonStats(seasonId);
                    }
                    this.renderTable(data);
                    this.updateSummary(data);
                } catch (error) {
                    console.error('繝・・繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨・', error);
                    this.showError();
                }
            });
        });
    },

    /**
     * 繧ｹ繧ｿ繝・ヤ蛟､縺ｨハンド数繧堤ｵ・∩蜷医ｏ縺帙◆陦ｨ遉ｺ繧堤函謌・
     */
    formatStatWithHands(statValue, handsValue) {
        const stat = this.escapeHtml(statValue);
        const hands = this.escapeHtml(handsValue);
        if (hands && hands !== '--' && hands !== '0') {
            return `${stat}%<br><span class="text-gray-500 text-xs">[${hands}]</span>`;
        }
        return `${stat}%`;
    },

    /**
     * 繝・・繧ｿ繧偵た繝ｼ繝・
     */
    sortData(data, column, order) {
        return [...data].sort((a, b) => {
            let valA, valB;

            if (column === '収支') {
                // 収支縺ｯ "+1000" 繧・"-500" 縺ｮ譁・ｭ怜・縺ｪ縺ｮ縺ｧ謨ｰ蛟､縺ｫ螟画鋤・医メ繝・・謨ｰ・・                valA = parseInt((a[column] || '0').replace(/[+,]/g, ''), 10) || 0;
                valB = parseInt((b[column] || '0').replace(/[+,]/g, ''), 10) || 0;
            } else if (column === 'ハンド数' || column.includes('_hands')) {
                // ハンド数縺ｯ謨ｰ蛟､
                valA = parseInt(a[column], 10) || 0;
                valB = parseInt(b[column], 10) || 0;
            } else if (column === 'プレイヤー' || column === 'リーグ') {
                // 譁・ｭ怜・
                valA = a[column] || '';
                valB = b[column] || '';
            } else {
                // 繧ｹ繧ｿ繝・ヤ蛟､・医ヱ繝ｼ繧ｻ繝ｳ繝・・繧ｸ・・
                valA = parseFloat(a[column]) || 0;
                valB = parseFloat(b[column]) || 0;
            }

            if (order === 'asc') {
                return valA > valB ? 1 : valA < valB ? -1 : 0;
            } else {
                return valA < valB ? 1 : valA > valB ? -1 : 0;
            }
        });
    },

    /**
     * 繝・・繝悶Ν縺ｫ繝・・繧ｿ繧呈緒逕ｻ
     */
    renderTable(data) {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        // 収支の降順で固定ソート（仕様）
        const sortedData = [...data].sort((a, b) => this.getProfitChipsValue(b) - this.getProfitChipsValue(a));

        sortedData.forEach((player, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-white/5 transition-colors';

            // 鬆・ｽ搾ｼ医う繝ｳ繝・ャ繧ｯ繧ｹ + 1・・
            const rank = index + 1;

            // 収支繧達B謨ｰ縺ｫ螟画鋤・亥推陦後・bb_size繧剃ｽｿ逕ｨ・・
            const profitChips = player['収支'] || '0';
            const bbSize = parseInt(player['bb_size']) || 20;  // 繝・ヵ繧ｩ繝ｫ繝・0
            const chipsNum = this.getProfitChipsValue(player);
            const profitBB = chipsNum / bbSize;
            const sign = chipsNum >= 0 ? '+' : '';
            const profitBBStr = `${sign}${profitBB.toFixed(1)} BB`;

            const profitClass = chipsNum >= 0
                ? 'text-green-400'
                : 'text-red-400';

            // リーグ繝舌ャ繧ｸ
            const league = player['リーグ'] || 'C';
            const leagueBadge = this.getLeagueBadge(league);

            const playerId = player['player_id'] || '';
            const rawPlayerName = player['プレイヤー'] || '';
            const playerName = this.escapeHtml(rawPlayerName);
            const playerLink = playerId
                ? `<a href="user.html?player=${encodeURIComponent(playerId)}" class="text-white hover:text-gold transition underline-offset-4 hover:underline">${playerName}</a>`
                : playerName;

            row.innerHTML = `
                <td class="py-4 px-3 text-center text-gold font-bold text-sm">${rank}</td>
                <td class="py-4 px-3 text-white font-bold text-sm whitespace-nowrap">${playerLink}</td>
                <td class="py-4 px-3 text-center">${leagueBadge}</td>
                <td class="py-4 px-3 text-right text-sm font-mono ${profitClass}">${this.escapeHtml(profitBBStr)}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['ハンド数'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['VPIP'], player['VPIP_hands'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['PFR'], player['PFR_hands'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['3bet'], player['3bet_hands'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['Fold to 3bet'], player['Fold to 3bet_hands'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['CB'], player['CB_hands'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['WTSD'], player['WTSD_hands'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.formatStatWithHands(player['W$SD'], player['W$SD_hands'])}</td>
            `;

            tbody.appendChild(row);
        });
    },

    /**
     * リーグ繝舌ャ繧ｸ繧堤函謌・
     */
    getLeagueBadge(league) {
        const badges = {
            'A': '<span class="league-badge league-a">A</span>',
            'B': '<span class="league-badge league-b">B</span>',
            'C': '<span class="league-badge league-c">C</span>',
        };
        return badges[league] || badges['C'];
    },

    /**
     * 収支(チップ)を数値化
     */
    getProfitChipsValue(row) {
        const profitChips = row && row['収支'] ? row['収支'] : '0';
        return parseInt(String(profitChips).replace(/[+,]/g, ''), 10) || 0;
    },

    /**
     * 繧ｵ繝槭Μ繝ｼ諠・ｱ繧呈峩譁ｰ
     */
    updateSummary(data) {
        // 邱丞盾蜉閠・焚
        const totalPlayers = document.getElementById('total-players');
        if (totalPlayers) {
            totalPlayers.textContent = data.length;
        }

        // 邱上ワ繝ｳ繝画焚
        const totalHands = document.getElementById('total-hands');
        if (totalHands) {
            const sum = data.reduce((acc, player) => {
                return acc + (parseInt(player['ハンド数'], 10) || 0);
            }, 0);
            totalHands.textContent = sum.toLocaleString();
        }

        // 髢句ぎ蝗樊焚・医す繝ｼ繧ｺ繝ｳ謨ｰ縺ｨ縺励※陦ｨ遉ｺ・・
        const totalSessions = document.getElementById('total-sessions');
        if (totalSessions && this.seasonsConfig) {
            const activeSeasons = this.seasonsConfig.seasons.filter(
                s => s.status === 'active'
            ).length;
            totalSessions.textContent = activeSeasons || '--';
        }
    },

    /**
     * 繧ｨ繝ｩ繝ｼ陦ｨ遉ｺ
     */
    showError() {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="py-12 text-center text-gray-500">
                    <i class="fas fa-exclamation-triangle text-2xl mb-4 block text-red-400/50"></i>
                    繝・・繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・br>
                    縺励・繧峨￥邨後▲縺ｦ縺九ｉ蜀榊ｺｦ縺願ｩｦ縺励￥縺縺輔＞縲・
                </td>
            </tr>
        `;
    },

    /**
     * HTML繧ｨ繧ｹ繧ｱ繝ｼ繝暦ｼ・SS蟇ｾ遲厄ｼ・
     */
    escapeHtml(str) {
        if (str === null || str === undefined) return '--';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// DOMContentLoaded譎ゅ↓蛻晄悄蛹・
document.addEventListener('DOMContentLoaded', () => {
    StatsLoader.init();
});
