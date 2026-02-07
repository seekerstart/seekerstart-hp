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
    currentSeasonId: null,
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
            this.setupImageButtons();
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

    getSeasonMeta(seasonId) {
        const seasons = (this.seasonsConfig && this.seasonsConfig.seasons) ? this.seasonsConfig.seasons : [];
        return seasons.find(item => item.id === seasonId) || null;
    },

    getSeasonName(seasonId) {
        const season = this.getSeasonMeta(seasonId);
        let name = season ? season.name : `Season ${seasonId}`;
        if (name.includes('シーズン')) {
            name = name.replace('シーズン', 'Season').replace(/\s+/g, ' ');
        }
        return name;
    },

    getSeasonShortName(seasonId) {
        const numericId = Number(seasonId);
        if (Number.isFinite(numericId)) {
            return `Season${numericId}`;
        }
        const name = this.getSeasonName(seasonId);
        const match = name.match(/(\d+)/);
        return match ? `Season${match[1]}` : name.replace(/\s+/g, '');
    },

    getSeasonStatusLabel(seasonId) {
        const season = this.getSeasonMeta(seasonId);
        if (!season) return '暫定';
        if (season.display_status) return season.display_status;
        if (season.status === 'final' || season.status === 'confirmed' || season.status === 'closed') {
            return '確定';
        }
        if (season.status === 'upcoming') return '暫定';
        return '暫定';
    },

    getSeasonRules(seasonId, league) {
        const seasons = (this.seasonsConfig && this.seasonsConfig.seasons) ? this.seasonsConfig.seasons : [];
        const season = seasons.find(item => item.id === seasonId);
        const rules = season && season.rules ? season.rules : {};
        const leagueRules = (rules.league_rules && league && rules.league_rules[league]) ? rules.league_rules[league] : null;
        const merged = { ...rules };
        if (merged.league_rules) delete merged.league_rules;
        if (leagueRules && typeof leagueRules === 'object') {
            Object.assign(merged, leagueRules);
        }
        return merged;
    },

    getRuleValue(rules, key, fallback) {
        if (!rules || rules[key] === undefined || rules[key] === null) return fallback;
        if (Number.isNaN(rules[key])) return fallback;
        return rules[key];
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
        this.currentSeasonId = seasonId;
        const seasonRow = this.playerSeasons.find(item => item.seasonId === seasonId) || null;
        const currentSeasonData = seasonId ? await this.loadSeasonStats(seasonId) : [];
        const currentSeasonRank = seasonId
            ? this.getSeasonRank(currentSeasonData, this.playerId, this.playerName)
            : null;
        const currentSeasonTotal = currentSeasonData.length || null;

        const nameFallback = this.playerSeasons[0]?.row?.['プレイヤー'] || '--';
        const rowData = seasonRow ? seasonRow.row : { 'プレイヤー': nameFallback, 'リーグ': '--', '収支': '', 'ハンド数': '' };
        const league = rowData['リーグ'] || '--';
        const rules = this.getSeasonRules(seasonId, league);
        const leagueRankInfo = this.getLeagueRankInfo(currentSeasonData, league, this.playerId, this.playerName);
        const promotionRate = this.getRuleValue(rules, 'promotion_rate', 0.4);
        const promotionBorder = (currentSeasonTotal && promotionRate && promotionRate > 0)
            ? Math.min(currentSeasonTotal, Math.max(1, Math.ceil(currentSeasonTotal * promotionRate)))
            : null;
        const promotionRow = promotionBorder ? this.getPromotionBorderRow(currentSeasonData, promotionBorder) : null;
        const promotionProfit = promotionRow ? this.formatProfitBB(promotionRow) : null;

        const seasonName = this.getSeasonName(seasonId);

        this.renderSummary({
            row: rowData,
            rank: currentSeasonRank,
            total: currentSeasonTotal,
            leagueRank: leagueRankInfo.rank,
            leagueTotal: leagueRankInfo.total,
            seasonId,
            rules
        });
        this.renderLeagueConditions({ row: rowData, seasonData: currentSeasonData, rank: currentSeasonRank, rules });
        this.renderStats(rowData);
        this.renderSeasonChart(rowData);
        this.renderChart(this.playerSeasons, seasonId);
        this.renderCumulativeStats(this.playerSeasons, seasonId);
        const cumulativeSummary = await this.renderCumulativeSummary(seasonId, rowData);

        this.updateShareState({
            seasonId,
            seasonName,
            row: rowData,
            rank: currentSeasonRank,
            total: currentSeasonTotal,
            leagueRank: leagueRankInfo.rank,
            leagueTotal: leagueRankInfo.total,
            seasonData: currentSeasonData,
            promotionRank: promotionBorder,
            promotionProfit,
            cumulativeSummary,
            rules
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
    renderSummary({ row, rank, total, leagueRank, leagueTotal, seasonId, rules }) {
        const seasonLabel = this.getSeasonShortName(seasonId);
        const statusLabel = this.getSeasonStatusLabel(seasonId);

        const seasonLabelEl = document.getElementById('season-current-label');
        if (seasonLabelEl) seasonLabelEl.textContent = seasonLabel;

        const statusEl = document.getElementById('season-status-label');
        if (statusEl) statusEl.textContent = statusLabel;

        const league = row['リーグ'] || '--';
        const name = row['プレイヤー'] || '--';
        const sessions = this.getSessionCount(row);
        const hands = this.formatCount(row['ハンド数'], false);
        const profit = this.formatProfitBB(row);
        const leagueLabel = this.formatLeagueLabel(league);
        const rankText = this.formatRankText(rank, total);
        const leagueRankText = this.formatRankText(leagueRank, leagueTotal);

        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = name;

        const badgeEl = document.getElementById('user-league-badge');
        if (badgeEl) {
            const normalizedLeague = this.normalizeLeague(league);
            badgeEl.textContent = normalizedLeague || '--';
            badgeEl.classList.remove('league-a', 'league-b', 'league-c');
            if (normalizedLeague === 'A') badgeEl.classList.add('league-a');
            if (normalizedLeague === 'B') badgeEl.classList.add('league-b');
            if (normalizedLeague === 'C') badgeEl.classList.add('league-c');
        }

        const summaryLeagueRankEl = document.getElementById('summary-season-league-rank');
        if (summaryLeagueRankEl) summaryLeagueRankEl.textContent = leagueRankText;
        const summaryRankEl = document.getElementById('summary-season-rank');
        if (summaryRankEl) summaryRankEl.textContent = rankText;
        const summaryProfitEl = document.getElementById('summary-season-profit');
        if (summaryProfitEl) summaryProfitEl.textContent = profit;
        const summaryHandsEl = document.getElementById('summary-season-hands');
        if (summaryHandsEl) summaryHandsEl.textContent = hands;
        const summarySessionsEl = document.getElementById('summary-season-sessions');
        if (summarySessionsEl) summarySessionsEl.textContent = sessions ? sessions : '--';
        const summaryLeagueEl = document.getElementById('summary-season-league');
        if (summaryLeagueEl) summaryLeagueEl.textContent = leagueLabel;
    },

    renderLeagueConditions({ row, seasonData, rank, rules }) {
        const promotionEl = document.getElementById('league-condition-promotion');
        const retentionEl = document.getElementById('league-condition-retention');
        const relegationEl = document.getElementById('league-condition-relegation');
        const handsEl = document.getElementById('league-condition-hands');
        if (!promotionEl && !retentionEl && !relegationEl && !handsEl) return;

        const conditions = this.computeLeagueConditions({ row, seasonData, rank, rules });

        if (promotionEl) promotionEl.textContent = conditions.promotion;
        if (retentionEl) retentionEl.textContent = conditions.retention;
        if (relegationEl) relegationEl.textContent = conditions.relegation;
        if (handsEl) handsEl.textContent = conditions.handsText;

        const handsBar = document.getElementById('league-condition-hands-bar');
        if (handsBar) {
            const progress = conditions.handsProgress ?? 0;
            handsBar.style.width = `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
        }
    },

    computeLeagueConditions({ row, seasonData, rank, rules }) {
        const result = {
            promotion: '昇格まであと--BB',
            retention: '残留まであと--BB',
            relegation: '降格まであと--BB',
            handsText: '残り--hand',
            handsProgress: 0
        };

        const handsInfo = this.getRequiredHandsInfo(row, rules);
        result.handsText = handsInfo.remainingText;
        result.handsProgress = handsInfo.progress ?? 0;

        const promotionRate = this.getRuleValue(rules, 'promotion_rate', null);
        const relegationRate = this.getRuleValue(rules, 'relegation_rate', 0);

        if (!seasonData || !seasonData.length) {
            if (!promotionRate || promotionRate <= 0) {
                result.promotion = '昇格なし';
            }
            if (!relegationRate || relegationRate <= 0) {
                result.retention = '残留まであと∞BB';
                result.relegation = '降格なし';
            }
            return result;
        }

        const sorted = this.getSortedByProfit(seasonData);
        const currentBB = this.getProfitBBValue(row);

        if (promotionRate && promotionRate > 0) {
            const promotionCount = Math.min(sorted.length, Math.max(1, Math.ceil(sorted.length * promotionRate)));
            const promotionBorderRow = sorted[promotionCount - 1] || null;
            const promotionBorderBB = promotionBorderRow ? this.getProfitBBValue(promotionBorderRow) : null;
            if (promotionBorderBB === null) {
                result.promotion = '昇格まであと--BB';
            } else {
                const buffer = currentBB - promotionBorderBB;
                const gapText = this.formatBBGapValue(buffer);
                if (buffer >= 0) {
                    result.promotion = `昇格圏内（昇格ボーダー+${gapText}BB）`;
                } else {
                    result.promotion = `昇格まであと${gapText}BB`;
                }
            }
        } else {
            result.promotion = '昇格なし';
        }

        if (!relegationRate || relegationRate <= 0) {
            result.retention = '残留まであと∞BB';
            result.relegation = '降格なし';
        } else {
            const relegationCount = Math.min(sorted.length, Math.max(1, Math.ceil(sorted.length * relegationRate)));
            const relegationStartRank = Math.max(1, sorted.length - relegationCount + 1);
            const relegationBorderRow = sorted[relegationStartRank - 1] || null;
            const safeBorderRow = sorted[relegationStartRank - 2] || null;
            const safeBorderBB = safeBorderRow ? this.getProfitBBValue(safeBorderRow) : null;
            const relegationBorderBB = relegationBorderRow ? this.getProfitBBValue(relegationBorderRow) : null;
            const safeGap = safeBorderBB !== null ? currentBB - safeBorderBB : null;
            const relegationGap = relegationBorderBB !== null ? currentBB - relegationBorderBB : null;
            const inRelegation = rank ? rank >= relegationStartRank : (safeGap !== null ? safeGap < 0 : false);
            if (inRelegation) {
                const neededText = this.formatBBGapValue(safeGap);
                result.retention = neededText !== '--' ? `残留まであと${neededText}BB` : '残留まであと--BB';
                result.relegation = neededText !== '--' ? `降格圏外まであと${neededText}BB` : '降格圏外まであと--BB';
            } else {
                const cushionText = this.formatBBGapValue(safeGap);
                result.retention = cushionText !== '--' ? `残留圏内（あと${cushionText}BBの余裕）` : '残留圏内';
                const relegationText = this.formatBBGapValue(relegationGap);
                result.relegation = relegationText !== '--' ? `降格まであと${relegationText}BB` : '降格まであと--BB';
            }
        }

        return result;
    },

    renderStats(row) {
        const preflopStats = [
            { label: 'VPIP', value: this.formatStatValue(this.parseNumber(row['VPIP'])) },
            { label: 'PFR', value: this.formatStatValue(this.parseNumber(row['PFR'])) },
            { label: '3bet', value: this.formatStatValue(this.parseNumber(row['3bet'])) },
            { label: 'Fold to 3bet', value: this.formatStatValue(this.parseNumber(row['Fold to 3bet'])) }
        ];

        const postflopStats = [
            { label: 'CB', value: this.formatStatValue(this.parseNumber(row['CB'])) },
            { label: 'WTSD', value: this.formatStatValue(this.parseNumber(row['WTSD'])) },
            { label: 'W$SD', value: this.formatStatValue(this.parseNumber(row['W$SD'])) }
        ];

        this.renderStatsTable('season-stats-preflop', preflopStats);
        this.renderStatsTable('season-stats-postflop', postflopStats);
    },

    renderStatsTable(targetId, stats) {
        const tbody = document.getElementById(targetId);
        if (!tbody) return;

        tbody.innerHTML = stats.map(stat => {
            const value = stat.value !== '--' ? `${stat.value}%` : '--';
            return `
                <tr class="text-gray-300">
                    <td class="py-2 text-left">${this.escapeHtml(stat.label)}</td>
                    <td class="py-2 text-right font-black text-white">${value}</td>
                </tr>
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
        const filtered = seasonId
            ? playerSeasons.filter(item => item.seasonId <= seasonId)
            : playerSeasons;

        const weighted = (key, handsKey) => this.getWeightedStat(filtered, key, handsKey).value;

        const preflopStats = [
            { label: 'VPIP', value: this.formatStatValue(weighted('VPIP', 'VPIP_hands')) },
            { label: 'PFR', value: this.formatStatValue(weighted('PFR', 'PFR_hands')) },
            { label: '3bet', value: this.formatStatValue(weighted('3bet', '3bet_hands')) },
            { label: 'Fold to 3bet', value: this.formatStatValue(weighted('Fold to 3bet', 'Fold to 3bet_hands')) }
        ];

        const postflopStats = [
            { label: 'CB', value: this.formatStatValue(weighted('CB', 'CB_hands')) },
            { label: 'WTSD', value: this.formatStatValue(weighted('WTSD', 'WTSD_hands')) },
            { label: 'W$SD', value: this.formatStatValue(weighted('W$SD', 'W$SD_hands')) }
        ];

        this.renderStatsTable('cumulative-stats-preflop', preflopStats);
        this.renderStatsTable('cumulative-stats-postflop', postflopStats);
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

        const filteredSeasons = seasonId
            ? this.playerSeasons.filter(item => item.seasonId <= seasonId)
            : this.playerSeasons;
        const cumulativeTotals = this.getCumulativeTotals(this.playerSeasons, seasonId);
        const sessions = entry ? entry.sessions : cumulativeTotals.sessions;
        const profit = entry ? this.formatBBValue(entry.profit) : this.formatBBValue(cumulativeTotals.bb);
        const hands = entry ? this.formatCount(entry.hands, false) : this.formatCount(cumulativeTotals.hands, false);
        const rankText = this.formatRankText(rank, total);
        const rankDisplay = rankText === '--' ? '--' : `#${rankText}`;
        const highestLeague = this.getHighestLeague(filteredSeasons);
        const highestLeagueLabel = this.formatLeagueLabel(highestLeague);

        const summaryLeagueEl = document.getElementById('cumulative-summary-league');
        if (summaryLeagueEl) summaryLeagueEl.textContent = highestLeagueLabel;
        const summaryRankEl = document.getElementById('cumulative-summary-rank');
        if (summaryRankEl) summaryRankEl.textContent = rankText;
        const summaryProfitEl = document.getElementById('cumulative-summary-profit');
        if (summaryProfitEl) summaryProfitEl.textContent = profit;
        const summaryHandsEl = document.getElementById('cumulative-summary-hands');
        if (summaryHandsEl) summaryHandsEl.textContent = hands;
        const summarySessionsEl = document.getElementById('cumulative-summary-sessions');
        if (summarySessionsEl) summarySessionsEl.textContent = sessions ? sessions : '--';

        const cumulativeRankInline = document.getElementById('cumulative-rank-inline');
        if (cumulativeRankInline) cumulativeRankInline.textContent = `累計順位 ${rankDisplay}`;

        const summaryState = {
            rank,
            total,
            totals: cumulativeTotals,
            highestLeague
        };
        this.cumulativeSummaryState = summaryState;
        return summaryState;
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
                const leagueBadge = this.renderLeagueBadgeHtml(item.row['リーグ'] || '--');
                const profit = this.escapeHtml(this.formatProfitBB(item.row));
                const hands = this.escapeHtml(this.formatCount(item.row['ハンド数'], false));
                return `
                    <tr class="hover:bg-white/5 transition-colors">
                        <td class="py-4 px-3 text-left text-white">${this.escapeHtml(seasonName)}</td>
                        <td class="py-4 px-3 text-center text-gray-300">${leagueBadge}</td>
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

    getLeagueRankInfo(seasonData, league, playerId, playerName) {
        if (!seasonData || seasonData.length === 0 || !league || league === '--') {
            return { rank: null, total: null };
        }
        const filtered = seasonData.filter(item => (item['リーグ'] || '').trim() === String(league).trim());
        const total = filtered.length || null;
        const rank = this.getSeasonRank(filtered, playerId, playerName);
        return { rank, total };
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

    renderLeagueBadgeHtml(league) {
        const normalized = this.normalizeLeague(league);
        const label = normalized || '--';
        let className = 'league-badge';
        if (normalized === 'A') className += ' league-a';
        if (normalized === 'B') className += ' league-b';
        if (normalized === 'C') className += ' league-c';
        return `<span class="${className}">${this.escapeHtml(label)}</span>`;
    },

    normalizeLeague(value) {
        if (!value) return '';
        const str = String(value).trim();
        const match = str.match(/[A-Za-z]/);
        if (match) return match[0].toUpperCase();
        return str.replace(/\s+/g, '');
    },

    formatLeagueLabel(league) {
        if (!league || league === '--') return '--';
        const str = String(league).trim();
        if (!str) return '--';
        if (str.includes('リーグ')) return str;
        return `${str}リーグ`;
    },

    getHighestLeague(playerSeasons) {
        if (!playerSeasons || !playerSeasons.length) return '--';
        const leagueOrder = ['S', 'A', 'B', 'C', 'D', 'E'];
        let best = null;
        let bestRank = Infinity;
        let fallback = null;

        playerSeasons.forEach(item => {
            const leagueRaw = item?.row?.['リーグ'] || item?.league || '';
            const normalized = this.normalizeLeague(leagueRaw);
            if (!normalized) return;
            if (!fallback) fallback = normalized;
            const idx = leagueOrder.indexOf(normalized);
            if (idx >= 0 && idx < bestRank) {
                best = normalized;
                bestRank = idx;
            }
        });

        return best || fallback || '--';
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

    formatShareValue(value) {
        if (value === null || value === undefined) return '未入力';
        const str = String(value).trim();
        if (!str || str === '--') return '未入力';
        if (str.includes('--')) return '未入力';
        return str;
    },

    formatHandText(value) {
        const count = this.formatCount(value, false);
        return count === '--' ? '未入力' : `${count}H`;
    },

    formatSessionsText(value) {
        const count = this.parseNumber(value);
        return count ? `${count}節` : '未入力';
    },

    formatRankText(rank, total) {
        if (!rank) return '--';
        if (total) return `${rank}/${total}`;
        return String(rank);
    },

    getRequiredHandsInfo(row, rules) {
        const requiredHands = this.getRuleValue(rules, 'required_hands', 0);
        const currentHands = this.parseNumber(row?.['ハンド数']);
        if (!requiredHands || requiredHands <= 0) {
            return { requiredHands: null, remaining: null, remainingText: '--', progress: 0, achieved: false };
        }
        const remaining = Math.max(0, Math.ceil(requiredHands - currentHands));
        const achieved = currentHands >= requiredHands;
        const remainingText = achieved ? '達成済' : `残り${remaining.toLocaleString()}hand`;
        const progress = Math.min(1, currentHands / requiredHands);
        return { requiredHands, remaining, remainingText, progress, achieved };
    },

    formatBBValue(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '--';
        const sign = value >= 0 ? '+' : '';
        return `${sign}${Number(value).toFixed(1)} BB`;
    },

    formatBBGapValue(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '--';
        if (value === Infinity || value === -Infinity) return '∞';
        const absValue = Math.abs(Number(value));
        return absValue.toFixed(1);
    },

    formatBBBuffer(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return 'Buffer：--';
        if (value === Infinity) return 'Buffer：+∞';
        if (value === -Infinity) return 'Buffer：-∞';
        const sign = value >= 0 ? '+' : '-';
        const absValue = Math.abs(Number(value));
        return `Buffer：${sign}${absValue.toFixed(1)} BB`;
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
    updateShareState({ seasonId, seasonName, row, rank, total, leagueRank, leagueTotal, seasonData, promotionRank, promotionProfit, cumulativeSummary, rules }) {
        const playerName = this.formatShareValue(row['プレイヤー'] || '--');
        const leagueLabel = this.formatShareValue(this.formatLeagueLabel(row['リーグ'] || '--'));
        const profitBB = this.formatShareValue(this.formatProfitBB(row));
        const handsText = this.formatHandText(row['ハンド数']);
        const sessionsText = this.formatSessionsText(this.getSessionCount(row));
        const rankText = this.formatShareValue(this.formatRankText(rank, total));
        const leagueRankText = this.formatShareValue(this.formatRankText(leagueRank, leagueTotal));
        const promotionRankText = promotionRank ? `${promotionRank}位` : '未入力';
        const promotionProfitText = promotionProfit || '未入力';
        const requiredHandsValue = this.getRuleValue(rules, 'required_hands', 400);
        const requiredHands = `${requiredHandsValue}h`;

        const seasonUrl = this.buildShareUrl({ seasonId });
        const cumulativeUrl = this.buildShareUrl({ seasonId: null });

        const seasonSummaryText = [
            `【鳳凰戦 ${seasonName} サマリー】${playerName}`,
            `所属リーグ：${leagueLabel}`,
            `シーズン順位(全体)：${rankText}`,
            `シーズン順位(リーグ)：${leagueRankText}`,
            `収支：${profitBB} / ハンド数：${handsText} / 参加節数：${sessionsText}`,
            seasonUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const conditions = this.computeLeagueConditions({ row, seasonData, rank, rules });
        const leagueConditionsText = [
            `【鳳凰戦 ${seasonName} リーグ条件】${playerName}`,
            `昇格：${this.formatShareValue(conditions.promotion)}`,
            `降格：${this.formatShareValue(conditions.relegation)}`,
            `規定hand数：${this.formatShareValue(conditions.handsText)}`,
            seasonUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const seasonGraphText = [
            `【鳳凰戦 ${seasonName} 収支グラフ】${playerName}`,
            `累計収支：${profitBB} / ハンド数：${handsText}`,
            seasonUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const seasonText = [
            `【鳳凰戦 ${seasonName}】${playerName}`,
            `リーグ：${leagueLabel}`,
            `順位：${rank || '--'}/${total || '--'}（昇格圏：${promotionRankText} / ${promotionProfitText}）`,
            `収支：${profitBB} / ハンド数：${handsText}（規定数：${requiredHands}）`,
            seasonUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const cumulativeInfo = cumulativeSummary || this.cumulativeSummaryState || { rank: null, total: null, totals: { bb: 0, hands: 0, sessions: 0 }, highestLeague: '--' };
        const cumulativeRankText = this.formatShareValue(this.formatRankText(cumulativeInfo.rank, cumulativeInfo.total));
        const cumulativeProfitText = this.formatShareValue(this.formatBBValue(cumulativeInfo.totals.bb));
        const cumulativeHandsText = this.formatHandText(cumulativeInfo.totals.hands);
        const cumulativeSessionsText = this.formatSessionsText(cumulativeInfo.totals.sessions);
        const highestLeagueText = this.formatShareValue(this.formatLeagueLabel(cumulativeInfo.highestLeague));

        const cumulativeSummaryText = [
            `【鳳凰戦 累計サマリー】${playerName}`,
            `最高到達リーグ：${highestLeagueText}`,
            `累計順位：${cumulativeRankText}`,
            `累計収支：${cumulativeProfitText}`,
            `累計ハンド数：${cumulativeHandsText} / 累計参加節数：${cumulativeSessionsText}`,
            cumulativeUrl,
            '#ポーカー鳳凰戦'
        ].join('\n');

        const cumulativeGraphText = [
            `【鳳凰戦 累計グラフ】${playerName}`,
            `累計収支：${cumulativeProfitText} / 累計ハンド数：${cumulativeHandsText}`,
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

        const seasonHistoryText = this.buildSeasonHistoryShareText({
            seasonId,
            playerName
        });

        this.shareState = {
            seasonId,
            seasonUrl,
            cumulativeUrl,
            seasonText,
            seasonSummaryText,
            leagueConditionsText,
            seasonGraphText,
            seasonStatsText,
            cumulativeSummaryText,
            cumulativeGraphText,
            cumulativeStatsText,
            seasonHistoryText
        };

        const seasonSummaryX = document.getElementById('share-season-summary-x');
        const leagueConditionsX = document.getElementById('share-league-conditions-x');
        const seasonGraphX = document.getElementById('share-season-graph-x');
        const seasonStatsX = document.getElementById('share-season-stats-x');
        const cumulativeSummaryX = document.getElementById('share-cumulative-summary-x');
        const cumulativeX = document.getElementById('share-cumulative-x');
        const cumulativeStatsX = document.getElementById('share-cumulative-stats-x');
        const seasonHistoryX = document.getElementById('share-season-history-x');

        if (seasonSummaryX) seasonSummaryX.href = this.buildXShareUrl(seasonSummaryText);
        if (leagueConditionsX) leagueConditionsX.href = this.buildXShareUrl(leagueConditionsText);
        if (seasonGraphX) seasonGraphX.href = this.buildXShareUrl(seasonGraphText);
        if (seasonStatsX) seasonStatsX.href = this.buildXShareUrl(seasonStatsText);
        if (cumulativeSummaryX) cumulativeSummaryX.href = this.buildXShareUrl(cumulativeSummaryText);
        if (cumulativeX) cumulativeX.href = this.buildXShareUrl(cumulativeGraphText);
        if (cumulativeStatsX) cumulativeStatsX.href = this.buildXShareUrl(cumulativeStatsText);
        if (seasonHistoryX) seasonHistoryX.href = this.buildXShareUrl(seasonHistoryText);
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

    buildSeasonHistoryShareText({ seasonId, playerName }) {
        const history = (this.playerSeasons || [])
            .filter(item => !seasonId || item.seasonId < seasonId)
            .sort((a, b) => b.seasonId - a.seasonId);

        const lines = [`【鳳凰戦 過去シーズン】${playerName}`];

        if (!history.length) {
            lines.push('過去シーズン：なし');
            lines.push(this.buildShareUrl({ seasonId: null }));
            lines.push('#ポーカー鳳凰戦');
            return lines.join('\n');
        }

        const display = history.slice(0, 3);
        display.forEach(item => {
            const seasonName = this.getSeasonName(item.seasonId);
            const league = this.formatShareValue(this.formatLeagueLabel(item.row['リーグ'] || '--'));
            const profit = this.formatShareValue(this.formatProfitBB(item.row));
            const hands = this.formatHandText(item.row['ハンド数']);
            lines.push(`${seasonName}：${league} / ${profit} / ${hands}`);
        });

        if (history.length > display.length) {
            lines.push(`他${history.length - display.length}シーズン`);
        }

        lines.push(this.buildShareUrl({ seasonId: null }));
        lines.push('#ポーカー鳳凰戦');
        return lines.join('\n');
    },

    buildImageFilename(nameKey) {
        const playerName = this.playerSeasons[0]?.row?.['プレイヤー'] || this.playerName || 'player';
        const seasonLabel = this.getSeasonShortName(this.currentSeasonId ?? this.getCurrentSeasonId());
        const safePlayer = this.sanitizeFilename(playerName);
        const safeKey = this.sanitizeFilename(nameKey);
        const safeSeason = this.sanitizeFilename(seasonLabel || 'season');
        return `${safeSeason}_${safeKey}_${safePlayer}.png`;
    },

    sanitizeFilename(value) {
        return String(value)
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, '_')
            .trim();
    },

    downloadDataUrl(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
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
        const bindings = [
            { id: 'share-season-summary-copy', mode: 'seasonSummary' },
            { id: 'share-league-conditions-copy', mode: 'leagueConditions' },
            { id: 'share-season-graph-copy', mode: 'seasonGraph' },
            { id: 'share-season-stats-copy', mode: 'seasonStats' },
            { id: 'share-cumulative-summary-copy', mode: 'cumulativeSummary' },
            { id: 'share-cumulative-copy', mode: 'cumulativeGraph' },
            { id: 'share-cumulative-stats-copy', mode: 'cumulativeStats' },
            { id: 'share-season-history-copy', mode: 'seasonHistory' }
        ];

        bindings.forEach(binding => {
            const button = document.getElementById(binding.id);
            if (button) {
                button.addEventListener('click', () => this.copyShareLink(binding.mode));
            }
        });
    },

    setupImageButtons() {
        const buttons = document.querySelectorAll('[data-image-target]');
        buttons.forEach(button => {
            button.addEventListener('click', () => this.downloadCardImage(button));
        });
    },

    async downloadCardImage(button) {
        const targetId = button?.dataset?.imageTarget;
        const statusId = button?.dataset?.statusTarget;
        const nameKey = button?.dataset?.imageName || 'card';
        const statusEl = statusId ? document.getElementById(statusId) : null;
        const target = targetId ? document.getElementById(targetId) : null;

        if (!target || !window.htmlToImage) {
            if (statusEl) statusEl.textContent = '画像保存に失敗しました';
            if (statusEl) {
                setTimeout(() => {
                    statusEl.textContent = '';
                }, 2000);
            }
            return;
        }

        try {
            if (statusEl) statusEl.textContent = '画像生成中...';
            const filter = node => {
                if (node && node.dataset && node.dataset.captureExclude === 'true') {
                    return false;
                }
                return true;
            };
            const sourceCanvas = await window.htmlToImage.toCanvas(target, {
                backgroundColor: '#050505',
                pixelRatio: 2,
                filter
            });

            const outputWidth = 1600;
            const outputHeight = 900;
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = outputWidth;
            outputCanvas.height = outputHeight;

            const ctx = outputCanvas.getContext('2d');
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, outputWidth, outputHeight);

            const padding = 60;
            const maxWidth = outputWidth - padding * 2;
            const maxHeight = outputHeight - padding * 2;
            const scale = Math.min(maxWidth / sourceCanvas.width, maxHeight / sourceCanvas.height);
            const drawWidth = sourceCanvas.width * scale;
            const drawHeight = sourceCanvas.height * scale;
            const dx = (outputWidth - drawWidth) / 2;
            const dy = (outputHeight - drawHeight) / 2;
            ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);

            const dataUrl = outputCanvas.toDataURL('image/png');
            const filename = this.buildImageFilename(nameKey);
            this.downloadDataUrl(dataUrl, filename);

            if (statusEl) statusEl.textContent = '画像保存しました';
        } catch (error) {
            console.error('画像の生成に失敗しました:', error);
            if (statusEl) statusEl.textContent = '画像保存に失敗しました';
        }

        if (statusEl) {
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    },

    async copyShareLink(mode) {
        if (!this.shareState) return;
        const mapping = {
            seasonSummary: { url: this.shareState.seasonUrl, statusId: 'share-season-summary-status' },
            leagueConditions: { url: this.shareState.seasonUrl, statusId: 'share-league-conditions-status' },
            seasonGraph: { url: this.shareState.seasonUrl, statusId: 'share-season-graph-status' },
            seasonStats: { url: this.shareState.seasonUrl, statusId: 'share-season-stats-status' },
            cumulativeSummary: { url: this.shareState.cumulativeUrl, statusId: 'share-cumulative-summary-status' },
            cumulativeGraph: { url: this.shareState.cumulativeUrl, statusId: 'share-cumulative-status' },
            cumulativeStats: { url: this.shareState.cumulativeUrl, statusId: 'share-cumulative-stats-status' },
            seasonHistory: { url: this.shareState.cumulativeUrl, statusId: 'share-season-history-status' }
        };
        const entry = mapping[mode] || mapping.seasonSummary;
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

        const badgeEl = document.getElementById('user-league-badge');
        if (badgeEl) badgeEl.textContent = '';
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
