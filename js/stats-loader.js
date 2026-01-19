/**
 * Stats Loader - CSVファイルからプレイヤースタッツを読み込んで表示
 */

const StatsLoader = {
    csvPath: 'data/player_stats.csv',

    /**
     * 初期化
     */
    async init() {
        try {
            const data = await this.loadCSV();
            this.renderTable(data);
            this.updateSummary(data);
        } catch (error) {
            console.error('スタッツデータの読み込みに失敗しました:', error);
            this.showError();
        }
    },

    /**
     * CSVファイルを読み込んでパース
     */
    async loadCSV() {
        const response = await fetch(this.csvPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        return this.parseCSV(csvText);
    },

    /**
     * CSV文字列をパースしてオブジェクト配列に変換
     */
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
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
     * テーブルにデータを描画
     */
    renderTable(data) {
        const tbody = document.getElementById('stats-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        data.forEach(player => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-white/5 transition-colors';

            // 総収支の色分け
            const profitValue = player['総収支'];
            const profitClass = profitValue.startsWith('+')
                ? 'text-green-400'
                : profitValue.startsWith('-')
                    ? 'text-red-400'
                    : 'text-gray-300';

            row.innerHTML = `
                <td class="py-4 px-3 text-white font-bold text-sm whitespace-nowrap">${this.escapeHtml(player['プレイヤー'])}</td>
                <td class="py-4 px-3 text-right text-sm font-mono ${profitClass}">${this.escapeHtml(profitValue)}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['参加ハンド総数'])}</td>
                <td class="py-4 px-3 text-right text-gray-300 text-sm font-mono">${this.escapeHtml(player['今シーズンハンド数'])}</td>
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
     * サマリー情報を更新（総参加者数、総ハンド数、開催回数）
     */
    updateSummary(data) {
        // 総参加者数
        const totalPlayers = document.getElementById('total-players');
        if (totalPlayers) {
            totalPlayers.textContent = data.length;
        }

        // 総ハンド数（参加ハンド総数の合計）
        const totalHands = document.getElementById('total-hands');
        if (totalHands) {
            const sum = data.reduce((acc, player) => {
                return acc + (parseInt(player['参加ハンド総数'], 10) || 0);
            }, 0);
            totalHands.textContent = sum.toLocaleString();
        }

        // 開催回数は手動で設定するため、ここでは更新しない
        // 必要に応じて別途データソースから取得
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
