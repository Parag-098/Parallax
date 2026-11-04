import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runTests } from '@vscode/test-electron';

async function main():Promise<void>{
 const extension=process.env.PARALLAX_INSTALLED_EXTENSION,profile=process.env.PARALLAX_INSTALL_PROFILE,code=process.env.VSCODE_EXECUTABLE;
 if(!extension||!profile)throw new Error('Set PARALLAX_INSTALLED_EXTENSION and PARALLAX_INSTALL_PROFILE to run the installed-VSIX host probe.');
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'parallax-installed-vsix-'));
 try{
  const rootA=path.join(fixture,'root-a'),rootB=path.join(fixture,'root-b');await fs.mkdir(path.join(rootA,'.vscode'),{recursive:true});await fs.mkdir(rootB,{recursive:true});await fs.writeFile(path.join(rootA,'.vscode','settings.json'),JSON.stringify({'parallax.recordingEnabled':true,'parallax.debounceMs':0,'parallax.snapshotIntervalMinutes':60}));
  const workspaceFile=path.join(fixture,'parallax-installed-test.code-workspace');await fs.writeFile(workspaceFile,JSON.stringify({folders:[{path:'root-a'}]}));
  const userData=path.join(profile,'user-data'),extensions=path.join(profile,'extensions'),storage=path.join(userData,'User','globalStorage','parallax-dev.parallax');
  const status=await runTests({...(code?{vscodeExecutablePath:code}:{}),extensionDevelopmentPath:extension,extensionTestsPath:path.resolve(__dirname,'suite','index.js'),extensionTestsEnv:{PARALLAX_TEST_STORAGE:storage,PARALLAX_TEST_ROOT_B:rootB},launchArgs:[workspaceFile,'--user-data-dir',userData,'--extensions-dir',extensions,'--disable-workspace-trust','--disable-gpu']});
  if(status!==0)throw new Error(`Installed VSIX host probe failed with status ${status}`);
 }finally{await fs.rm(fixture,{recursive:true,force:true});}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
