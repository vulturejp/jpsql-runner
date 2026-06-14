import * as vscode from 'vscode';
import { ReportParameter } from './types';

const parameterKey = 'jpsql.parameters';

export class WorkspaceStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getParameters(): ReportParameter[] {
    return this.context.workspaceState.get<ReportParameter[]>(parameterKey, []);
  }

  async setParameters(parameters: ReportParameter[]): Promise<void> {
    await this.context.workspaceState.update(parameterKey, parameters);
  }
}
