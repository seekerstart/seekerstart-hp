/**
 * Stats Loader - CSVファイルからプレイヤースタッツを読み込んで表示
 * シーズン切り替え機能とリーグ表示に対応
 */

const StatsLoader = {
    // CSVパス設定
    allStatsPath: 'data/all_stats.csv',
    seasonStatsPathTemplate: 'data/season_{id}_stats.csv',
    seasonsConfigPath: 'config/seasons.json',

    // データキャッシュ
    seasonsConfig: null,
    allStatsData: null,
    seasonStatsData: {},
    currentView: 'all',  // 'all' または season id

    /**
     * 初期化
     */
    async init() {
        try {
            // シーズン設定を読み込み
            await this.loadSeasonsConfig();

            // タブを生成
            this.renderTabs();

            // 全期間データを読み込んで表示
            const data = await this.loadAllStats();
            this.renderTable(data);
            this.updateSummary(data);

            // タブクリックイベントを設定
            this.setupTabEvents();
        } catch (error) {
            console.error('スタッツデータの読み込みに失敗しました:', error);
            this.showError();
        }
    },

    /**
     * シーズン設定を読み込み
     */
    async loadSeasonsConfig() {
        try {
            const response = await fetch(this.seasonsConfigPath);
            if (response.ok) {
                this.seasonsConfig = await response.json();
            } else {
                // 設定ファイルがない場合はデフォルト
                this.seasonsConfig = {
                    seasons: [],
                    current_season_id: null
                };
            }
        } catch (error) {
            console.warn('シーズン設定の読み込みに失敗:', error);
            this.seasonsConfig = {
                seasons: [],
                current_season_id: null
            };
        }
    },

    /**
     * 全期間スタッツを読み込み
     */
    async loadAllStats() {
        if (this.allStatsData) {
            return this.allStatsData;
        }
        const response = await fetch(this.allStatsPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        this.allStatsData = this.parseCSV(csvText);
        return this.allStatsData;
    },

    /**
     * シーズン別スタッツを読み込み
     */
    async loadSeasonStats(seasonId) {
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
     * CSV文字列をパースしてオブジェクト配列に変換
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
     * CSV行をパース（カンマを含む値に対応）
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
     * タブを生成
     */
    renderTabs() {
        const tabContainer = document.getElementById('season-tabs');
        if (!tabContainer) return;

        let tabsHtml = `
            <button class="season-tab active" data-season="all">
                全期間
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
     * タブクリックイベントを設定
     */
    setupTabEvents() {
        const tabs = document.querySelectorAll('.season-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', async (e) => {
                // アクティブ状態を更新
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
                    console.error('データの読み込みに失敗:', error);
                    this.showError();
                }
            });
        });
    },

    /**
     * テーブルにデータを描画
     */
    renderTable(data) {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        data.forEach(player => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-white/5 transition-colors';

            // 収支の色分け
            const profitValue = player['収支'] || '0';
            const profitClass = profitValue.startsWith('+')
                ? 'text-green-400'
                : profitValue.startsWith('-')
                    ? 'text-red-400'
                    : 'text-gray-300';

            // リーグバッジ
            const league = player['リーグ'] || 'C';
            const leagueBadge = this.getLeagueBadge(league);

            row.innerHTML = `
                <td class="py-4 px-3 text-white font-bold text-sm whitespace-nowrap">${this.escapeHtml(player['プレイヤー'])}</td>
                <td class="py-4 px-3 text-center">${leagueBadge}</td>
                <td class="py-4 px-3 text-right text-sm font-mono ${profitClass}">${this.escapeHtml(profitValue)}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['ハンド数'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['VPIP'])}%</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['PFR'])}%</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['3bet'])}%</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['Fold to 3bet'])}%</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['CB'])}%</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['WTSD'])}%</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['W$SD'])}%</td>
            `;

            tbody.appendChild(row);
        });
    },

    /**
     * リーグバッジを生成
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
     * サマリー情報を更新
     */
    updateSummary(data) {
        // 総参加者数
        const totalPlayers = document.getElementById('total-players');
        if (totalPlayers) {
            totalPlayers.textContent = data.length;
        }

        // 総ハンド数
        const totalHands = document.getElementById('total-hands');
        if (totalHands) {
            const sum = data.reduce((acc, player) => {
                return acc + (parseInt(player['ハンド数'], 10) || 0);
            }, 0);
            totalHands.textContent = sum.toLocaleString();
        }

        // 開催回数（シーズン数として表示）
        const totalSessions = document.getElementById('total-sessions');
        if (totalSessions && this.seasonsConfig) {
            const activeSeasons = this.seasonsConfig.seasons.filter(
                s => s.status === 'active'
            ).length;
            totalSessions.textContent = activeSeasons || '--';
        }
    },

    /**
     * エラー表示
     */
    showError() {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="py-12 text-center text-gray-500">
                    <i class="fas fa-exclamation-triangle text-2xl mb-4 block text-red-400/50"></i>
                    データの読み込みに失敗しました。<br>
                    しばらく経ってから再度お試しください。
                </td>
            </tr>
        `;
    },

    /**
     * HTMLエスケープ（XSS対策）
     */
    escapeHtml(str) {
        if (str === null || str === undefined) return '--';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    StatsLoader.init();
});
