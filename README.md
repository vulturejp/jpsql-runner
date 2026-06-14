# JPSQL Runner

VS Code で J-parameter SQL (`.jpsql`) を編集し、変換後の通常 SQL を好みの SQL 拡張へ渡して実行するための拡張です。

この拡張は中立的な名前と独自の `.jpsql` 形式を使います。特定のレポート製品・商標とは提携していません。

## ファイル形式

- 変換前: `.jpsql`
- 変換後: VS Code 上の一時的な通常 SQL エディタ

`.jpsql` は J-parameter SQL の略です。通常の `.sql` と分けることで、`$P{}` や `$X{}` が残ったまま SQL 拡張へ渡される混乱を避けます。

## 主な機能

- 下部パネルの `JPSQL` でパラメータを広く編集
- エディタ右上の実行ボタン、または `JPSQL: Compile and Run` から `.jpsql` / `.jrxml` のクエリを変換して実行
- `JPSQL: Preview Compiled Query` で変換後 SQL と値を確認
- `$P{name}` を SQL リテラルへ展開
- `$P!{name}` を生 SQL として展開
- `$X{IN, column, name}` / `$X{NOTIN, column, name}` / `$X{EQUAL, column, name}` に対応
- 接続、認証、実行結果表示は設定した SQL 拡張に任せる

## 使い方

1. `npm install`
2. `npm run compile`
3. VS Code でこのフォルダを開き、`F5` で Extension Development Host を起動
4. `.jpsql` ファイルを作成
5. 下部パネルの `JPSQL` を開く
6. `Get Params` で現在のクエリからパラメータ名を取り込む
7. `Parameters` で `$P{}` に入れる値を設定
8. `JPSQL: Preview Compiled Query` または `JPSQL: Compile and Run`

`Get Params` は未登録の名前だけを追加します。既存の同名パラメータの型、値、Null 設定は上書きしません。

## SQL 拡張への渡し方

この拡張は変換後 SQL を新しい SQL エディタで開き、その後に設定 `jpsql.runnerCommand` の VS Code コマンドを呼びます。

Microsoft SQL Server 拡張を使う場合:

```json
{
  "jpsql.runnerCommand": "mssql.runQuery"
}
```

SQLTools など別の拡張を使う場合は、その拡張の「現在のエディタを実行する」コマンド ID に変えてください。

```json
{
  "jpsql.runnerCommand": "sqltools.executeQuery"
}
```

コマンド ID が分からない場合は、まず `jpsql.runnerCommand` を空にしてください。変換後 SQL だけが開くので、その SQL エディタ上で普段使っている SQL 拡張の実行ボタンを押せます。

```json
{
  "jpsql.runnerCommand": ""
}
```

## 対応する置換

```sql
select *
from Orders
where CustomerId = $P{CustomerId}
  and CreatedAt >= $P{FromDate}
  and Status in ($P!{StatusCsv})
```

`$P{CustomerId}` は型に応じて `123`、`N'ABC'`、`null` のような SQL リテラルに変換されます。文字列内の `'` は SQL Server 互換の形式でエスケープされます。

```sql
select *
from Orders
where $X{IN, Status, StatusList}
```

`StatusList` が配列の場合、`Status in (N'A', N'B', ...)` に変換されます。空配列の場合は常に偽になる `1 = 0` に変換されます。

`$P!{...}` は SQL 文字列として直接埋め込まれます。列名や `order by` 句などに使えますが、信頼できる値だけに使ってください。
