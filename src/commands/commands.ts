/**
 * VS Code command registrations for Parallax.
 */
import * as vscode from 'vscode';
import type { ParallaxController } from '../extension';

export function registerCommands(
  context: vscode.ExtensionContext,
  controller: ParallaxController,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('parallax.startRecording', async () => {
      await controller.startRecording();
    }),

    vscode.commands.registerCommand('parallax.stopRecording', async () => {
      await controller.stopRecording();
    }),

    vscode.commands.registerCommand('parallax.openTimeline', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.parallax-sidebar');
    }),

    vscode.commands.registerCommand('parallax.createCheckpoint', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Checkpoint name',
        placeHolder: 'e.g. Authentication Complete',
        validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
      });
      if (!name) {
        return;
      }
      const description = await vscode.window.showInputBox({
        prompt: 'Description (optional)',
        placeHolder: 'What was completed or why is this moment important?',
      });
      await controller.createCheckpoint(name.trim(), (description ?? '').trim());
      void vscode.window.showInformationMessage(`Parallax: Checkpoint "${name}" created.`);
    }),
  );
}
