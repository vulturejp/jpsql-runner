export type ReportParameterType =
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'Date'
  | 'DateTime'
  | 'Array'
  | 'Raw';

export interface ReportParameter {
  name: string;
  type: ReportParameterType;
  value: string;
  isNull?: boolean;
}

export interface CompiledQuery {
  sql: string;
  inputs: QueryInput[];
}

export interface QueryInput {
  name: string;
  value: unknown;
  type: ReportParameterType;
}
