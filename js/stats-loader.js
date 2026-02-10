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
    pageMode: null,  // 'season', 'all', または null（従来動作）

    // ソート設定
    currentSortColumn: '収支',  // デフォルトは収支でソート
    currentSortOrder: 'desc',  // desc: 降順, asc: 昇順

    /**
     * 初期化
     */
    async init() {
        try {
            // カスタムパスが設定されている場合は上書き
            if (window.CUSTOM_STATS_PATH) {
                this.allStatsPath = window.CUSTOM_STATS_PATH;
            }

            // ページモードを取得
            this.pageMode = window.STATS_PAGE_MODE || null;

            // シーズン設定を読み込み
            await this.loadSeasonsConfig();

            // ページモードに応じた初期化
            if (this.pageMode === 'all') {
                // 全期間専用モード：タブなし、全期間データのみ
                this.hideSeasonTabs();
                const data = await this.loadAllStats();
                this.renderTable(data);
                this.updateSummary(data);
            } else if (this.pageMode === 'season') {
                // シーズン専用モード：シーズンタブのみ
                this.renderSeasonOnlyTabs();
                // 最初のシーズンまたは現在のシーズンを表示
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
                // 従来動作：全期間 + シーズンタブ
                this.renderTabs();
                const data = await this.loadAllStats();
                this.renderTable(data);
                this.updateSummary(data);
                this.setupTabEvents();
            }
        } catch (error) {
            console.error('スタッツデータの読み込みに失敗しました:', error);
            this.showError();
        }
    },

    /**
     * デフォルトのシーズンIDを取得
     */
    getDefaultSeasonId() {
        if (!this.seasonsConfig || !this.seasonsConfig.seasons || this.seasonsConfig.seasons.length === 0) {
            return null;
        }
        // current_season_id があればそれを使用、なければ最初のシーズン
        if (this.seasonsConfig.current_season_id) {
            return this.seasonsConfig.current_season_id;
        }
        return this.seasonsConfig.seasons[0].id;
    },

    /**
     * シーズンタブを非表示
     */
    hideSeasonTabs() {
        const tabContainer = document.getElementById('season-tabs');
        if (tabContainer) {
            tabContainer.style.display = 'none';
        }
    },

    /**
     * シーズン専用タブを生成（全期間なし）
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
     * シーズンデータがない場合のメッセージを表示
     */
    showNoSeasonMessage() {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="py-12 text-center text-gray-500">
                    <i class="fas fa-calendar-xmark text-2xl mb-4 block text-gold/50"></i>
                    シーズンデータがまだありません。
                </td>
            </tr>
        `;
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
     * スタッツ値とハンド数を組み合わせた表示を生成
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
     * データをソート
     */
    sortData(data, column, order) {
        return [...data].sort((a, b) => {
            let valA, valB;

            if (column === '収支') {
                // 収支は "+1000" や "-500" の文字列なので数値に変換（チップ数）
                valA = parseInt(a[column].replace(/[+,]/g, '')) || 0;
                valB = parseInt(b[column].replace(/[+,]/g, '')) || 0;
            } else if (column === 'ハンド数' || column.includes('_hands')) {
                // ハンド数は数値
                valA = parseInt(a[column]) || 0;
                valB = parseInt(b[column]) || 0;
            } else if (column === 'プレイヤー' || column === 'リーグ') {
                // 文字列
                valA = a[column] || '';
                valB = b[column] || '';
            } else {
                // スタッツ値（パーセンテージ）
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
     * テーブルにデータを描画
     */
    renderTable(data) {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        // データをソート
        const sortedData = this.sortData(data, this.currentSortColumn, this.currentSortOrder);

        sortedData.forEach((player, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-white/5 transition-colors';

            // 順位（インデックス + 1）
            const rank = index + 1;

            // 収支をBB数に変換（各行のbb_sizeを使用）
            const profitChips = player['収支'] || '0';
            const bbSize = parseInt(player['bb_size']) || 20;  // デフォルト20
            const chipsNum = parseInt(profitChips.replace(/[+,]/g, '')) || 0;
            const profitBB = chipsNum / bbSize;
            const sign = chipsNum >= 0 ? '+' : '';
            const profitBBStr = `${sign}${profitBB.toFixed(1)} BB`;

            const profitClass = chipsNum >= 0
                ? 'text-green-400'
                : 'text-red-400';

            // リーグバッジ
            const league = player['リーグ'] || 'C';
            const leagueBadge = this.getLeagueBadge(league);

            row.innerHTML = `
                <td class="py-4 px-3 text-center text-gold font-bold text-sm">${rank}</td>
                <td class="py-4 px-3 text-white font-bold text-sm whitespace-nowrap">${this.escapeHtml(player['プレイヤー'])}</td>
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

        // 開催回数（セッション数）
        const totalSessions = document.getElementById('total-sessions');
        if (totalSessions && this.seasonsConfig) {
            let sessionCount = 0;
            if (this.currentView === 'all') {
                // 全期間表示：total_session_count を使用
                sessionCount = this.seasonsConfig.total_session_count || 0;
            } else {
                // シーズン別表示：該当シーズンの session_count を使用
                const seasonId = parseInt(this.currentView);
                const season = this.seasonsConfig.seasons.find(s => s.id === seasonId);
                sessionCount = season?.session_count || 0;
            }
            totalSessions.textContent = sessionCount || '--';
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
                <td colspan="12" class="py-12 text-center text-gray-500">
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
