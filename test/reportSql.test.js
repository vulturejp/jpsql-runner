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

console.log('reportSql tests passed');
