/* ============================================================
 *  ODD METER — 設定ファイル
 * ============================================================
 *  ★ あなたのスプレッドシートを接続する手順 ★
 *
 *  1. Googleスプレッドシートを開く
 *  2. メニュー「ファイル」→「共有」→「ウェブに公開」
 *  3. 対象のシートを選び、形式を「カンマ区切り形式 (.csv)」にして公開
 *  4. 表示されたURLをまるごとコピーし、下の SHEET_CSV_URL に貼り付ける
 *     （末尾が output=csv のURLです）
 *
 *  ※ URLが空のままだと、下のサンプルデータで表示されます。
 *  ※ 列の見出し（曲名/アーティスト/難易度/備考/Link）は
 *     COLUMN_MAP で対応付けています。スプシの見出しが違う場合はここを直してください。
 * ============================================================ */

const ODD_METER_CONFIG = {
  // ↓↓↓ ここにあなたの公開CSV URLを貼るだけ ↓↓↓
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy62_1t7YQtqb_nYDcSYdkGOlJ201wPU6wGTRBsrWWrEfKlh-44kaUEaLHuxT-6sH8Oh3HoQnTpgMq/pub?gid=1901433292&single=true&output=csv",

  // スプレッドシートの見出し → アプリ内部名 の対応
  // 値には「あり得る見出し名」を複数書けます（表記ゆれ吸収）。
  COLUMN_MAP: {
    title:      ["曲名", "タイトル", "title", "song"],
    artist:     ["アーティスト", "artist", "歌手", "バンド"],
    difficulty: ["難易度", "difficulty", "難度", "lv", "level"],
    notes:      ["備考", "メモ", "notes", "note", "remark"],
    link:       ["Link", "link", "リンク", "url", "URL", "YouTube", "youtube"],
    meter:      ["拍子タグ", "拍子", "拍子記号", "タグ", "meter", "time signature", "time"],
  },

  // 難易度の並び順マッピング（必要なら自由に編集）
  // 数値・★の数は自動で数えます。テキスト難易度はここで順序を定義。
  DIFFICULTY_ORDER: ["入門", "初級", "中級", "上級", "超級", "鬼", "発狂"],

  // 「拍子の分布」グラフから除外する拍子。
  // 4/4 は多くの曲の土台なので数が大きくなりすぎ、他の拍子が見えにくいため除外。
  DISTRIBUTION_EXCLUDE: ["4/4"],
};

/* ------------------------------------------------------------
 *  サンプルデータ（SHEET_CSV_URL が空のときに使用）
 *  実際の有名な変拍子曲をベースにしています。
 * ------------------------------------------------------------ */
const ODD_METER_SAMPLE = [
  { 曲名: "Money", アーティスト: "Pink Floyd", 難易度: "中級", 備考: "イントロは7/4。サビで4/4に切り替わる名曲。", Link: "https://www.youtube.com/watch?v=-0kcet4aPpQ" },
  { 曲名: "Take Five", アーティスト: "The Dave Brubeck Quartet", 難易度: "初級", 備考: "5/4 ジャズの代名詞。変拍子入門に最適。", Link: "https://www.youtube.com/watch?v=vmDDOFXSgAs" },
  { 曲名: "Solsbury Hill", アーティスト: "Peter Gabriel", 難易度: "初級", 備考: "全編7/4だが自然に聴ける魔法のような曲。", Link: "https://www.youtube.com/watch?v=GwUdAFcg1cc" },
  { 曲名: "Schism", アーティスト: "Tool", 難易度: "上級", 備考: "5/8と7/8を行き来する。拍子変化の宝庫。", Link: "https://www.youtube.com/watch?v=80RtBV9Xw0o" },
  { 曲名: "Tom Sawyer", アーティスト: "Rush", 難易度: "中級", 備考: "間奏が7/8。プログレ三人衆の技巧。", Link: "https://www.youtube.com/watch?v=auLBLk4ibAk" },
  { 曲名: "Seven Days", アーティスト: "Sting", 難易度: "中級", 備考: "5/4のポップス。歌モノ変拍子の好例。", Link: "https://www.youtube.com/watch?v=qhT5_3Vr2Bc" },
  { 曲名: "15 Step", アーティスト: "Radiohead", 難易度: "中級", 備考: "5/4のエレクトロニカ。In Rainbows冒頭。", Link: "https://www.youtube.com/watch?v=I2dcM1ABaIw" },
  { 曲名: "Anesthetize", アーティスト: "Porcupine Tree", 難易度: "超級", 備考: "17分超の大作。複数の変拍子を横断する。", Link: "https://www.youtube.com/watch?v=Gn3oN1H_3WU" },
  { 曲名: "The Ocean", アーティスト: "Led Zeppelin", 難易度: "中級", 備考: "イントロが7/8 + 4/4の組み合わせ。", Link: "https://www.youtube.com/watch?v=oRoO2BQNYHc" },
  { 曲名: "Living in the Past", アーティスト: "Jethro Tull", 難易度: "初級", 備考: "5/4でヒットした珍しいシングル。", Link: "https://www.youtube.com/watch?v=aBnhZQ3VYHc" },
  { 曲名: "Turn It On Again", アーティスト: "Genesis", 難易度: "上級", 備考: "13/8とも解釈される複雑なグルーヴ。", Link: "https://www.youtube.com/watch?v=h5G3I2pHm5g" },
  { 曲名: "Whitewater", アーティスト: "Rush", 難易度: "上級", 備考: "目まぐるしく拍子が変わるインスト。", Link: "https://www.youtube.com/watch?v=qIR5dQ-Z3eU" },
  { 曲名: "Spoonman", アーティスト: "Soundgarden", 難易度: "中級", 備考: "7/4のグランジ。スプーン演奏も。", Link: "https://www.youtube.com/watch?v=fjJq84Wc1HA" },
  { 曲名: "Pyramid Song", アーティスト: "Radiohead", 難易度: "上級", 備考: "拍の取り方が難解。実質的な変拍子感。", Link: "https://www.youtube.com/watch?v=cIfcLghmt-w" },
  { 曲名: "Frame by Frame", アーティスト: "King Crimson", 難易度: "発狂", 備考: "ギターの位相変拍子。13/8と14/8の交錯。", Link: "https://www.youtube.com/watch?v=p9pH8Ad8b5o" },
  { 曲名: "Outro", アーティスト: "M83", 難易度: "入門", 備考: "ゆったり聴ける拍子感。雰囲気重視の一曲。", Link: "https://www.youtube.com/watch?v=dSj-N5z5SsA" },
];
