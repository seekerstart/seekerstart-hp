# ポーカースタッツ計算スクリプト

Poker Now のハンド履歴から自動でスタッツを計算し、CSV を生成するスクリプト群です。

## 必要な依存関係

```bash
pip install pandas
```

## メインスクリプト

### main.py - スタッツ計算メイン

ハンド履歴からスタッツを計算し、CSV を出力します。

```bash
# 基本的な使い方
python scripts/main.py

# 詳細出力
python scripts/main.py --verbose

# ドライラン（ファイル出力なし）
python scripts/main.py --dry-run

# カスタムディレクトリ指定
python scripts/main.py --data-dir data --config-dir config
```

**オプション:**
| オプション | 説明 |
|-----------|------|
| `--data-dir` | データディレクトリのパス（デフォルト: `data`） |
| `--config-dir` | 設定ディレクトリのパス（デフォルト: `config`） |
| `--verbose`, `-v` | 詳細な出力を表示 |
| `--dry-run` | ファイルを書き込まずに動作確認 |

**入力:**
```
data/hand_histories/
└── {YYYYMMDD}/
    ├── player-stats-all-time-*.json   (計算済みスタッツ / シーズン2以降)
    └── table{N}/                       (ハンド履歴 / シーズン1)
        ├── poker_now_log_*.csv
        └── ledger_*.csv
```

**出力:**
- `data/all_stats.csv` - 全期間スタッツ
- `data/season_{N}_stats.csv` - シーズン別スタッツ
- `data/season_{N}_{league}_stats.csv` - リーグ別スタッツ（順位付き）
- `data/session_stats.csv` - 節ごとの個人成績
- `data/season_{N}_stats_raw.csv` - シーズン別スタッツ（分子/分母付き、凍結用）
- `data/season_{N}_session_stats_raw.csv` - 節別スタッツ（凍結用）

---

## プレイヤー管理スクリプト

### find_duplicate_players.py - 重複プレイヤー検出

同じ `display_name` を持つプレイヤーを検出して表示します。

```bash
python scripts/find_duplicate_players.py
```

**出力例:**
```
=== 重複している display_name (3件) ===

arash!:
  ID: k5rEzFp2MR
  Aliases: ['k5rEzFp2MR', 'abc123']
  ID: PB93yGRdRr
  Aliases: ['PB93yGRdRr']
```

### merge_duplicate_players.py - 重複プレイヤー統合

同じ `display_name` を持つプレイヤーを統合し、`aliases` をマージします。

```bash
# ドライラン（確認のみ）
python scripts/merge_duplicate_players.py --dry-run

# 実行
python scripts/merge_duplicate_players.py
```

**処理内容:**
1. 同じ `display_name` を持つプレイヤーをグループ化
2. 各グループの最初の ID をメイン ID として採用
3. 全ての `aliases` を1つの配列に統合
4. `players.json` を更新

### weekly_report.py - 週次レポート生成

週ごとの詳細統計を計算してレポートを出力します。
`main.py` で生成された CSV を参照するため、**必ず `main.py` を先に実行してください**。

```bash
# 1. まずスタッツを計算
python scripts/main.py --verbose

# 2. 週次レポートを生成
python scripts/weekly_report.py
```

**出力内容:**
1. **全体サマリー** - 総開催回数、総参加者数（ユニーク）、総卓数、シーズンごとの総ハンド数
2. **週次レポート** - 各開催日ごとの参加者数、新規参加者、シーズン累計参加者数、400ハンド以上のプレイヤー数
3. **直近2回の参加者分析** - リピート率、両方/片方のみ参加したプレイヤー一覧
4. **シーズン別スタッツランキング**（100ハンド以上対象）
   - VPIP, PFR, 3bet, Fold to 3bet, CB, WTSD, W$SD の上位10名と平均値

---

## モジュール

| ファイル | 説明 |
|---------|------|
| `config_loader.py` | 設定ファイル（`seasons.json`, `players.json`）の読み込み |
| `player_registry.py` | プレイヤー ID 管理、エイリアス管理、ID 変更検出 |
| `csv_formatter.py` | Poker Now CSV のパース、PokerStars 形式への変換 |
| `hand_analysis.py` | スタッツ計算（VPIP, PFR, 3bet, CB, WTSD 等） |
| `stats_aggregator.py` | セッション集計、CSV 出力 |
| `precalc_importer.py` | Poker Now の計算済み JSON を取り込み |

---

## データソースの種類

| 方式 | 対象 | 入力ファイル | 説明 |
|------|------|-------------|------|
| ハンド履歴 | シーズン1 | `poker_now_log_*.csv` + `ledger_*.csv` | ログから全スタッツを再計算 |
| 計算済み JSON | シーズン2以降 | `player-stats-all-time-*.json` | Poker Now のスタッツを取り込み |
| 凍結 CSV | 完了シーズン | `season_{N}_stats_raw.csv` | 再計算せず CSV から復元 |

シーズンの `data_source` と `frozen` フラグは `config/seasons.json` で管理します。

---

## 設定ファイル

### config/seasons.json

シーズン定義とリーグ割り当て。

```json
{
  "seasons": [
    {
      "id": 1,
      "name": "シーズン 1",
      "start_date": "2026-02-01",
      "end_date": "2026-03-31",
      "leagues": { "A": [], "B": [], "C": ["*"] },
      "status": "completed",
      "frozen": true,
      "data_source": "hand_histories",
      "session_count": 9,
      "session_dates": ["20260202", "20260209", "..."]
    },
    {
      "id": 2,
      "name": "シーズン 2",
      "start_date": "2026-04-01",
      "end_date": "2026-05-31",
      "leagues": { "A": [], "B": ["..."], "C": ["*"] },
      "status": "active",
      "frozen": false,
      "data_source": "precalculated",
      "session_count": 2,
      "session_dates": ["20260413", "20260420"]
    }
  ],
  "current_season_id": 2,
  "total_session_count": 11
}
```

> **注意**: `session_count`、`session_dates`、`total_session_count` は `main.py` 実行時に自動更新されます。手動で編集する必要はありません。

### config/players.json

プレイヤー登録と ID エイリアス管理。

```json
{
  "players": {
    "SsAkQq2Oa9": {
      "display_name": "やましー",
      "aliases": ["SsAkQq2Oa9", "oldId123"]
    }
  },
  "id_changes": []
}
```

---

## 典型的なワークフロー

### シーズン2以降: 新しいセッションを追加する

1. **Poker Now から JSON をエクスポート**

   セッション終了後、Poker Now の管理画面から `player-stats-all-time-*.json` をダウンロードします。

2. **日付ディレクトリに配置**
   ```
   data/hand_histories/{YYYYMMDD}/
       player-stats-all-time-YYYY-MM-DDTHH-MM-SS-XXXZ.json
   ```
   例: 4/20 のセッション → `data/hand_histories/20260420/` に配置

3. **スタッツ計算を実行**
   ```bash
   python scripts/main.py --verbose
   ```
   `config/seasons.json` の `session_count`・`session_dates`・`total_session_count` は
   `data/hand_histories/` 内のディレクトリを走査して自動的に計算・更新されるため、手動編集は不要です。

4. **生成された CSV を確認**
   - `data/season_2_stats.csv`
   - `data/all_stats.csv`

5. **週次レポートを確認（任意）**
   ```bash
   python scripts/weekly_report.py
   ```
   参加者数、新規参加者、リピート率、スタッツランキングなどが表示されます。
   ※ `main.py` の実行後に使用してください（出力 CSV に依存します）。

> **仕組み**: Poker Now の JSON は累積データ（all-time）です。システムは日付順にソートして前回との差分を自動計算し、セッション別データを生成します。
> 例: 第1節の JSON（累積）→ そのまま第1節データ、第2節の JSON（累積）→ 第2節 − 第1節 = 第2節データ

### シーズン1（従来方式）: ハンド履歴から計算

1. **ハンド履歴を配置**
   ```
   data/hand_histories/20260211/table1/
   ├── poker_now_log_xxx.csv
   └── ledger_xxx.csv
   ```

2. **スタッツ計算を実行**
   ```bash
   python scripts/main.py --verbose
   ```

### 重複プレイヤーの確認・統合（必要に応じて）

```bash
python scripts/find_duplicate_players.py
python scripts/merge_duplicate_players.py --dry-run
python scripts/merge_duplicate_players.py
```

### シーズンの凍結

シーズンが完了したら `config/seasons.json` で凍結できます。凍結すると raw CSV から復元するようになり、再計算が不要になります。

```json
{
  "status": "completed",
  "frozen": true
}
```

凍結前に `main.py` を1回実行して `season_{N}_stats_raw.csv` と `season_{N}_session_stats_raw.csv` が生成されていることを確認してください。
