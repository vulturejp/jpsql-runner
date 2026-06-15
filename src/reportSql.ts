import { CompiledQuery, QueryInput, ReportParameter } from './types';

const paramPattern = /\$P(!)?\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const xPattern = /\$X\{\s*([A-Za-z]+)\s*,\s*([^,{}]+?)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;

export function compileReportSql(sql: string, parameters: ReportParameter[]): CompiledQuery {
  const byName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  const inputs: QueryInput[] = [];

  let compiled = sql.replace(xPattern, (_match, fn: string, column: string, name: string) => {
    const parameter = requireParameter(byName, name);
    return compileXExpression(fn, column.trim(), parameter, inputs);
  });

  compiled = compiled.replace(paramPattern, (_match, rawMarker: string | undefined, name: string) => {
    const parameter = requireParameter(byName, name);

    if (rawMarker) {
      return rawValue(parameter);
    }

    inputs.push({
      name,
      value: typedValue(parameter),
      type: parameter.type
    });
    return sqlLiteral(parameter);
  });

  return { sql: compiled, inputs };
}

export function discoverParameterNames(sql: string): string[] {
  const names = new Set<string>();
  for (const match of sql.matchAll(paramPattern)) {
    names.add(match[2]);
  }
  for (const match of sql.matchAll(xPattern)) {
    names.add(match[3]);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function compileXExpression(fn: string, column: string, parameter: ReportParameter, inputs: QueryInput[]): string {
  const normalizedFn = fn.toUpperCase();

  if (normalizedFn === 'IN' || normalizedFn === 'NOTIN') {
    if (parameter.isNull) {
      return normalizedFn === 'IN' ? `${column} is null` : `${column} is not null`;
    }

    const values = arrayValue(parameter);
    if (values.length === 0) {
      return normalizedFn === 'IN' ? '1 = 0' : '1 = 1';
    }

    const nonNullValues = values.filter((value) => value !== null && value !== undefined);
    const hasNullValue = nonNullValues.length !== values.length;
    if (nonNullValues.length === 0) {
      return normalizedFn === 'IN' ? `${column} is null` : `${column} is not null`;
    }

    const literals = nonNullValues.map((value, index) => {
      inputs.push({
        name: `${parameter.name}[${index}]`,
        value,
        type: parameter.type
      });
      return literalFromUnknown(value);
    });

    const collectionSql = `${column} ${normalizedFn === 'IN' ? 'in' : 'not in'} (${literals.join(', ')})`;
    if (!hasNullValue) {
      return collectionSql;
    }

    return normalizedFn === 'IN'
      ? `(${collectionSql} or ${column} is null)`
      : `(${collectionSql} and ${column} is not null)`;
  }

  if (normalizedFn === 'EQUAL' || normalizedFn === 'NOTEQUAL') {
    if (parameter.type === 'Array') {
      throw new Error(`$X{${normalizedFn}, ...} does not support Array parameter "${parameter.name}". Use IN or NOTIN.`);
    }

    if (parameter.isNull) {
      return `${column} is ${normalizedFn === 'EQUAL' ? '' : 'not '}null`;
    }

    inputs.push({
      name: parameter.name,
      value: typedValue(parameter),
      type: parameter.type
    });
    return `${column} ${normalizedFn === 'EQUAL' ? '=' : '<>'} ${sqlLiteral(parameter)}`;
  }

  throw new Error(`Unsupported $X function: ${fn}`);
}

function sqlLiteral(parameter: ReportParameter): string {
  if (parameter.isNull) {
    return 'null';
  }

  switch (parameter.type) {
    case 'Number':
      return String(typedValue(parameter));
    case 'Boolean':
      return typedValue(parameter) ? '1' : '0';
    case 'Date':
    case 'DateTime':
      return `N'${escapeSqlString(formatDateLiteral(typedValue(parameter)))}'`;
    case 'Array':
      return arrayValue(parameter).map(literalFromUnknown).join(', ') || 'null';
    case 'Raw':
      return rawValue(parameter);
    case 'String':
    default:
      return `N'${escapeSqlString(scalarText(parameter))}'`;
  }
}

function literalFromUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (value instanceof Date) {
    return `N'${escapeSqlString(formatDateLiteral(value))}'`;
  }
  return `N'${escapeSqlString(String(value))}'`;
}

function formatDateLiteral(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function requireParameter(parameters: Map<string, ReportParameter>, name: string): ReportParameter {
  const parameter = parameters.get(name);
  if (!parameter) {
    throw new Error(`Parameter "${name}" is not configured.`);
  }
  return parameter;
}

function rawValue(parameter: ReportParameter): string {
  if (parameter.isNull) {
    return 'null';
  }
  return parameter.value;
}

function typedValue(parameter: ReportParameter): unknown {
  if (parameter.isNull) {
    return null;
  }

  switch (parameter.type) {
    case 'Number': {
      const parsed = Number(scalarText(parameter));
      if (Number.isNaN(parsed)) {
        throw new Error(`Parameter "${parameter.name}" is not a valid number.`);
      }
      return parsed;
    }
    case 'Boolean':
      return ['true', '1', 'yes', 'on'].includes(scalarText(parameter).trim().toLowerCase());
    case 'Date':
    case 'DateTime': {
      const date = new Date(scalarText(parameter));
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Parameter "${parameter.name}" is not a valid date.`);
      }
      return date;
    }
    case 'Array':
      return arrayValue(parameter);
    case 'Raw':
    case 'String':
    default:
      return scalarText(parameter);
  }
}

function scalarText(parameter: ReportParameter): string {
  return parseMaybeQuotedString(parameter.name, parameter.value);
}

function arrayValue(parameter: ReportParameter): unknown[] {
  if (parameter.isNull) {
    return [];
  }

  const trimmed = parameter.value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Parameter "${parameter.name}" must be a valid JSON array.`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Parameter "${parameter.name}" must be a JSON array.`);
    }
    return parsed;
  }

  return parseCsvArray(parameter.name, trimmed);
}

function parseCsvArray(parameterName: string, value: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let fieldWasQuoted = false;
  let afterQuotedField = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote) {
      if (character === quote) {
        const next = value[index + 1];
        if (next === quote) {
          current += quote;
          index += 1;
        } else {
          quote = undefined;
          afterQuotedField = true;
        }
      } else if (character === '\\' && value[index + 1]) {
        current += unescapeCharacter(value[index + 1]);
        index += 1;
      } else {
        current += character;
      }
      continue;
    }

    if (afterQuotedField && character !== ',' && !/\s/.test(character)) {
      throw new Error(`Parameter "${parameterName}" has unexpected text after a quoted CSV item.`);
    }

    if ((character === '"' || character === "'") && current.trim() === '') {
      quote = character;
      fieldWasQuoted = true;
      current = '';
      afterQuotedField = false;
      continue;
    }

    if (character === ',') {
      pushCsvItem(items, current, fieldWasQuoted);
      current = '';
      fieldWasQuoted = false;
      afterQuotedField = false;
      continue;
    }

    current += character;
  }

  if (quote) {
    throw new Error(`Parameter "${parameterName}" has an unterminated quoted CSV item.`);
  }

  pushCsvItem(items, current, fieldWasQuoted);
  return items;
}

function pushCsvItem(items: string[], value: string, fieldWasQuoted: boolean): void {
  const item = fieldWasQuoted ? value.trimEnd() : value.trim();
  if (item !== '') {
    items.push(item);
  }
}

function parseMaybeQuotedString(parameterName: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) {
    return value;
  }

  const parsed = parseQuotedString(parameterName, trimmed);
  if (parsed.endIndex !== trimmed.length) {
    const rest = trimmed.slice(parsed.endIndex).trim();
    if (rest) {
      throw new Error(`Parameter "${parameterName}" has unexpected text after a quoted string.`);
    }
  }
  return parsed.value;
}

function parseQuotedString(parameterName: string, value: string): { value: string; endIndex: number } {
  let result = '';

  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      return { value: result, endIndex: index + 1 };
    }
    if (character === '\\') {
      if (index + 1 >= value.length) {
        throw new Error(`Parameter "${parameterName}" has an unterminated escape sequence.`);
      }
      result += unescapeCharacter(value[index + 1]);
      index += 1;
      continue;
    }
    result += character;
  }

  throw new Error(`Parameter "${parameterName}" has an unterminated quoted string.`);
}

function unescapeCharacter(character: string): string {
  switch (character) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    default:
      return character;
  }
}
