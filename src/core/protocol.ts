/** Cheap shape validation at the extension/webview trust boundary. Handlers still validate IDs and paths against storage/workspace state. */
export function isWebviewMessage(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const message=value as Record<string,unknown>,type=message.type;
 if(typeof type!=='string')return false;
 if(type==='refresh')return true;
 if(type==='open-settings')return true;
 if(type==='load-older')return Number.isSafeInteger(message.beforeSequence)&&Number(message.beforeSequence)>=1&&validSessionId(message.sessionId);
 if(type==='recording')return typeof message.enabled==='boolean';
 if(type==='open-session')return typeof message.sessionId==='string'&&message.sessionId.length>0&&message.sessionId.length<=128;
 if(type==='open-checkpoint')return typeof message.checkpointId==='string'&&message.checkpointId.length>0&&message.checkpointId.length<=128&&Number.isSafeInteger(message.requestId)&&Number(message.requestId)>=1;
 if(type==='inspect'||type==='restore'||type==='open-history')return Number.isSafeInteger(message.sequence)&&Number(message.sequence)>=0&&typeof message.path==='string'&&message.path.length>0&&message.path.length<=4096&&validSessionId(message.sessionId);
 if(type==='restore-workspace')return Number.isSafeInteger(message.sequence)&&Number(message.sequence)>=0&&validSessionId(message.sessionId);
 if(type==='compare')return Number.isSafeInteger(message.sequence)&&Number(message.sequence)>=0&&Number.isSafeInteger(message.baseSequence)&&Number(message.baseSequence)>=0&&typeof message.path==='string'&&message.path.length>0&&message.path.length<=4096&&validSessionId(message.sessionId);
 return false;
}
function validSessionId(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=128;}
