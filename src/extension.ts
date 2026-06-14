import * as vscode from 'vscode';
import { compileReportSql, discoverParameterNames } from './reportSql';
import { WorkspaceStorage } from './storage';
import { ParametersViewProvider, showPreviewWebview } from './webviews';

export function activate(context: vscode.ExtensionContext): void {
  const storage = new WorkspaceStorage(context);
  let parametersViewProvider: ParametersViewProvider;
  parametersViewProvider = new ParametersViewProvider(
    context,
    () => storage.getParameters(),
    () => discoverCurrentParameterNames(),
    async (parameters): Promise<void> => {
      await storage.setParameters(parameters);
      parametersViewProvider.refresh();
    },
    (): Promise<void> => previewQuery(context, storage),
    (): Promise<void> => runQuery(context, storage)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('jpsql.parametersView', parametersViewProvider),
    vscode.commands.registerCommand('jpsql.configureParameters', () => focusParametersView(parametersViewProvider)),
    vscode.commands.registerCommand('jpsql.refreshParameters', () => parametersViewProvider.refresh()),
    vscode.commands.registerCommand('jpsql.previewQuery', () => previewQuery(context, storage)),
    vscode.commands.registerCommand('jpsql.runQuery', () => runQuery(context, storage))
  );
}

export function deactivate(): void {}

async function focusParametersView(parametersViewProvider: ParametersViewProvider): Promise<void> {
  await vscode.commands.executeCommand('workbench.view.extension.jpsql');
  parametersViewProvider.refresh();
}

async function runQuery(context: vscode.ExtensionContext, storage: WorkspaceStorage): Promise<void> {
  const queryText = currentQueryText();
  if (!queryText?.trim()) {
    vscode.window.showWarningMessage('No JPSQL text found. Select a query or open a .jpsql/.jrxml file.');
    return;
  }

  try {
    const compiled = compileReportSql(queryText, storage.getParameters());
    await openCompiledSql(compiled.sql);
    const runnerCommand = getRunnerCommand();
    if (runnerCommand) {
      await vscode.commands.executeCommand(runnerCommand);
    }
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function previewQuery(context: vscode.ExtensionContext, storage: WorkspaceStorage): Promise<void> {
  const queryText = currentQueryText();
  if (!queryText?.trim()) {
    vscode.window.showWarningMessage('No JPSQL text found. Select a query or open a .jpsql/.jrxml file.');
    return;
  }

  try {
    const compiled = compileReportSql(queryText, storage.getParameters());
    showPreviewWebview(context, compiled.sql, compiled.inputs);
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

function currentQueryText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const selection = editor.selection;
  if (!selection.isEmpty) {
    return editor.document.getText(selection);
  }

  return editor.document.getText();
}

function discoverCurrentParameterNames(): string[] {
  const text = currentQueryText();
  return text ? discoverParameterNames(text) : [];
}

async function openCompiledSql(sql: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: sql,
    language: getConfigValue('compiledLanguageId', 'sql')
  });
  const viewColumn = getConfigValue('openCompiledSqlBeside', true) ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  await vscode.window.showTextDocument(document, { preview: false, viewColumn });
}

function getRunnerCommand(): string {
  return getConfigValue('runnerCommand', '').trim();
}

function getConfigValue<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('jpsql').get<T>(key, fallback);
}
