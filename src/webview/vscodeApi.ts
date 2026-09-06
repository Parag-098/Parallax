/**
 * Thin wrapper around the VS Code webview API injected into the webview context.
 */

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let _vscode: VsCodeApi | undefined;

export function getVsCode(): VsCodeApi {
  if (!_vscode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _vscode = (window as any).acquireVsCodeApi
      ? acquireVsCodeApi()
      : {
          postMessage: (msg: unknown) => console.log('[mock vscode]', msg),
          getState: () => undefined,
          setState: (_s: unknown) => undefined,
        };
  }
  return _vscode;
}

export function postMessage(message: unknown): void {
  getVsCode().postMessage(message);
}
