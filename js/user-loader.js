const UserPage = {
    seasonsConfigPath: 'config/seasons.json',
    seasonStatsPathTemplate: 'data/season_{id}_stats.csv',
    shareBaseUrl: 'https://seekerstart-hp.vercel.app/user.html',
    seasonsConfig: null,
    seasonStatsData: {},
    playerId: null,
    playerName: null,
    playerSeasons: [],
    seasonIds: [],
    currentSeasonIndex: 0,
    seasonChartInstance: null,
    cumulativeChartInstance: null,
    shareState: null,

    async init() {
        this.playerId = this.getPlayerId();
        this.playerName = this.getPlayerName();
        if (!this.playerId && !this.playerName) {
            this.showError('プレイヤーが指定されていません。');
            return;
        }

        try {
            await this.loadSeasonsConfig();
            this.playerSeasons = await this.loadPlayerSeasons();
            if (this.playerSeasons.length === 0) {
                this.showError('プレイヤーが見つかりません。');
                return;
            }

            this.seasonIds = this.getSeasonIds();
            const currentSeasonId = this.getCurrentSeasonId();
            this.currentSeasonIndex = this.getSeasonIndex(currentSeasonId);

            this.setupSeasonNavigator();
            this.setupShareButtons();
            this.renderSeasonHistory(this.playerSeasons);
            if (this.seasonIds.length) {
                await this.renderForSeason(this.seasonIds[this.currentSeasonIndex]);
            }
        } catch (error) {
            console.error('ユーザーページの読み込みに失敗しました:', error);
            this.showError('データの読み込みに失敗しました。');
        }
    },

    getPlayerId() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('player') || params.get('player_id') || params.get('id');
        return this.normalizeId(id);
    },

    getPlayerName() {
        const params = new URLSearchParams(window.location.search);
        const name = params.get('name');
        return this.normalizeName(name);
    },

    normalizeId(value) {
        if (!value) return '';
        return String(value).replace(/^\uFEFF/, '').trim();
    },

    normalizeName(value) {
        if (!value) return '';
        return String(value).replace(/^\uFEFF/, '').trim();
    },

    async loadSeasonsConfig() {
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
            throw new Error('seasons.json not found');
        }
    },

    getCurrentSeasonId() {
        if (this.seasonsConfig && this.seasonsConfig.current_season_id) {
            return this.seasonsConfig.current_season_id;
        }
        if (this.seasonsConfig && this.seasonsConfig.seasons && this.seasonsConfig.seasons.length) {
            return this.seasonsConfig.seasons[0].id;
        }
        return null;
    },

    getSeasonIds() {
        const seasons = (this.seasonsConfig && this.seasonsConfig.seasons) ? this.seasonsConfig.seasons : [];
        return seasons.map(season => season.id).sort((a, b) => a - b);
    },

    getSeasonIndex(seasonId) {
        if (!this.seasonIds.length) return 0;
        const index = this.seasonIds.indexOf(seasonId);
        return index >= 0 ? index : 0;
    },

    getSeasonName(seasonId) {
        const seasons = (this.seasonsConfig && this.seasonsConfig.seasons) ? this.seasonsConfig.seasons : [];
        const season = seasons.find(item => item.id === seasonId);
        let name = season ? season.name : `Season ${seasonId}`;
        if (name.includes('シーズン')) {
            name = name.replace('シーズン', 'Season').replace(/\s+/g, ' ');
        }
        return name;
    },

    setupSeasonNavigator() {
        const prevButton = document.getElementById('season-nav-prev');
        const nextButton = document.getElementById('season-nav-next');
        if (prevButton) {
            prevButton.addEventListener('click', () => this.shiftSeason(-1));
        }
        if (nextButton) {
            nextButton.addEventListener('click', () => this.shiftSeason(1));
        }
    },
    async shiftSeason(direction) {
        if (!this.seasonIds.length) return;
        const count = this.seasonIds.length;
        this.currentSeasonIndex = (this.currentSeasonIndex + direction + count) % count;
        await this.renderForSeason(this.seasonIds[this.currentSeasonIndex]);
    },

    async renderForSeason(seasonId) {
        const seasonRow = this.playerSeasons.find(item => item.seasonId === seasonId) || null;
        const currentSeasonData = seasonId ? await this.loadSeasonStats(seasonId) : [];
        const currentSeasonRank = seasonId
            ? this.getSeasonRank(currentSeasonData, this.playerId, this.playerName)
            : null;
        const currentSeasonTotal = currentSeasonData.length || null;
        const promotionBorder = currentSeasonTotal ? Math.ceil(currentSeasonTotal * 0.4) : null;
        const promotionRow = promotionBorder ? this.getPromotionBorderRow(currentSeasonData, promotionBorder) : null;
        const promotionProfit = promotionRow ? this.formatProfitBB(promotionRow) : null;

        const nameFallback = this.playerSeasons[0]?.row?.['プレイヤー'] || '--';
        const rowData = seasonRow ? seasonRow.row : { 'プレイヤー': nameFallback, 'リーグ': '--', '収支': '', 'ハンド数': '' };
        const seasonName = this.getSeasonName(seasonId);

        this.renderSummary(rowData, currentSeasonRank, currentSeasonTotal, promotionBorder, promotionProfit, seasonId);
        this.renderStats(rowData);
        this.renderSeasonChart(rowData);
        this.renderChart(this.playerSeasons, seasonId);
        this.renderCumulativeStats(this.playerSeasons, seasonId);
        await this.renderCumulativeSummary(seasonId, rowData);

        this.updateShareState({
            seasonId,
            seasonName,
            row: rowData,
            rank: currentSeasonRank,
            total: currentSeasonTotal,
            promotionRank: promotionBorder,
            promotionProfit,
            cumulative: this.getCumulativeTotals(this.playerSeasons, seasonId)
        });
    },

    async loadPlayerSeasons() {
        const seasons = this.getSeasonIds();
        const results = [];

        for (const seasonId of seasons) {
            const data = await this.loadSeasonStats(seasonId);
            const row = this.findPlayerRow(data);
            if (row) {
                results.push({
                    seasonId,
                    seasonName: this.getSeasonName(seasonId),
                    row
                });
            }
        }

        return results;
    },

    findPlayerRow(data) {
        if (!data || !data.length) return null;
        let row = null;
        if (this.playerId) {
            row = data.find(item => this.normalizeId(item['player_id']) === this.normalizeId(this.playerId));
        }
        if (!row && this.playerName) {
            row = data.find(item => this.normalizeName(item['プレイヤー']) === this.normalizeName(this.playerName));
        }
        return row || null;
    },

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
    renderSummary(row, rank, total, promotionRank, promotionProfit, seasonId) {
        const seasonName = this.getSeasonName(seasonId);
        const summaryText = document.getElementById('season-summary-text');
        if (summaryText) summaryText.textContent = `${seasonName} 戦績`;

        const league = row['リーグ'] || '--';
        const name = row['プレイヤー'] || '--';
        const sessions = this.getSessionCount(row);
        const hands = this.formatCount(row['ハンド数']);
        const profit = this.formatProfitBB(row);

        const leagueEl = document.getElementById('user-league');
        if (leagueEl) leagueEl.textContent = `LEAGUE ${league}`;
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = name;

        const sessionEl = document.getElementById('season-sessions');
        if (sessionEl) sessionEl.textContent = sessions ? sessions : '--';

        const rankEl = document.getElementById('user-season-rank');
        if (rankEl) rankEl.textContent = `${rank || '--'}/${total || '--'}`;

        const rankSub = document.getElementById('promotion-border-rank');
        if (rankSub) rankSub.textContent = `昇格圏: ${promotionRank ? `${promotionRank}位` : '--'}`;

        const profitEl = document.getElementById('current-profit');
        if (profitEl) profitEl.textContent = profit;

        const profitSub = document.getElementById('promotion-border-profit');
        if (profitSub) profitSub.textContent = `昇格圏: ${promotionProfit || '--'}`;

        const handsEl = document.getElementById('current-hands');
        if (handsEl) handsEl.textContent = hands;
    },

    renderStats(row) {
        const statsGrid = document.getElementById('stats-grid');
        if (!statsGrid) return;

        const stats = [
            { label: 'VPIP', value: row['VPIP'] },
            { label: 'PFR', value: row['PFR'] },
            { label: '3bet', value: row['3bet'] },
            { label: 'Fold to 3bet', value: row['Fold to 3bet'] },
            { label: 'CB', value: row['CB'] },
            { label: 'WTSD', value: row['WTSD'] },
            { label: 'W$SD', value: row['W$SD'] }
        ];

        statsGrid.innerHTML = stats.map(stat => {
            const value = this.formatStatValue(this.parseNumber(stat.value));
            return `
                <div class="bg-black/40 border border-white/10 p-4 text-center">
                    <div class="text-[11px] text-gray-500 tracking-[0.4em] uppercase">${this.escapeHtml(stat.label)}</div>
                    <div class="text-[1.35rem] font-black text-white mt-2">${value !== '--' ? `${value}%` : '--'}</div>
                </div>
            `;
        }).join('');
    },

    renderSeasonChart(row) {
        const canvas = document.getElementById('season-chart');
        const emptyEl = document.getElementById('season-chart-empty');
        if (!canvas || !window.Chart) return;

        const series = this.getWeeklySeries(row);
        if (!series.length) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (this.seasonChartInstance) {
                this.seasonChartInstance.destroy();
                this.seasonChartInstance = null;
            }
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');

        const labels = series.map(item => `第${item.week}週`);
        const profitData = series.map(item => item.profit ?? 0);
        const handData = series.map(item => item.hands ?? 0);

        if (this.seasonChartInstance) {
            this.seasonChartInstance.destroy();
        }

        this.seasonChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '収支BB',
                        data: profitData,
                        borderColor: '#D4AF37',
                        backgroundColor: 'rgba(212,175,55,0.12)',
                        yAxisID: 'y',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3
                    },
                    {
                        label: 'ハンド数',
                        data: handData,
                        borderColor: '#9CA3AF',
                        backgroundColor: 'rgba(156,163,175,0.15)',
                        yAxisID: 'y1',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        title: { display: true, text: '収支BB' },
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'ハンド数' },
                        ticks: { color: '#9CA3AF' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    },

    renderChart(playerSeasons, seasonId) {
        const canvas = document.getElementById('cumulative-chart');
        if (!canvas || !window.Chart) return;

        let totalHands = 0;
        let totalBB = 0;
        const points = [];

        const filtered = seasonId
            ? playerSeasons.filter(item => item.seasonId <= seasonId)
            : playerSeasons;

        filtered.forEach(item => {
            const row = item.row;
            const hands = this.parseNumber(row['ハンド数']);
            const bbValue = this.getProfitBBValue(row);
            totalHands += hands;
            totalBB += bbValue;
            points.push({ x: totalHands, y: Number(totalBB.toFixed(2)) });
        });

        if (this.cumulativeChartInstance) {
            this.cumulativeChartInstance.destroy();
        }

        this.cumulativeChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: '累計収支BB',
                        data: points,
                        borderColor: '#D4AF37',
                        backgroundColor: 'rgba(212,175,55,0.1)',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.25
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'ハンド数' },
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        title: { display: true, text: '収支BB' },
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    },

    renderCumulativeStats(playerSeasons, seasonId) {
        const grid = document.getElementById('cumulative-stats-grid');
        if (!grid) return;

        const stats = [
            { label: 'VPIP', key: 'VPIP', handsKey: 'VPIP_hands' },
            { label: 'PFR', key: 'PFR', handsKey: 'PFR_hands' },
            { label: '3bet', key: '3bet', handsKey: '3bet_hands' },
            { label: 'Fold to 3bet', key: 'Fold to 3bet', handsKey: 'Fold to 3bet_hands' },
            { label: 'CB', key: 'CB', handsKey: 'CB_hands' },
            { label: 'WTSD', key: 'WTSD', handsKey: 'WTSD_hands' },
            { label: 'W$SD', key: 'W$SD', handsKey: 'W$SD_hands' }
        ];

        const filtered = seasonId
            ? playerSeasons.filter(item => item.seasonId <= seasonId)
            : playerSeasons;

        grid.innerHTML = stats.map(stat => {
            const weighted = this.getWeightedStat(filtered, stat.key, stat.handsKey);
            const value = this.formatStatValue(weighted.value);
            return `
                <div class="bg-black/40 border border-white/10 p-4 text-center">
                    <div class="text-[11px] text-gray-500 tracking-[0.4em] uppercase">${this.escapeHtml(stat.label)}</div>
                    <div class="text-[1.35rem] font-black text-white mt-2">${value !== '--' ? `${value}%` : '--'}</div>
                </div>
            `;
        }).join('');
    },
    async renderCumulativeSummary(seasonId, rowData) {
        const leaderboard = await this.buildCumulativeLeaderboard(seasonId);
        const total = leaderboard.length || null;
        let rank = null;
        let entry = null;

        if (this.playerId) {
            entry = leaderboard.find(item => this.normalizeId(item.playerId) === this.normalizeId(this.playerId));
        }
        if (!entry && this.playerName) {
            entry = leaderboard.find(item => this.normalizeName(item.name) === this.normalizeName(this.playerName));
        }
        if (entry) {
            rank = leaderboard.indexOf(entry) + 1;
        }

        const cumulativeTotals = this.getCumulativeTotals(this.playerSeasons, seasonId);
        const league = rowData['リーグ'] || entry?.league || '--';
        const name = rowData['プレイヤー'] || entry?.name || '--';
        const sessions = entry ? entry.sessions : cumulativeTotals.sessions;
        const profit = entry ? this.formatBBValue(entry.profit) : this.formatBBValue(cumulativeTotals.bb);
        const hands = entry ? this.formatCount(entry.hands, true) : this.formatCount(cumulativeTotals.hands, true);

        const leagueEl = document.getElementById('cumulative-league');
        if (leagueEl) leagueEl.textContent = `LEAGUE ${league}`;
        const nameEl = document.getElementById('cumulative-name');
        if (nameEl) nameEl.textContent = name;
        const sessionEl = document.getElementById('cumulative-sessions');
        if (sessionEl) sessionEl.textContent = sessions ? sessions : '--';
        const rankEl = document.getElementById('cumulative-rank');
        if (rankEl) rankEl.textContent = `${rank || '--'}/${total || '--'}`;
        const profitEl = document.getElementById('cumulative-profit');
        if (profitEl) profitEl.textContent = profit;
        const handsEl = document.getElementById('cumulative-hands');
        if (handsEl) handsEl.textContent = hands;
    },

    renderSeasonHistory(playerSeasons) {
        const body = document.getElementById('season-history-body');
        if (!body) return;

        if (!playerSeasons.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="4" class="py-8 text-center text-gray-500">データがありません。</td>
                </tr>
            `;
            return;
        }

        const rows = [...playerSeasons]
            .sort((a, b) => a.seasonId - b.seasonId)
            .map(item => {
                const seasonName = this.getSeasonName(item.seasonId);
                const league = this.escapeHtml(item.row['リーグ'] || '--');
                const profit = this.escapeHtml(this.formatProfitBB(item.row));
                const hands = this.escapeHtml(this.formatCount(item.row['ハンド数'], false));
                return `
                    <tr class="hover:bg-white/5 transition-colors">
                        <td class="py-4 px-3 text-left text-white">${this.escapeHtml(seasonName)}</td>
                        <td class="py-4 px-3 text-center text-gray-300">${league}</td>
                        <td class="py-4 px-3 text-right text-gray-300">${profit}</td>
                        <td class="py-4 px-3 text-right text-gray-300">${hands}</td>
                    </tr>
                `;
            });

        body.innerHTML = rows.join('');
    },

    async buildCumulativeLeaderboard(seasonId) {
        const seasonIds = this.getSeasonIds().filter(id => !seasonId || id <= seasonId);
        const map = new Map();

        for (const id of seasonIds) {
            const data = await this.loadSeasonStats(id);
            data.forEach(row => {
                const key = this.normalizeId(row['player_id']) || this.normalizeName(row['プレイヤー']);
                if (!key) return;

                const entry = map.get(key) || {
                    key,
                    playerId: row['player_id'] || '',
                    name: row['プレイヤー'] || '',
                    league: row['リーグ'] || '',
                    profit: 0,
                    hands: 0,
                    sessions: 0
                };

                entry.playerId = entry.playerId || row['player_id'] || '';
                entry.name = entry.name || row['プレイヤー'] || '';
                entry.league = row['リーグ'] || entry.league;
                entry.profit += this.getProfitBBValue(row);
                entry.hands += this.parseNumber(row['ハンド数']);
                entry.sessions += this.getSessionCount(row);

                map.set(key, entry);
            });
        }

        return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
    },

    getCumulativeTotals(playerSeasons, seasonId) {
        const filtered = seasonId
            ? playerSeasons.filter(item => item.seasonId <= seasonId)
            : playerSeasons;

        return filtered.reduce((acc, item) => {
            acc.bb += this.getProfitBBValue(item.row);
            acc.hands += this.parseNumber(item.row['ハンド数']);
            acc.sessions += this.getSessionCount(item.row);
            return acc;
        }, { bb: 0, hands: 0, sessions: 0 });
    },

    getSeasonRank(seasonData, playerId, playerName) {
        if (!seasonData || seasonData.length === 0) return null;
        const sorted = this.getSortedByProfit(seasonData);
        let index = -1;
        if (playerId) {
            index = sorted.findIndex(item => this.normalizeId(item['player_id']) === this.normalizeId(playerId));
        }
        if (index < 0 && playerName) {
            index = sorted.findIndex(item => this.normalizeName(item['プレイヤー']) === this.normalizeName(playerName));
        }
        return index >= 0 ? index + 1 : null;
    },

    getPromotionBorderRow(seasonData, promotionRank) {
        if (!seasonData || seasonData.length === 0) return null;
        const sorted = this.getSortedByProfit(seasonData);
        const index = Math.max(0, promotionRank - 1);
        return sorted[index] || null;
    },

    getSortedByProfit(seasonData) {
        return [...seasonData].sort((a, b) => this.getProfitChipsValue(b) - this.getProfitChipsValue(a));
    },

    getSessionCount(row) {
        if (!row) return 0;
        const keys = Object.keys(row);
        const weekHandKeys = keys.filter(key => /(week|週|節)/i.test(key) && /(hand|ハンド)/i.test(key));
        if (weekHandKeys.length) {
            return weekHandKeys.reduce((count, key) => {
                const value = this.parseNumber(row[key]);
                return value > 0 ? count + 1 : count;
            }, 0);
        }
        return this.parseNumber(row['参加節数']);
    },

    formatProfitBB(row) {
        if (!row) return '--';
        const bbValue = this.getProfitBBValue(row);
        const sign = bbValue >= 0 ? '+' : '';
        return `${sign}${bbValue.toFixed(1)} BB`;
    },

    getProfitChipsValue(row) {
        const profitChips = row && row['収支'] ? row['収支'] : '0';
        return parseInt(String(profitChips).replace(/[+,]/g, ''), 10) || 0;
    },

    getProfitBBValue(row) {
        const bbSize = parseInt(row['bb_size'], 10) || 20;
        return this.getProfitChipsValue(row) / bbSize;
    },

    parseNumber(value) {
        if (value === null || value === undefined) return 0;
        const cleaned = String(value).replace(/[^0-9.\-]/g, '');
        const number = Number(cleaned);
        return Number.isNaN(number) ? 0 : number;
    },

    formatCount(value, withUnit = true) {
        const number = this.parseNumber(value);
        if (!number) return '--';
        const formatted = Math.round(number).toLocaleString();
        return withUnit ? `${formatted} hands` : formatted;
    },

    formatBBValue(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '--';
        const sign = value >= 0 ? '+' : '';
        return `${sign}${Number(value).toFixed(1)} BB`;
    },

    formatStatValue(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '--';
        return Number(value).toFixed(2);
    },

    getWeightedStat(items, key, handsKey) {
        let totalHands = 0;
        let weightedSum = 0;

        items.forEach(item => {
            const row = item.row || item;
            const hands = this.parseNumber(row[handsKey]);
            const stat = this.parseNumber(row[key]);
            if (hands > 0 && stat !== null) {
                totalHands += hands;
                weightedSum += stat * hands;
            }
        });

        return {
            value: totalHands ? weightedSum / totalHands : null,
            hands: totalHands
        };
    },

    getWeeklySeries(row) {
        if (!row) return [];
        const keys = Object.keys(row);
        const profitKeys = keys.filter(key => /(week|週|節)/i.test(key) && /(収支|bb)/i.test(key));
        const handKeys = keys.filter(key => /(week|週|節)/i.test(key) && /(hand|ハンド)/i.test(key));
        const map = new Map();
        const getWeek = key => {
            const match = key.match(/(\d+)/);
            return match ? parseInt(match[1], 10) : null;
        };

        profitKeys.forEach(key => {
            const week = getWeek(key);
            if (week === null) return;
            const entry = map.get(week) || {};
            entry.profit = this.parseNumber(row[key]);
            map.set(week, entry);
        });

        handKeys.forEach(key => {
            const week = getWeek(key);
            if (week === null) return;
            const entry = map.get(week) || {};
            entry.hands = this.parseNumber(row[key]);
            map.set(week, entry);
        });

        let series = Array.from(map.entries()).map(([week, data]) => ({
            week,
            profit: data.profit ?? 0,
            hands: data.hands ?? 0
        })).sort((a, b) => a.week - b.week);

        if (!series.length) {
            const totalHands = this.parseNumber(row['ハンド数']);
            const totalBB = this.getProfitBBValue(row);
            if (totalHands > 0 || totalBB !== 0) {
                series = [{ week: 0, profit: totalBB, hands: totalHands }];
            }
        }

        return series;
    },
    updateShareState({ seasonId, seasonName, row, rank, total, promotionRank, promotionProfit, cumulative }) {
        const playerName = row['プレイヤー'] || '--';
        const league = row['リーグ'] || '--';
        const profitBB = this.formatProfitBB(row);
        const hands = this.formatCount(row['ハンド数']);
        const promotionRankText = promotionRank ? `${promotionRank}位` : '--';
        const promotionProfitText = promotionProfit || '--';
        const requiredHands = '400h';

        const seasonUrl = this.buildShareUrl({ seasonId });
        const cumulativeUrl = this.buildShareUrl({ seasonId: null });

        const seasonText = [
            `【鳳凰戦 ${seasonName}】${playerName}`,
            `リーグ：${league}`,
            `順位：${rank || '--'}/${total || '--'}（昇格圏：${promotionRankText} / ${promotionProfitText}）`,
            `収支：${profitBB} / ハンド数：${hands}（規定数：${requiredHands}）`,
            seasonUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const cumulativeText = [
            `【鳳凰戦 累計】${playerName}`,
            `累計収支：${this.formatBBValue(cumulative.bb)} / 累計ハンド数：${this.formatCount(cumulative.hands)}`,
            cumulativeUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const seasonStatsText = this.buildStatsShareText({
            title: `【鳳凰戦 ${seasonName} スタッツ】${playerName}`,
            stats: this.getSeasonStatsForShare(row),
            url: seasonUrl
        });

        const cumulativeStatsText = this.buildStatsShareText({
            title: `【鳳凰戦 累計スタッツ】${playerName}`,
            stats: this.getCumulativeStatsForShare(seasonId),
            url: cumulativeUrl
        });

        this.shareState = {
            seasonId,
            seasonUrl,
            cumulativeUrl,
            seasonText,
            cumulativeText,
            seasonStatsText,
            cumulativeStatsText
        };

        const seasonX = document.getElementById('share-season-x');
        const cumulativeX = document.getElementById('share-cumulative-x');
        const seasonStatsX = document.getElementById('share-season-stats-x');
        const cumulativeStatsX = document.getElementById('share-cumulative-stats-x');
        if (seasonX) seasonX.href = this.buildXShareUrl(seasonText);
        if (cumulativeX) cumulativeX.href = this.buildXShareUrl(cumulativeText);
        if (seasonStatsX) seasonStatsX.href = this.buildXShareUrl(seasonStatsText);
        if (cumulativeStatsX) cumulativeStatsX.href = this.buildXShareUrl(cumulativeStatsText);
    },

    buildShareUrl({ seasonId }) {
        const params = new URLSearchParams();
        if (this.playerId) {
            params.set('player', this.playerId);
        }
        if (seasonId) {
            params.set('season', String(seasonId));
        }
        const query = params.toString();
        return query ? `${this.shareBaseUrl}?${query}` : this.shareBaseUrl;
    },

    buildXShareUrl(text) {
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    },

    buildStatsShareText({ title, stats, url }) {
        const lines = [title];
        if (stats) {
            lines.push(`VPIP ${stats.vpip}% / PFR ${stats.pfr}% / 3bet ${stats.threeBet}%`);
            lines.push(`CB ${stats.cb}% / Fold to 3bet ${stats.fold3bet}%`);
            lines.push(`WTSD ${stats.wtsd}% / W$SD ${stats.wsd}%`);
        }
        lines.push(url);
        lines.push('#ポーカー鳳凰戦');
        return lines.join('\n');
    },

    getSeasonStatsForShare(row) {
        return {
            vpip: this.formatStatValue(this.parseNumber(row['VPIP'])),
            pfr: this.formatStatValue(this.parseNumber(row['PFR'])),
            threeBet: this.formatStatValue(this.parseNumber(row['3bet'])),
            cb: this.formatStatValue(this.parseNumber(row['CB'])),
            fold3bet: this.formatStatValue(this.parseNumber(row['Fold to 3bet'])),
            wtsd: this.formatStatValue(this.parseNumber(row['WTSD'])),
            wsd: this.formatStatValue(this.parseNumber(row['W$SD']))
        };
    },

    getCumulativeStatsForShare(seasonId) {
        const filtered = seasonId
            ? this.playerSeasons.filter(item => item.seasonId <= seasonId)
            : this.playerSeasons;

        const weighted = (key, handsKey) => this.getWeightedStat(filtered, key, handsKey).value;

        return {
            vpip: this.formatStatValue(weighted('VPIP', 'VPIP_hands')),
            pfr: this.formatStatValue(weighted('PFR', 'PFR_hands')),
            threeBet: this.formatStatValue(weighted('3bet', '3bet_hands')),
            cb: this.formatStatValue(weighted('CB', 'CB_hands')),
            fold3bet: this.formatStatValue(weighted('Fold to 3bet', 'Fold to 3bet_hands')),
            wtsd: this.formatStatValue(weighted('WTSD', 'WTSD_hands')),
            wsd: this.formatStatValue(weighted('W$SD', 'W$SD_hands'))
        };
    },

    setupShareButtons() {
        const seasonCopy = document.getElementById('share-season-copy');
        const cumulativeCopy = document.getElementById('share-cumulative-copy');
        const seasonStatsCopy = document.getElementById('share-season-stats-copy');
        const cumulativeStatsCopy = document.getElementById('share-cumulative-stats-copy');
        if (seasonCopy) {
            seasonCopy.addEventListener('click', () => this.copyShareLink('season'));
        }
        if (cumulativeCopy) {
            cumulativeCopy.addEventListener('click', () => this.copyShareLink('cumulative'));
        }
        if (seasonStatsCopy) {
            seasonStatsCopy.addEventListener('click', () => this.copyShareLink('seasonStats'));
        }
        if (cumulativeStatsCopy) {
            cumulativeStatsCopy.addEventListener('click', () => this.copyShareLink('cumulativeStats'));
        }
    },

    async copyShareLink(mode) {
        if (!this.shareState) return;
        const mapping = {
            season: { url: this.shareState.seasonUrl, statusId: 'share-season-status' },
            cumulative: { url: this.shareState.cumulativeUrl, statusId: 'share-cumulative-status' },
            seasonStats: { url: this.shareState.seasonUrl, statusId: 'share-season-stats-status' },
            cumulativeStats: { url: this.shareState.cumulativeUrl, statusId: 'share-cumulative-stats-status' }
        };
        const entry = mapping[mode] || mapping.season;
        const statusEl = document.getElementById(entry.statusId);
        try {
            await navigator.clipboard.writeText(entry.url);
            if (statusEl) statusEl.textContent = 'コピーしました';
        } catch (error) {
            if (statusEl) statusEl.textContent = 'コピーに失敗しました';
        }
        if (statusEl) {
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    },

    showError(message) {
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = message;

        const leagueEl = document.getElementById('user-league');
        if (leagueEl) leagueEl.textContent = '';
    },

    escapeHtml(str) {
        if (str === null || str === undefined) return '--';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UserPage.init();
});
