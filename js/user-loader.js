/**
 * User Loader - ユーザー個人の戦績ページ用データローダー
 * StatsLoaderと同じ設計パターン（モジュールオブジェクト）を踏襲
 */

const UserLoader = {
    // パス設定
    seasonsConfigPath: 'config/seasons.json',
    sessionStatsPath: 'data/session_stats.csv',
    seasonStatsPathTemplate: 'data/season_{id}_stats.csv',
    allStatsPath: 'data/all_stats.csv',

    // データキャッシュ
    seasonsConfig: null,
    sessionStatsData: null,
    seasonStatsData: {},
    allStatsData: null,

    // 状態
    playerId: null,
    currentSeasonId: null,
    chartInstance: null,

    /**
     * 初期化
     */
    async init() {
        try {
            // URLパラメータからplayer_idを取得
            const params = new URLSearchParams(window.location.search);
            this.playerId = params.get('id');

            if (!this.playerId) {
                this.showError('プレイヤーIDが指定されていません。');
                return;
            }

            // データロード
            await this.loadSeasonsConfig();
            await this.loadSessionStats();

            // デフォルトシーズンを設定
            this.currentSeasonId = this.seasonsConfig.current_season_id ||
                (this.seasonsConfig.seasons.length > 0 ? this.seasonsConfig.seasons[0].id : null);

            if (!this.currentSeasonId) {
                this.showError('シーズンデータがありません。');
                return;
            }

            // シーズンデータをロード
            await this.loadSeasonStats(this.currentSeasonId);

            // プレイヤーを検索
            const player = this.findPlayer(this.currentSeasonId);
            if (!player) {
                this.showError('プレイヤーが見つかりませんでした。');
                return;
            }

            // ページタイトルを更新
            document.title = `${player['プレイヤー']} の戦績 | ポーカー鳳凰戦`;

            // 描画
            this.renderPlayerHeader(player);
            this.renderSeasonTabs();
            this.renderSeasonSummary(player);
            this.renderWeeklyChart();
            this.renderPokerStats(player);
            this.renderLeagueConditions(player);
            this.setupShareButtons(player);
            this.setupChartShare(player);

        } catch (error) {
            console.error('ユーザーデータの読み込みに失敗しました:', error);
            this.showError('データの読み込みに失敗しました。');
        }
    },

    /**
     * シーズン設定を読み込み
     */
    async loadSeasonsConfig() {
        const response = await fetch(this.seasonsConfigPath);
        if (!response.ok) throw new Error('seasons.json の読み込みに失敗');
        this.seasonsConfig = await response.json();
    },

    /**
     * セッション別スタッツを読み込み
     */
    async loadSessionStats() {
        const response = await fetch(this.sessionStatsPath);
        if (!response.ok) throw new Error('session_stats.csv の読み込みに失敗');
        const csvText = await response.text();
        this.sessionStatsData = this.parseCSV(csvText);
    },

    /**
     * シーズン別スタッツを読み込み
     */
    async loadSeasonStats(seasonId) {
        if (this.seasonStatsData[seasonId]) return this.seasonStatsData[seasonId];
        const path = this.seasonStatsPathTemplate.replace('{id}', seasonId);
        const response = await fetch(path);
        if (!response.ok) throw new Error(`season_${seasonId}_stats.csv の読み込みに失敗`);
        const csvText = await response.text();
        this.seasonStatsData[seasonId] = this.parseCSV(csvText);
        return this.seasonStatsData[seasonId];
    },

    /**
     * CSV文字列をパース（stats-loader.jsと同じロジック）
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
     * CSV行をパース（カンマ含み対応）
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
     * プレイヤーをシーズンCSVから検索
     */
    findPlayer(seasonId) {
        const data = this.seasonStatsData[seasonId];
        if (!data) return null;
        return data.find(row => row['player_id'] === this.playerId) || null;
    },

    /**
     * プレイヤーの順位を取得（収支でソート済みのインデックス）
     */
    getPlayerRank(seasonId) {
        const data = this.seasonStatsData[seasonId];
        if (!data) return null;

        const sorted = [...data].sort((a, b) => {
            const valA = parseInt(a['収支'].replace(/[+,]/g, '')) || 0;
            const valB = parseInt(b['収支'].replace(/[+,]/g, '')) || 0;
            return valB - valA;
        });

        const index = sorted.findIndex(row => row['player_id'] === this.playerId);
        return index >= 0 ? index + 1 : null;
    },

    /**
     * HTMLエスケープ
     */
    escapeHtml(str) {
        if (str === null || str === undefined) return '--';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * リーグバッジHTML
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
     * プレイヤーヘッダーを描画
     */
    renderPlayerHeader(player) {
        const header = document.getElementById('player-header');
        const rank = this.getPlayerRank(this.currentSeasonId);
        const league = player['リーグ'] || 'C';
        const name = this.escapeHtml(player['プレイヤー']);

        header.innerHTML = `
            <div class="flex items-center gap-5">
                <div class="player-rank-badge">${rank || '--'}</div>
                <div>
                    <h1 class="text-2xl md:text-3xl font-serif font-black text-white mb-1">${name}</h1>
                    <div class="flex items-center gap-3">
                        ${this.getLeagueBadge(league)}
                        <span class="text-gray-500 text-xs tracking-wider">${this.escapeHtml(league)} リーグ</span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * シーズンタブを描画（1つなら非表示）
     */
    renderSeasonTabs() {
        const container = document.getElementById('user-season-tabs');
        if (!this.seasonsConfig || this.seasonsConfig.seasons.length <= 1) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const tabsWrapper = container.querySelector('div');
        let html = '';

        this.seasonsConfig.seasons.forEach(season => {
            const isActive = season.id === this.currentSeasonId;
            html += `
                <button class="season-tab${isActive ? ' active' : ''}" data-season="${season.id}">
                    ${this.escapeHtml(season.name)}
                </button>
            `;
        });

        tabsWrapper.innerHTML = html;

        // タブイベント
        tabsWrapper.querySelectorAll('.season-tab').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                const seasonId = parseInt(e.target.dataset.season);
                await this.switchSeason(seasonId);

                // アクティブ状態を更新
                tabsWrapper.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    },

    /**
     * シーズン切り替え
     */
    async switchSeason(seasonId) {
        this.currentSeasonId = seasonId;
        await this.loadSeasonStats(seasonId);

        const player = this.findPlayer(seasonId);
        if (!player) {
            this.showError('このシーズンのデータが見つかりませんでした。');
            return;
        }

        this.renderPlayerHeader(player);
        this.renderSeasonSummary(player);
        this.renderWeeklyChart();
        this.renderPokerStats(player);
        this.renderLeagueConditions(player);
        this.setupChartShare(player);
    },

    /**
     * シーズンサマリーを描画（4カード）
     */
    renderSeasonSummary(player) {
        const section = document.getElementById('season-summary');
        section.classList.remove('hidden');

        const rank = this.getPlayerRank(this.currentSeasonId);
        document.getElementById('summary-rank').textContent = rank ? `${rank}位` : '--';

        // 収支をBB換算
        const profitChips = player['収支'] || '0';
        const bbSize = parseInt(player['bb_size']) || 20;
        const chipsNum = parseInt(profitChips.replace(/[+,]/g, '')) || 0;
        const profitBB = chipsNum / bbSize;
        const sign = chipsNum >= 0 ? '+' : '';
        const profitEl = document.getElementById('summary-profit');
        profitEl.textContent = `${sign}${profitBB.toFixed(1)}`;
        profitEl.className = `text-2xl font-serif font-black mb-1 ${chipsNum >= 0 ? 'text-green-400' : 'text-red-400'}`;

        document.getElementById('summary-hands').textContent = parseInt(player['ハンド数'] || 0).toLocaleString();
        document.getElementById('summary-sessions').textContent = player['参加節数'] || '--';
    },

    /**
     * 節ごとの成績推移チャート
     */
    renderWeeklyChart() {
        const section = document.getElementById('weekly-chart-section');
        section.classList.remove('hidden');

        // 現在のシーズンのsession_datesを取得
        const season = this.seasonsConfig.seasons.find(s => s.id === this.currentSeasonId);
        if (!season || !season.session_dates) return;

        const sessionDates = season.session_dates;

        // プレイヤーのセッション別データを収集
        const weeklyProfits = [];
        const labels = [];
        let cumulative = 0;
        const cumulativeData = [];

        sessionDates.forEach(dateStr => {
            // 日付ラベルを M/D 形式に
            const m = dateStr.substring(4, 6).replace(/^0/, '');
            const d = dateStr.substring(6, 8).replace(/^0/, '');
            labels.push(`${m}/${d}`);

            // このセッションでのプレイヤーデータ
            const sessionRow = this.sessionStatsData.find(
                row => row['session_date'] === dateStr &&
                       row['player_id'] === this.playerId &&
                       row['season_id'] === String(this.currentSeasonId)
            );

            if (sessionRow) {
                const bbSize = parseInt(sessionRow['bb_size']) || 20;
                const net = parseInt(sessionRow['収支'].replace(/[+,]/g, '')) || 0;
                const profitBB = net / bbSize;
                weeklyProfits.push(profitBB);
                cumulative += profitBB;
            } else {
                weeklyProfits.push(0);
            }
            cumulativeData.push(cumulative);
        });

        // 既存チャートを破棄
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = document.getElementById('weekly-chart').getContext('2d');
        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '節ごと収支 (BB)',
                        data: weeklyProfits,
                        backgroundColor: weeklyProfits.map(v =>
                            v >= 0 ? 'rgba(74, 222, 128, 0.6)' : 'rgba(248, 113, 113, 0.6)'
                        ),
                        borderColor: weeklyProfits.map(v =>
                            v >= 0 ? 'rgba(74, 222, 128, 1)' : 'rgba(248, 113, 113, 1)'
                        ),
                        borderWidth: 1,
                        borderRadius: 3,
                        order: 2,
                    },
                    {
                        label: '累計収支 (BB)',
                        data: cumulativeData,
                        type: 'line',
                        borderColor: 'rgba(212, 175, 55, 0.9)',
                        backgroundColor: 'rgba(212, 175, 55, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: 'rgba(212, 175, 55, 1)',
                        pointBorderColor: '#000',
                        pointBorderWidth: 1,
                        pointRadius: 4,
                        tension: 0,
                        fill: true,
                        order: 1,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                    y: {
                        ticks: {
                            color: '#9ca3af',
                            font: { size: 11 },
                            callback: function(value) { return value.toFixed(0) + ' BB'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#9ca3af', font: { size: 11 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        titleColor: '#d4af37',
                        bodyColor: '#d1d1d1',
                        borderColor: 'rgba(212,175,55,0.3)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed.y;
                                const sign = val >= 0 ? '+' : '';
                                return `${context.dataset.label}: ${sign}${val.toFixed(1)} BB`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * ポーカースタッツの横バーを描画
     */
    renderPokerStats(player) {
        const section = document.getElementById('poker-stats-section');
        section.classList.remove('hidden');
        const container = document.getElementById('poker-stats-bars');

        const stats = [
            { name: 'VPIP', value: player['VPIP'], hands: player['VPIP_hands'] },
            { name: 'PFR', value: player['PFR'], hands: player['PFR_hands'] },
            { name: '3bet', value: player['3bet'], hands: player['3bet_hands'] },
            { name: 'Fold to 3bet', value: player['Fold to 3bet'], hands: player['Fold to 3bet_hands'] },
            { name: 'CB', value: player['CB'], hands: player['CB_hands'] },
            { name: 'WTSD', value: player['WTSD'], hands: player['WTSD_hands'] },
            { name: 'W$SD', value: player['W$SD'], hands: player['W$SD_hands'] },
        ];

        let html = '';
        stats.forEach(stat => {
            const val = parseFloat(stat.value) || 0;
            const width = Math.min(val, 100);
            const hands = stat.hands || '0';

            html += `
                <div>
                    <div class="flex justify-between items-baseline mb-1.5">
                        <span class="text-sm font-bold text-white">${this.escapeHtml(stat.name)}</span>
                        <div class="text-right">
                            <span class="text-sm font-mono text-gold font-bold">${val.toFixed(1)}%</span>
                            <span class="text-gray-500 text-xs font-mono ml-2">[${this.escapeHtml(hands)}]</span>
                        </div>
                    </div>
                    <div class="stat-bar">
                        <div class="stat-bar-fill" style="width: ${width}%"></div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    /**
     * リーグ条件を表示
     */
    renderLeagueConditions(player) {
        const section = document.getElementById('league-conditions-section');
        const content = document.getElementById('league-conditions-content');
        const season = this.seasonsConfig.seasons.find(s => s.id === this.currentSeasonId);

        if (!season || !season.league_rules) {
            section.classList.add('hidden');
            return;
        }

        const rules = season.league_rules;
        section.classList.remove('hidden');

        const hands = parseInt(player['ハンド数']) || 0;
        const requiredHands = rules.required_hands || 0;
        let html = '';

        // 規定ハンド数の進捗
        if (requiredHands > 0) {
            const progress = Math.min((hands / requiredHands) * 100, 100);
            const isComplete = hands >= requiredHands;

            html += `
                <div class="mb-6">
                    <div class="flex justify-between items-baseline mb-2">
                        <span class="text-sm text-white font-bold">規定ハンド数</span>
                        <span class="text-sm font-mono ${isComplete ? 'text-green-400' : 'text-gray-400'}">
                            ${hands.toLocaleString()} / ${requiredHands.toLocaleString()}
                            ${isComplete ? '<i class="fas fa-check-circle ml-1"></i>' : ''}
                        </span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill ${isComplete ? 'bg-green-500' : 'bg-gold'}" style="width: ${progress}%; background-color: ${isComplete ? '#22c55e' : 'var(--gold)'}"></div>
                    </div>
                    ${!isComplete ? `<p class="text-[10px] text-gray-500 mt-1.5">残り ${(requiredHands - hands).toLocaleString()} ハンド</p>` : ''}
                </div>
            `;
        }

        // 昇格条件
        if (rules.promotion) {
            const league = player['リーグ'] || 'C';
            const promoKey = `${league}_to_${league === 'C' ? 'B' : 'A'}`;
            const promo = rules.promotion[promoKey];

            if (promo && promo.top_percent) {
                const percent = (promo.top_percent * 100).toFixed(0);
                const data = this.seasonStatsData[this.currentSeasonId];
                const totalPlayers = data ? data.length : 0;
                const rank = this.getPlayerRank(this.currentSeasonId);
                const cutoff = Math.ceil(totalPlayers * promo.top_percent);
                const isPromoted = rank && rank <= cutoff;

                html += `
                    <div class="bg-white/5 p-4 border border-white/10 rounded">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fas fa-arrow-up text-gold text-xs"></i>
                            <span class="text-sm text-white font-bold">昇格条件: 上位 ${percent}%</span>
                        </div>
                        <p class="text-xs text-gray-400">
                            現在の順位: <span class="text-white font-bold">${rank || '--'}位</span> / ${totalPlayers}人
                            （昇格ライン: ${cutoff}位以内）
                        </p>
                        ${isPromoted
                            ? '<p class="text-xs text-green-400 mt-1 font-bold"><i class="fas fa-check-circle mr-1"></i>現在の順位で昇格圏内です</p>'
                            : rank ? '<p class="text-xs text-gray-500 mt-1">昇格にはさらなる上位が必要です</p>' : ''
                        }
                    </div>
                `;
            }
        }

        content.innerHTML = html || '<p class="text-gray-500 text-sm">条件は未設定です。</p>';
    },

    /**
     * 共有ボタンのセットアップ
     */
    setupShareButtons(player) {
        const section = document.getElementById('share-section');
        section.classList.remove('hidden');

        const name = player['プレイヤー'];
        const profitChips = player['収支'] || '0';
        const bbSize = parseInt(player['bb_size']) || 20;
        const chipsNum = parseInt(profitChips.replace(/[+,]/g, '')) || 0;
        const profitBB = chipsNum / bbSize;
        const sign = chipsNum >= 0 ? '+' : '';
        const rank = this.getPlayerRank(this.currentSeasonId);

        const shareText = `${name} のポーカー鳳凰戦 戦績\n順位: ${rank || '--'}位 | 収支: ${sign}${profitBB.toFixed(1)} BB | ハンド数: ${player['ハンド数']}`;
        const shareUrl = window.location.href;

        // X共有
        document.getElementById('share-x').addEventListener('click', () => {
            const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
            window.open(twitterUrl, '_blank', 'width=550,height=420');
        });

        // URLコピー
        document.getElementById('share-url').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareUrl);
                const btn = document.getElementById('share-url');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> コピーしました';
                setTimeout(() => { btn.innerHTML = originalText; }, 2000);
            } catch (e) {
                // フォールバック
                const input = document.createElement('input');
                input.value = shareUrl;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
            }
        });
    },

    /**
     * チャート画像をXで共有するボタンのセットアップ
     */
    setupChartShare(player) {
        const btn = document.getElementById('share-chart-x');
        if (!btn) return;

        // 既存リスナーを除去するためにcloneで置換
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async () => {
            if (!this.chartInstance) return;

            const name = player['プレイヤー'];
            const rank = this.getPlayerRank(this.currentSeasonId);
            const profitChips = player['収支'] || '0';
            const bbSize = parseInt(player['bb_size']) || 20;
            const chipsNum = parseInt(profitChips.replace(/[+,]/g, '')) || 0;
            const profitBB = chipsNum / bbSize;
            const sign = chipsNum >= 0 ? '+' : '';

            const shareText = `${name} のポーカー鳳凰戦 成績推移\n順位: ${rank || '--'}位 | 累計収支: ${sign}${profitBB.toFixed(1)} BB`;
            const shareUrl = window.location.href;

            // canvasから画像を生成してBlobに変換
            const canvas = document.getElementById('weekly-chart');
            try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

                // Web Share API（画像付き）が使えるか確認
                if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'chart.png', { type: 'image/png' })] })) {
                    const file = new File([blob], 'houou_chart.png', { type: 'image/png' });
                    await navigator.share({
                        text: shareText + '\n' + shareUrl,
                        files: [file],
                    });
                } else {
                    // Web Share API非対応: 画像をダウンロードしてXの投稿画面を開く
                    const link = document.createElement('a');
                    link.download = `houou_${name}_chart.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();

                    // 少し待ってからX投稿画面を開く
                    setTimeout(() => {
                        const tweetText = shareText + '\n（画像を添付してください）';
                        const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
                        window.open(twitterUrl, '_blank', 'width=550,height=420');
                    }, 500);
                }
            } catch (e) {
                // フォールバック: テキストのみでX共有
                const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
                window.open(twitterUrl, '_blank', 'width=550,height=420');
            }
        });
    },

    /**
     * エラー表示
     */
    showError(message) {
        const header = document.getElementById('player-header');
        header.innerHTML = `
            <div class="py-12 text-center">
                <i class="fas fa-exclamation-triangle text-2xl mb-4 block text-red-400/50"></i>
                <p class="text-gray-500">${this.escapeHtml(message)}</p>
                <a href="season_stats.html" class="inline-block mt-4 text-gold text-sm hover:underline">
                    ランキングページに戻る
                </a>
            </div>
        `;
    },
};

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    UserLoader.init();
});
