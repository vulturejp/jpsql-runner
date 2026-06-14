import * as vscode from 'vscode';
import { QueryInput, ReportParameter } from './types';

export class ParametersViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getParameters: () => ReportParameter[],
    private readonly getDiscoveredNames: () => string[],
    private readonly onSave: (parameters: ReportParameter[]) => Promise<void>,
    private readonly onPreview: () => Promise<void>,
    private readonly onRun: () => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.render();
    webviewView.webview.onDidReceiveMessage(async (message: { type: string; parameters?: ReportParameter[] }) => {
      if (message.type === 'save' && message.parameters) {
        await this.onSave(message.parameters);
        vscode.window.showInformationMessage('JPSQL parameters saved.');
      }
      if (message.type === 'preview') {
        await this.onPreview();
      }
      if (message.type === 'run') {
        await this.onRun();
      }
      if (message.type === 'refresh') {
        this.render();
      }
    }, undefined, this.context.subscriptions);
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = parametersHtml(this.view.webview, this.getParameters(), this.getDiscoveredNames(), true);
  }
}

export function showParametersWebview(
  context: vscode.ExtensionContext,
  initialParameters: ReportParameter[],
  discoveredNames: string[],
  onSave: (parameters: ReportParameter[]) => Promise<void>
): void {
  const panel = vscode.window.createWebviewPanel(
    'jpsql.parameters',
    'JPSQL Parameters',
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  panel.webview.html = parametersHtml(panel.webview, initialParameters, discoveredNames, false);
  panel.webview.onDidReceiveMessage(async (message: { type: string; parameters?: ReportParameter[] }) => {
    if (message.type === 'save' && message.parameters) {
      await onSave(message.parameters);
      vscode.window.showInformationMessage('JPSQL parameters saved.');
    }
  }, undefined, context.subscriptions);
}

export function showResultsWebview(
  context: vscode.ExtensionContext,
  title: string,
  compiledSql: string,
  columns: string[],
  rows: Record<string, unknown>[],
  rowsAffected: number[]
): void {
  const panel = vscode.window.createWebviewPanel(
    'jpsql.results',
    title,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = resultsHtml(compiledSql, columns, rows, rowsAffected);
  context.subscriptions.push(panel);
}

export function showPreviewWebview(
  context: vscode.ExtensionContext,
  compiledSql: string,
  inputs: QueryInput[]
): void {
  const panel = vscode.window.createWebviewPanel(
    'jpsql.preview',
    'JPSQL Preview',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = previewHtml(compiledSql, inputs);
  context.subscriptions.push(panel);
}

function parametersHtml(
  webview: vscode.Webview,
  parameters: ReportParameter[],
  discoveredNames: string[],
  panelMode: boolean
): string {
  const nonce = nonceValue();
  const initial = [...parameters];
  return htmlShell(nonce, 'JPSQL Parameters', `
    <main class="${panelMode ? 'panel-editor' : 'editor'}">
      <header class="editor-header">
        <div>
          <h1>JPSQL Parameters</h1>
        </div>
        <div class="actions">
          <button id="scan">Get Params</button>
          <button id="add">Add</button>
          <button class="primary" id="save">Save</button>
          ${panelMode ? '<button id="preview">Preview</button><button id="run">Run</button><button id="refresh">Refresh</button>' : ''}
        </div>
      </header>
      <div class="parameter-table-wrap">
        <table class="parameter-table">
          <colgroup>
            <col class="name-col">
            <col class="type-col">
            <col class="null-col">
            <col class="value-col">
            <col class="remove-col">
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Null</th>
              <th>Value</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const types = ['String', 'Number', 'Boolean', 'Date', 'DateTime', 'Array', 'Raw'];
      let parameters = ${json(initial)};
      const discoveredNames = ${json(discoveredNames)};
      const rows = document.getElementById('rows');

      function render() {
        rows.innerHTML = '';
        parameters.forEach((parameter, index) => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td><input data-field="name" value="\${escapeAttr(parameter.name)}" placeholder="CustomerId"></td>
            <td><select data-field="type">\${types.map(type => \`<option value="\${type}" \${parameter.type === type ? 'selected' : ''}>\${type}</option>\`).join('')}</select></td>
            <td class="null-cell"><input type="checkbox" data-field="isNull" aria-label="Null" \${parameter.isNull ? 'checked' : ''}></td>
            <td><textarea data-field="value" rows="1" placeholder="値、CSV、または JSON 配列">\${escapeText(parameter.value ?? '')}</textarea></td>
            <td class="remove-cell"><button class="remove" data-remove title="Remove">Remove</button></td>
          \`;
          row.querySelectorAll('[data-field]').forEach(input => {
            input.addEventListener('input', () => update(index, input));
            input.addEventListener('change', () => update(index, input));
          });
          row.querySelector('[data-remove]').addEventListener('click', () => {
            parameters.splice(index, 1);
            render();
          });
          rows.appendChild(row);
        });
      }

      function update(index, input) {
        const field = input.dataset.field;
        parameters[index][field] = input.type === 'checkbox' ? input.checked : input.value;
      }

      document.getElementById('add').addEventListener('click', () => {
        parameters.push({ name: '', type: 'String', value: '', isNull: false });
        render();
      });

      document.getElementById('scan').addEventListener('click', () => {
        const existingNames = new Set(parameters.map(parameter => parameter.name).filter(Boolean));
        const newNames = discoveredNames.filter(name => !existingNames.has(name));
        parameters.push(...newNames.map(name => ({ name, type: 'String', value: '', isNull: false })));
        render();
      });

      document.getElementById('save').addEventListener('click', () => {
        vscode.postMessage({ type: 'save', parameters: parameters.filter(p => p.name.trim()) });
      });

      document.getElementById('preview')?.addEventListener('click', () => vscode.postMessage({ type: 'preview' }));
      document.getElementById('run')?.addEventListener('click', () => vscode.postMessage({ type: 'run' }));
      document.getElementById('refresh')?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

      function escapeAttr(value) {
        return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
      }

      function escapeText(value) {
        return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
      }

      render();
    </script>
  `, webview);
}

function resultsHtml(
  compiledSql: string,
  columns: string[],
  rows: Record<string, unknown>[],
  rowsAffected: number[]
): string {
  const nonce = nonceValue();
  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatValue(row[column]))}</td>`).join('')}</tr>`).join('');
  return htmlShell(nonce, 'Query Results', `
    <main>
      <header>
        <h1>Query Results</h1>
        <span>${rows.length} rows shown · ${rowsAffected.join(', ') || 0} affected</span>
      </header>
      <details>
        <summary>Compiled SQL</summary>
        <pre>${escapeHtml(compiledSql)}</pre>
      </details>
      <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </main>
  `);
}

function previewHtml(compiledSql: string, inputs: QueryInput[]): string {
  const nonce = nonceValue();
  const rows = inputs.map((input) => `
    <tr>
      <td>${escapeHtml(input.name)}</td>
      <td>${escapeHtml(input.type)}</td>
      <td>${escapeHtml(formatValue(input.value))}</td>
    </tr>
  `).join('');

  return htmlShell(nonce, 'JPSQL Preview', `
    <main>
      <header>
        <h1>JPSQL Preview</h1>
        <span>${inputs.length} bound values</span>
      </header>
      <section>
        <h2>Compiled SQL</h2>
        <pre>${escapeHtml(compiledSql)}</pre>
      </section>
      <section>
        <h2>Bound Values</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </main>
  `);
}

function htmlShell(nonce: string, title: string, body: string, _webview?: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; }
    main { padding: 18px; }
    header { align-items: center; display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; }
    p { color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
    h2 { font-size: 13px; font-weight: 600; margin: 18px 0 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 8px; text-align: left; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    input, select, textarea, button { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); font: inherit; padding: 6px 8px; }
    input, select, textarea { box-sizing: border-box; width: 100%; }
    textarea { min-height: 32px; resize: vertical; }
    button { cursor: pointer; width: auto; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
    button.icon { min-width: 30px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; max-width: 520px; }
    pre { background: var(--vscode-textCodeBlock-background); overflow: auto; padding: 12px; }
    summary { cursor: pointer; margin-bottom: 8px; }
    .sidebar { padding: 12px; }
    .summary { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; margin-bottom: 10px; }
    .metric { border: 1px solid var(--vscode-panel-border); padding: 10px; }
    .metric strong { display: block; font-size: 20px; line-height: 1; margin-bottom: 4px; }
    .metric span, .parameter-list span { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .notice { border-left: 3px solid var(--vscode-notificationsWarningIcon-foreground); padding-left: 8px; }
    .stack { display: grid; gap: 8px; margin: 12px 0; }
    .stack button { width: 100%; }
    .parameter-list { list-style: none; margin: 0; padding: 0; }
    .parameter-list li { border-top: 1px solid var(--vscode-panel-border); display: grid; gap: 4px; padding: 10px 0; }
    .parameter-list li.empty { color: var(--vscode-descriptionForeground); }
    .parameter-list strong { display: block; font-size: 13px; }
    .parameter-list code { color: var(--vscode-textPreformat-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .editor { max-width: 1180px; }
    .editor-header { align-items: flex-start; position: sticky; top: 0; z-index: 2; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; }
    .panel-editor { min-width: 720px; padding: 12px; }
    .parameter-table-wrap { border: 1px solid var(--vscode-panel-border); overflow: auto; }
    .parameter-table { min-width: 760px; table-layout: fixed; }
    .parameter-table th { background: var(--vscode-editor-background); position: sticky; top: 0; z-index: 1; }
    .parameter-table td { padding: 6px; }
    .parameter-table input, .parameter-table select, .parameter-table textarea { min-height: 30px; }
    .name-col { width: 26%; }
    .type-col { width: 150px; }
    .null-col { width: 72px; }
    .value-col { width: auto; }
    .remove-col { width: 96px; }
    .null-cell, .remove-cell { text-align: center; vertical-align: middle; }
    .null-cell input { width: auto; }
    .remove { width: 100%; }
    @media (max-width: 760px) {
      .actions { flex-wrap: wrap; }
      .editor-header { display: block; }
      .panel-editor { min-width: 0; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function json(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function nonceValue(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
