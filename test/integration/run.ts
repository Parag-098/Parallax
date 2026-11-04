import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runTests } from '@vscode/test-electron';

async function main():Promise<void>{
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'parallax-vscode-')),userData=await fs.mkdtemp(path.join(os.tmpdir(),'parallax-vscode-user-'));
 try{
  const rootA=path.join(fixture,'root-a'),rootB=path.join(fixture,'root-b');
  await fs.mkdir(path.join(rootA,'.vscode'),{recursive:true});await fs.mkdir(rootB,{recursive:true});
  await fs.writeFile(path.join(rootA,'.vscode','settings.json'),JSON.stringify({'parallax.recordingEnabled':true,'parallax.debounceMs':0,'parallax.snapshotIntervalMinutes':60}));
  const workspaceFile=path.join(fixture,'parallax-test.code-workspace');
  await fs.writeFile(workspaceFile,JSON.stringify({folders:[{path:'root-a'}]}));
  const installedCode=process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Programs','Microsoft VS Code','Code.exe'):undefined;
  const options={extensionDevelopmentPath:path.resolve(__dirname,'..','..','..'),extensionTestsPath:path.resolve(__dirname,'suite','index.js'),extensionTestsEnv:{PARALLAX_TEST_STORAGE:path.join(userData,'User','globalStorage','parallax-dev.parallax'),PARALLAX_TEST_ROOT_B:rootB},launchArgs:[workspaceFile,'--user-data-dir',userData,'--disable-workspace-trust','--disable-gpu']};
  let status:number;if(installedCode){try{await fs.access(installedCode);status=await runTests({...options,vscodeExecutablePath:installedCode});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;status=await runTests(options);}}else status=await runTests(options);
  if(status!==0)throw new Error(`VS Code extension integration tests exited with status ${status}`);
 }finally{await fs.rm(fixture,{recursive:true,force:true});await fs.rm(userData,{recursive:true,force:true});}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
