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
    └── table{N}/
        ├── poker_now_log_*.csv
        └── ledger_*.csv
```

**出力:**
- `data/all_stats.csv` - 全期間スタッツ
- `data/season_{N}_stats.csv` - シーズン別スタッツ

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

```bash
python scripts/weekly_report.py
```

**出力内容:**
- 週ごとの卓数、参加者数、新規参加者数
- シーズン累計参加者数
- 400ハンド以上プレイしたプレイヤー数
- 直近2回の参加者分析（リピート率、両方参加した人など）
- シーズン別スタッツランキング（100ハンド以上対象）
  - VPIP, PFR, 3bet, CB, WTSD, W$SD の上位10名と平均値

---

## モジュール

| ファイル | 説明 |
|---------|------|
| `config_loader.py` | 設定ファイル（`seasons.json`, `players.json`）の読み込み |
| `player_registry.py` | プレイヤー ID 管理、エイリアス管理、ID 変更検出 |
| `csv_formatter.py` | Poker Now CSV のパース、PokerStars 形式への変換 |
| `hand_analysis.py` | スタッツ計算（VPIP, PFR, 3bet, CB, WTSD 等） |
| `stats_aggregator.py` | セッション集計、CSV 出力 |

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
      "leagues": {
        "A": [],
        "B": [],
        "C": ["*"]
      },
      "status": "active"
    }
  ],
  "current_season_id": 1
}
```

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

3. **重複プレイヤーを確認・統合**（必要に応じて）
   ```bash
   python scripts/find_duplicate_players.py
   python scripts/merge_duplicate_players.py --dry-run
   python scripts/merge_duplicate_players.py
   ```

4. **生成された CSV を確認**
   - `data/all_stats.csv`
   - `data/season_1_stats.csv`
