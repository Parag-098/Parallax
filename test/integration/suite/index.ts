import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { createHash } from 'crypto';

async function filesUnder(root:string):Promise<string[]>{const result:string[]=[];async function walk(dir:string):Promise<void>{let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return;}for(const entry of entries){const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else result.push(full);}}await walk(root);return result;}
async function waitFor(predicate:()=>Promise<boolean>,label:string):Promise<void>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await predicate())return;await new Promise<void>(resolve=>setTimeout(resolve,100));}throw new Error(`Timed out waiting for ${label}`);}
function workspaceStorage(base:string):string{const roots=[...(vscode.workspace.workspaceFolders??[])].sort((a,b)=>a.uri.toString().localeCompare(b.uri.toString()));const identity=roots.length===1?roots[0]!.uri.toString():roots.map(folder=>folder.uri.toString()).join('\n');return path.join(base,createHash('sha256').update(Buffer.from(identity,'utf8')).digest('hex'));}

export async function run():Promise<void>{
 const extension=vscode.extensions.getExtension('parallax-dev.parallax');assert.ok(extension,'Parallax extension is installed in the development host');await extension!.activate();
 const contributions=extension!.packageJSON.contributes as {viewsContainers?:{activitybar?:{id:string}[]};views?:Record<string,{id:string}[]>};assert.ok(contributions.viewsContainers?.activitybar?.some(view=>view.id==='parallax'),'Parallax Activity Bar container is contributed');assert.ok(contributions.views?.parallax?.some(view=>view.id==='parallax.timeline'),'Parallax timeline view is contributed');
 const commands=await vscode.commands.getCommands(true);assert.ok(commands.includes('parallax.startRecording'));assert.ok(commands.includes('parallax.stopRecording'));
 assert.ok(vscode.workspace.workspaceFolders?.length,'Disposable test workspace is open');
 await vscode.commands.executeCommand('parallax.startRecording');
 const root=vscode.workspace.workspaceFolders![0]!.uri,file=vscode.Uri.joinPath(root,'integration-smoke.ts'),initialStorage=workspaceStorage(process.env.PARALLAX_TEST_STORAGE!);
 assert.ok(vscode.workspace.workspaceFile,'Root-change integration requires a saved multi-root .code-workspace');
 await waitFor(async()=>{for(const eventFile of await filesUnder(initialStorage)){if(!path.basename(eventFile).startsWith('events-'))continue;try{if((await fs.readFile(eventFile,'utf8')).split('\n').some(line=>{try{const event=JSON.parse(line) as {kind?:string;metadata?:{complete?:string}};return event.kind==='workspace-baseline'&&event.metadata?.complete==='true';}catch{return false;}}))return true;}catch{/* baseline is still being committed */}}return false;},'complete initial text-file inventory');
 const snapshotFile=(await filesUnder(initialStorage)).find(name=>path.basename(name).startsWith('snapshot-'));assert.ok(snapshotFile,'baseline snapshot is persisted');const snapshot=JSON.parse(await fs.readFile(snapshotFile!,'utf8')) as {files:Record<string,string>;inventoryComplete?:boolean};assert.strictEqual(snapshot.inventoryComplete,true);assert.ok(snapshot.files['.vscode/settings.json'],'existing workspace text files are included in the baseline');await fs.access(path.join(initialStorage,'content',snapshot.files['.vscode/settings.json']!));
 await vscode.commands.executeCommand('parallax.openTimeline');
 await vscode.workspace.fs.writeFile(file,Buffer.from("export const version = 'first';\n"));
 const hasRecordedPath=async(storage:string,expectedPath:string):Promise<boolean>=>{for(const filePath of await filesUnder(storage)){if(!path.basename(filePath).startsWith('events-'))continue;try{const rows=(await fs.readFile(filePath,'utf8')).split('\n').filter(Boolean);if(rows.some(row=>{try{const event=JSON.parse(row) as {path?:string};return event.path===expectedPath||event.path?.endsWith(`/${expectedPath}`);}catch{return false;}}))return true;}catch{/* event may be in the middle of an append */}}return false;};
 const hasFileEvent=(storage:string):Promise<boolean>=>hasRecordedPath(storage,'integration-smoke.ts');
 await waitFor(()=>hasFileEvent(initialStorage),'Parallax file creation capture');
 let captured:{sessionId:string;sequence:number;path:string}|undefined;
 for(const eventFile of await filesUnder(initialStorage)){if(!path.basename(eventFile).startsWith('events-'))continue;for(const line of (await fs.readFile(eventFile,'utf8')).split('\n').filter(Boolean)){try{const item=JSON.parse(line) as {kind?:string;path?:string;contentHash?:string;sessionId?:string;sequence?:number};if(['create','modify','save'].includes(item.kind??'')&&item.path==='integration-smoke.ts'&&item.contentHash&&item.sessionId&&typeof item.sequence==='number')captured={sessionId:item.sessionId,sequence:item.sequence,path:item.path};}catch{/* ignore a tail still being persisted */}}}
 assert.ok(captured,'The recorded TypeScript file has a content-bearing history event');
 const historicalUri=vscode.Uri.from({scheme:'parallax-history',path:`/${captured!.sequence}/integration-smoke.ts`,query:JSON.stringify(captured)});
 const historicalDocument=await vscode.workspace.openTextDocument(historicalUri);assert.strictEqual(historicalDocument.getText(),"export const version = 'first';\n");assert.strictEqual(historicalDocument.languageId,'typescript','historical editor keeps VS Code TypeScript syntax services');
 await vscode.window.showTextDocument(historicalDocument,{preview:false});assert.strictEqual(vscode.window.activeTextEditor?.document.uri.scheme,'parallax-history','historical editor is a read-only virtual document outside the active workspace');
 const rootBPath=process.env.PARALLAX_TEST_ROOT_B;assert.ok(rootBPath,'Second disposable workspace root is configured');
 const rootB=vscode.Uri.file(rootBPath!);
 let folderChangeCount=0;const folderChanges=vscode.workspace.onDidChangeWorkspaceFolders(()=>folderChangeCount++);
 try{
  const added=vscode.workspace.updateWorkspaceFolders(1,0,{uri:rootB,name:'second-root'});assert.strictEqual(added,true,'VS Code accepted addition of a workspace folder');
  await waitFor(async()=>vscode.workspace.workspaceFolders?.length===2&&folderChangeCount===1,'workspace-folder addition event');
  const bothRootsStorage=workspaceStorage(process.env.PARALLAX_TEST_STORAGE!);
  await waitFor(async()=>{for(const eventFile of await filesUnder(bothRootsStorage)){if(!path.basename(eventFile).startsWith('events-'))continue;try{if((await fs.readFile(eventFile,'utf8')).split('\n').some(line=>{try{return (JSON.parse(line) as {kind?:string}).kind==='workspace-baseline';}catch{return false;}}))return true;}catch{/* new session is still being written */}}return false;},'new multi-root session baseline');
  const addedRootFile=vscode.Uri.joinPath(rootB,'added-root.ts');await vscode.workspace.fs.writeFile(addedRootFile,Buffer.from('captured while both roots are active\n'));
  await waitFor(()=>hasRecordedPath(bothRootsStorage,'added-root.ts'),'capture in newly added root');
  const removed=vscode.workspace.updateWorkspaceFolders(1,1);assert.strictEqual(removed,true,'VS Code accepted workspace-folder removal');
  await waitFor(async()=>vscode.workspace.workspaceFolders?.length===1&&folderChangeCount===2,'workspace-folder removal event');
  await waitFor(async()=>{for(const eventFile of await filesUnder(initialStorage)){if(!path.basename(eventFile).startsWith('events-'))continue;try{if((await fs.readFile(eventFile,'utf8')).split('\n').some(line=>{try{return (JSON.parse(line) as {kind?:string}).kind==='workspace-baseline';}catch{return false;}}))return true;}catch{/* root-only session is still being written */}}return false;},'root-only session after removal');
  const rootAFile=vscode.Uri.joinPath(root,'root-a-active.ts');await vscode.workspace.fs.writeFile(rootAFile,Buffer.from('root a remains watched\n'));
  await waitFor(()=>hasRecordedPath(initialStorage,'root-a-active.ts'),'capture in retained root');
  const staleRootFile=vscode.Uri.joinPath(rootB,'removed-root.ts');await vscode.workspace.fs.writeFile(staleRootFile,Buffer.from('must not be captured after removal\n'));
  await new Promise<void>(resolve=>setTimeout(resolve,250));
  assert.strictEqual(await hasRecordedPath(initialStorage,'removed-root.ts'),false,'removed root no longer contributes to the retained project history');
  const switched=vscode.workspace.updateWorkspaceFolders(0,1,{uri:rootB,name:'second-root'});assert.strictEqual(switched,true,'VS Code accepted a root switch');
  await waitFor(async()=>vscode.workspace.workspaceFolders?.length===1&&vscode.workspace.workspaceFolders[0]?.uri.toString()===rootB.toString()&&folderChangeCount===3,'switch to the second workspace root');
  const rootBOnlyStorage=workspaceStorage(process.env.PARALLAX_TEST_STORAGE!);
  await waitFor(async()=>{for(const eventFile of await filesUnder(rootBOnlyStorage)){if(!path.basename(eventFile).startsWith('events-'))continue;try{if((await fs.readFile(eventFile,'utf8')).split('\n').some(line=>{try{return (JSON.parse(line) as {kind?:string}).kind==='workspace-baseline';}catch{return false;}}))return true;}catch{/* switched-root session is still being written */}}return false;},'switched-root session baseline');
  const rootBOnlyFile=vscode.Uri.joinPath(rootB,'root-b-only.ts');await vscode.workspace.fs.writeFile(rootBOnlyFile,Buffer.from('isolated root b history\n'));
  await waitFor(()=>hasRecordedPath(rootBOnlyStorage,'root-b-only.ts'),'capture after switching roots');
  assert.strictEqual(await hasRecordedPath(initialStorage,'integration-smoke.ts'),true,'root A history remains independently addressable');
  const empty=vscode.workspace.updateWorkspaceFolders(0,1);assert.strictEqual(empty,true,'VS Code accepted removal of the last root');
  await waitFor(async()=>vscode.workspace.workspaceFolders?.length===0&&folderChangeCount===4,'last workspace-folder removal event');
  const afterLastRemoval=vscode.Uri.joinPath(rootB,'after-last-root.ts');await vscode.workspace.fs.writeFile(afterLastRemoval,Buffer.from('no workspace watcher should remain\n'));
  await new Promise<void>(resolve=>setTimeout(resolve,250));
  assert.strictEqual(await hasRecordedPath(rootBOnlyStorage,'after-last-root.ts'),false,'no watcher records after the final workspace folder is removed');
  assert.strictEqual(await hasRecordedPath(rootBOnlyStorage,'root-b-only.ts'),true,'existing root B history remains recoverable after the final root is removed');
 }finally{folderChanges.dispose();}
 await vscode.commands.executeCommand('parallax.stopRecording');
 assert.ok((await filesUnder(initialStorage)).some(filePath=>path.basename(filePath).startsWith('session-')),'session metadata persists in extension storage');
 console.log('Parallax integration verified: extension/view registration, baseline, capture, read-only historical editor, root add/remove/switch, watcher disposal, and root-set storage isolation.');

}
