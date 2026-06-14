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
  const values = arrayValue(parameter);

  if (normalizedFn === 'IN' || normalizedFn === 'NOTIN') {
    if (parameter.isNull) {
      return normalizedFn === 'IN' ? `${column} is null` : `${column} is not null`;
    }

    if (values.length === 0) {
      return normalizedFn === 'IN' ? '1 = 0' : '1 = 1';
    }

    const literals = values.map((value, index) => {
      inputs.push({
        name: `${parameter.name}[${index}]`,
        value,
        type: parameter.type
      });
      return literalFromUnknown(value);
    });
    return `${column} ${normalizedFn === 'IN' ? 'in' : 'not in'} (${literals.join(', ')})`;
  }

  if (normalizedFn === 'EQUAL' || normalizedFn === 'NOTEQUAL') {
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
      return arrayValue(parameter).map(literalFromUnknown).join(', ');
    case 'Raw':
      return rawValue(parameter);
    case 'String':
    default:
      return `N'${escapeSqlString(parameter.value)}'`;
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
      const parsed = Number(parameter.value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Parameter "${parameter.name}" is not a valid number.`);
      }
      return parsed;
    }
    case 'Boolean':
      return ['true', '1', 'yes', 'on'].includes(parameter.value.trim().toLowerCase());
    case 'Date':
    case 'DateTime': {
      const date = new Date(parameter.value);
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
      return parameter.value;
  }
}

function arrayValue(parameter: ReportParameter): unknown[] {
  if (parameter.isNull) {
    return [];
  }

  const trimmed = parameter.value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error(`Parameter "${parameter.name}" must be a JSON array.`);
    }
    return parsed;
  }

  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}
