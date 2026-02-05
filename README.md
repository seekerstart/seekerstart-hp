# ポーカー鳳凰戦 公式サイト

Seeker Start が運営するポーカーリーグ「鳳凰戦」の公式ホームページです。

## ディレクトリ構成

```
seekerstart-hp/
├── index.html              # トップページ
├── all_stats.html          # 参加者スタッツページ
├── css/
│   └── style.css           # カスタムCSS
├── js/
│   ├── main.js             # メインJS（アニメーション、メニュー等）
│   └── stats-table.js      # CSVからスタッツを読み込むJS
├── data/
│   └── player_stats.csv    # プレイヤースタッツデータ
├── SeekerStart_logo.png    # ロゴ画像
├── houoh_kaimaku.png       # ヒーロー背景画像
└── houoh_season.png        # シーズンバナー画像
```

## 技術スタック

- **HTML5** - セマンティックなマークアップ
- **Tailwind CSS** (CDN) - ユーティリティファーストCSS
- **カスタムCSS** - CSS変数、アニメーション
- **Vanilla JavaScript** - 外部ライブラリ不要
- **Font Awesome** (CDN) - アイコン
- **Google Fonts** - Noto Serif JP, Noto Sans JP

## ローカル開発

### 前提条件

- Python 3.x（ローカルサーバー用）
- モダンブラウザ（Chrome, Firefox, Safari, Edge）

### 起動方法

ブラウザのセキュリティ制限により、`file://` プロトコルではCSVファイルを読み込めません。ローカルサーバーを起動してください。

```bash
# プロジェクトディレクトリに移動
cd seekerstart-hp

# ローカルサーバーを起動（Python 3）
python -m http.server 8000
```

ブラウザで以下のURLにアクセス：

- トップページ: http://localhost:8000/
- スタッツページ: http://localhost:8000/all_stats.html

サーバーを停止するには `Ctrl + C` を押してください。

## プレイヤースタッツの更新

### CSVファイルの編集

`data/player_stats.csv` を編集することで、HTMLを変更せずにスタッツデータを更新できます。

### CSVフォーマット

```csv
プレイヤー,総収支,参加ハンド総数,今シーズンハンド数,VPIP,PFR,3bet,Fold to 3bet,CB,WTSD,W$SD
arash!,+150,1200,450,25.5,18.2,8.5,55.0,65.0,28.5,52.0
sigma,-30,800,320,22.0,16.5,7.2,60.0,58.0,25.0,48.5
```

### 各列の説明

| 列名 | 説明 |
|------|------|
| プレイヤー | プレイヤー名 |
| 総収支 | BB単位の累計収支（+/-を付ける） |
| 参加ハンド総数 | 全シーズン通算のハンド数 |
| 今シーズンハンド数 | 現シーズンのハンド数 |
| VPIP | Voluntarily Put money In Pot (%) |
| PFR | Pre-Flop Raise (%) |
| 3bet | 3bet率 (%) |
| Fold to 3bet | 3betに対するフォールド率 (%) |
| CB | Continuation Bet率 (%) |
| WTSD | Went To ShowDown (%) |
| W$SD | Won money at ShowDown (%) |

### 注意事項

- 1行目はヘッダー行（変更しないでください）
- 各値はカンマ区切り
- 文字コードはUTF-8で保存
- パーセンテージは数値のみ（%記号は不要）

## デプロイ

静的サイトのため、以下のサービスでホスティング可能です：

- GitHub Pages
- Netlify
- Vercel
- Firebase Hosting

## ライセンス

© 2026 POKER HOUOU LEAGUE. ALL RIGHTS RESERVED.
