# JPSQL Runner

JPSQL Runner is a Visual Studio Code extension for editing J-parameter SQL (`.jpsql`) files, compiling report-style parameters into regular SQL, and handing the generated SQL to the SQL extension you already use.

This extension uses a neutral name and its own `.jpsql` file format. It is not affiliated with any reporting product or trademark owner.

## File Format

- Source files: `.jpsql`
- Generated files: temporary regular SQL editors in VS Code

`.jpsql` stands for J-parameter SQL. Keeping parameterized report queries separate from regular `.sql` files helps avoid accidentally sending `$P{}` or `$X{}` syntax directly to a SQL runner.

## Features

- Edit parameters in the bottom `JPSQL` panel.
- Compile and run `.jpsql` or `.jrxml` queries from the editor title button or `JPSQL: Compile and Run`.
- Preview generated SQL and parameter values with `JPSQL: Preview Compiled Query`.
- Expand `$P{name}` into SQL literals.
- Expand `$P!{name}` as raw SQL text.
- Support `$X{IN, column, name}`, `$X{NOTIN, column, name}`, `$X{EQUAL, column, name}`, and `$X{NOTEQUAL, column, name}`.
- Leave connection handling, authentication, and result rendering to your configured SQL extension.

## Usage

1. Install dependencies:

   ```sh
   npm install
   ```

2. Compile the extension:

   ```sh
   npm run compile
   ```

3. Open this folder in VS Code and press `F5` to start an Extension Development Host.
4. Create or open a `.jpsql` file.
5. Open the bottom `JPSQL` panel.
6. Click `Get Params` to add parameter names from the current query.
7. Set values in the `Parameters` table.
8. Run `JPSQL: Preview Compiled Query` or `JPSQL: Compile and Run`.

`Get Params` only adds missing parameter names. Existing parameters with the same name keep their type, value, and null setting.

## SQL Runner Command

JPSQL Runner opens the compiled query in a new SQL editor, then invokes the VS Code command configured by `jpsql.runnerCommand`.

For the Microsoft SQL Server extension:

```json
{
  "jpsql.runnerCommand": "mssql.runQuery"
}
```

For SQLTools or another SQL extension, set the command ID that runs the current SQL editor:

```json
{
  "jpsql.runnerCommand": "sqltools.executeQuery"
}
```

If you do not know the command ID, leave it empty. JPSQL Runner will only open the generated SQL, and you can run it with your SQL extension's normal button or command.

```json
{
  "jpsql.runnerCommand": ""
}
```

## Parameter Syntax

```sql
select *
from Orders
where CustomerId = $P{CustomerId}
  and CreatedAt >= $P{FromDate}
  and Status in ($P!{StatusCsv})
```

`$P{CustomerId}` is converted into a SQL literal based on its configured type, such as `123`, `N'ABC'`, or `null`. Single quotes inside strings are escaped for SQL Server-compatible string literals.

Raw parameters use `$P!{name}` and are inserted directly into the generated SQL. Use raw parameters only for trusted values such as column names, `order by` clauses, or known SQL fragments.

String-like parameter values may be entered either as plain text or as quoted expression-style text:

```text
ABC
"ABC"
"A\"B"
"A\nB"
```

For `String`, `Number`, `Boolean`, `Date`, and `DateTime` parameters, a surrounding double-quoted string is parsed before SQL compilation. Raw parameters are not unquoted because they are treated as SQL fragments.

## Collection Parameters

```sql
select *
from Orders
where $X{IN, Status, StatusList}
```

With this parameter:

```text
name: StatusList
type: Array
value: ["A", "B"]
```

The generated SQL is:

```sql
select *
from Orders
where Status in (N'A', N'B')
```

Array values can be JSON arrays or comma-separated text. Empty `IN` arrays compile to `1 = 0`; empty `NOTIN` arrays compile to `1 = 1`.

JSON arrays preserve item types, so numbers, booleans, strings, and `null` values are compiled as SQL literals:

```text
[1, 2, 3]
["A", null, "B"]
[true, false]
```

Comma-separated text is also supported for quick string lists. Quote an item when it contains a comma:

```text
A, B, C
"A","B","C"
"A,B", C, 'D''E'
```

When an `IN` collection contains `null`, JPSQL Runner adds an `or column is null` condition. `NOTIN` collections containing `null` add `and column is not null`. For empty collections, prefer `$X{IN, column, name}` or `$X{NOTIN, column, name}` over `column in ($P{name})` because `$X{}` can produce safe always-false or always-true SQL.

## Development

```sh
npm run check
npm run package
```

The package command creates a `.vsix` file that can be installed locally or attached to a GitHub release.
