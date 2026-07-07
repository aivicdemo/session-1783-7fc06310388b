// AIVIC Backend Configuration
// AIVIC_APP_URL 環境変数が設定されている場合は自動セットされます
// 未設定の場合: REPLACE_WITH_API_URL を AIVIC アプリの URL（例: https://your-app.amplifyapp.com）に書き換えてください

window.AIVIC_API_URL = "REPLACE_WITH_API_URL";
window.AIVIC_TABLES = {
  "物価本マスタ": 0,
  "乖離分析結果": 1,
  "自動判定結果": 2,
  "査定員判定結果": 3,
  "判定差異記録": 4,
  "相場判定ロジック": 5,
  "ロジック試行検証結果": 6,
  "ダッシュボード集計データ": 7,
  "操作履歴ログ": 8
};
