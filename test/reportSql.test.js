const assert = require('node:assert/strict');
const { compileReportSql, discoverParameterNames } = require('../dist/reportSql');

const parameters = [
  { name: 'Id', type: 'Number', value: '42', isNull: false },
  { name: 'Name', type: 'String', value: "O'Brien", isNull: false },
  { name: 'Statuses', type: 'Array', value: '["A","B"]', isNull: false },
  { name: 'Sort', type: 'Raw', value: 'CreatedAt desc', isNull: false }
];

const source = [
  'select *',
  'from Orders',
  'where Id = $P{Id}',
  '  and Name = $P{Name}',
  '  and $X{IN, Status, Statuses}',
  'order by $P!{Sort}'
].join('\n');

assert.deepEqual(discoverParameterNames(source), ['Id', 'Name', 'Sort', 'Statuses']);

const compiled = compileReportSql(source, parameters);

assert.equal(
  compiled.sql,
  [
    'select *',
    'from Orders',
    'where Id = 42',
    "  and Name = N'O''Brien'",
    "  and Status in (N'A', N'B')",
    'order by CreatedAt desc'
  ].join('\n')
);

assert.deepEqual(
  compiled.inputs.map((input) => input.name),
  ['Statuses[0]', 'Statuses[1]', 'Id', 'Name']
);

assert.equal(
  compileReportSql('where Name = $P{Name}', [
    { name: 'Name', type: 'String', value: '"Alice"', isNull: false }
  ]).sql,
  "where Name = N'Alice'"
);

assert.deepEqual(
  compileReportSql('where Name = $P{Name}', [
    { name: 'Name', type: 'String', value: '"A\\"B\\\\C"', isNull: false }
  ]).inputs[0].value,
  'A"B\\C'
);

assert.equal(
  compileReportSql('where CreatedAt >= $P{FromDate}', [
    { name: 'FromDate', type: 'Date', value: '"2024-01-02"', isNull: false }
  ]).sql,
  "where CreatedAt >= N'2024-01-02T00:00:00.000Z'"
);

assert.equal(
  compileReportSql('where Id = $P{Id}', [
    { name: 'Id', type: 'Number', value: '"42"', isNull: false }
  ]).sql,
  'where Id = 42'
);

assert.equal(
  compileReportSql('where IsActive = $P{Flag}', [
    { name: 'Flag', type: 'Boolean', value: '"true"', isNull: false }
  ]).sql,
  'where IsActive = 1'
);

assert.equal(
  compileReportSql('where $X{IN, Status, EmptyList}', [
    { name: 'EmptyList', type: 'Array', value: '', isNull: false }
  ]).sql,
  'where 1 = 0'
);

assert.equal(
  compileReportSql('where $X{NOTIN, Status, EmptyList}', [
    { name: 'EmptyList', type: 'Array', value: '', isNull: false }
  ]).sql,
  'where 1 = 1'
);

assert.equal(
  compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: 'A, B, C', isNull: false }
  ]).sql,
  "where Status in (N'A', N'B', N'C')"
);

assert.equal(
  compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '"A,B", C, \'D\'\'E\'', isNull: false }
  ]).sql,
  "where Status in (N'A,B', N'C', N'D''E')"
);

assert.equal(
  compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '"A","B","C"', isNull: false }
  ]).sql,
  "where Status in (N'A', N'B', N'C')"
);

assert.equal(
  compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '"A\\"B", "C\\\\D"', isNull: false }
  ]).sql,
  "where Status in (N'A\"B', N'C\\D')"
);

assert.equal(
  compileReportSql('where $X{IN, Id, Ids}', [
    { name: 'Ids', type: 'Array', value: '[1, 2, 3]', isNull: false }
  ]).sql,
  'where Id in (1, 2, 3)'
);

assert.equal(
  compileReportSql('where $X{IN, IsActive, Flags}', [
    { name: 'Flags', type: 'Array', value: '[true, false]', isNull: false }
  ]).sql,
  'where IsActive in (1, 0)'
);

assert.equal(
  compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '["A", null, "B"]', isNull: false }
  ]).sql,
  "where (Status in (N'A', N'B') or Status is null)"
);

assert.equal(
  compileReportSql('where $X{NOTIN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '["A", null]', isNull: false }
  ]).sql,
  "where (Status not in (N'A') and Status is not null)"
);

assert.equal(
  compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '[null]', isNull: false }
  ]).sql,
  'where Status is null'
);

assert.equal(
  compileReportSql('where Status in ($P{Statuses})', [
    { name: 'Statuses', type: 'Array', value: '["A", "B"]', isNull: false }
  ]).sql,
  "where Status in (N'A', N'B')"
);

assert.equal(
  compileReportSql('where Status in ($P{Statuses})', [
    { name: 'Statuses', type: 'Array', value: '', isNull: false }
  ]).sql,
  'where Status in (null)'
);

assert.throws(
  () => compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '[1,', isNull: false }
  ]),
  /Parameter "Statuses" must be a valid JSON array\./
);

assert.throws(
  () => compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '{"A": true}', isNull: false }
  ]),
  /Parameter "Statuses" must be a JSON array\./
);

assert.throws(
  () => compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '"A', isNull: false }
  ]),
  /Parameter "Statuses" has an unterminated quoted CSV item\./
);

assert.throws(
  () => compileReportSql('where Name = $P{Name}', [
    { name: 'Name', type: 'String', value: '"Alice', isNull: false }
  ]),
  /Parameter "Name" has an unterminated quoted string\./
);

assert.throws(
  () => compileReportSql('where $X{IN, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '"A" extra, "B"', isNull: false }
  ]),
  /Parameter "Statuses" has unexpected text after a quoted CSV item\./
);

assert.throws(
  () => compileReportSql('where $X{EQUAL, Status, Statuses}', [
    { name: 'Statuses', type: 'Array', value: '["A"]', isNull: false }
  ]),
  /\$X\{EQUAL, \.\.\.\} does not support Array parameter "Statuses"\./
);

console.log('reportSql tests passed');
