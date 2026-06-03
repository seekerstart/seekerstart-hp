## シーズン移行スクリプト実装計画

### 目的
Season 2 の結果を元に、各プレイヤーの次シーズンのリーグを決定するスクリプトを作成する。

### 新規ファイル
- `scripts/season_transition.py`

### 処理フロー

1. **データ読み込み**
   - `config/seasons.json` から対象シーズンのリーグ定義（B リーグの全メンバーID一覧）を取得
   - `data/season_{id}_stats.csv` からシーズン成績（player_id, リーグ, 収支, ハンド数）を読み込み
   - CSV に載っていない B リーグメンバーは 0 ハンド・0 収支として扱う

2. **B リーグの昇格・降格判定**
   - B リーグ全員（config で明示的にリストされた全メンバー）を収支順にランク付け
   - 上位 25%（四捨五入）= 昇格候補。そのうち ≥ required_hands の人だけ A へ昇格
   - 下位 25%（四捨五入）= 降格。C へ
   - 上記に該当しないが < required_hands の人も全員 C へ降格
   - 残り（≥ required_hands で中間層）→ B に残留

3. **C リーグの昇格判定**
   - C リーグ全員（CSV 上でリーグ=C の全プレイヤー）を収支順にランク付け
   - 上位 40%（四捨五入）= 昇格候補。そのうち ≥ required_hands の人だけ B へ昇格
   - それ以外は C に残留

4. **A リーグ**
   - 全員 A に残留（現状 A リーグは空）

5. **出力**
   - コンソールに移動一覧レポートを表示（昇格・降格・残留を一覧表示）
   - 新シーズン用の `leagues` JSON オブジェクトを出力（seasons.json に貼り付け可能）

### CLI インターフェース
```
python scripts/season_transition.py --season 2 [--verbose] [--dry-run]
```
- `--season`: 対象シーズン ID（必須）
- `--verbose`: 詳細なランキング情報を表示
- `--dry-run`: デフォルト動作（現時点では seasons.json を自動変更しない）

### seasons.json の league_rules 更新
現在の config と実際のルールに差異があるため、Season 2 の `league_rules` を以下に更新:
```json
"league_rules": {
  "required_hands": 1000,
  "promotion": {
    "B_to_A": { "top_percent": 0.25 },
    "C_to_B": { "top_percent": 0.4 }
  },
  "relegation": {
    "B_to_C": { "bottom_percent": 0.25 }
  }
}
```

### 変更しないファイル
- `stats_aggregator.py`, `main.py`, `config_loader.py` — 既存のランキング計算・CSV 出力は変更不要
