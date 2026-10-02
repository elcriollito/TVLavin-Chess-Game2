// Scan the existing flat hash->entry shard incrementally. Never parse/store the full shard.
export function createEntryScanner(hash,{maxEntryChars=200000}={}) {
    if(!/^[a-f0-9]{16}$/.test(hash))throw new Error('Invalid Opening Database key.');
    let depth=0,inString=false,escaped=false,key='',pending=false,value='',valueDepth=0,collecting=false,done=false,entry=null,started=false,closed=false,phase='key';
    return Object.freeze({get done(){return done;},get entry(){return entry;},write(text){
        if(done)return;
        for(const char of text){
            if(!started){if(/\s/.test(char))continue;if(char!=='{')throw new Error('Opening Database shard must be an object.');started=true;depth=1;continue;}
            if(closed){if(!/\s/.test(char))throw new Error('Opening Database shard has trailing data.');continue;}
            if(collecting){value+=char;if(value.length>maxEntryChars)throw new Error('Opening Database entry exceeds its size limit.');
                if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;}
                else if(char==='"')inString=true;else if(char==='{'||char==='[')valueDepth++;else if(char==='}'||char===']')valueDepth--;
                if(valueDepth===0&&!inString){entry=JSON.parse(value);done=true;return;}continue;
            }
            if(inString){if(escaped){escaped=false;key+='?';}else if(char==='\\')escaped=true;else if(char==='"'){inString=false;if(depth===1){if(!/^[a-f0-9]{16}$/.test(key))throw new Error('Opening Database shard key is invalid.');pending=key===hash;phase='colon';}}else if(key.length<64)key+=char;continue;}
            if(depth===1){
                if(/\s/.test(char))continue;
                if(phase==='colon'){if(char!==':')throw new Error('Opening Database shard is invalid.');phase='value';continue;}
                if(phase==='value'){if(char!=='{')throw new Error('Opening Database entry must be an object.');if(pending){collecting=true;value='{';valueDepth=1;continue;}depth=2;phase='comma';continue;}
                if(phase==='comma'){if(char===','){phase='next-key';continue;}if(char!=='}')throw new Error('Opening Database shard is invalid.');closed=true;depth=0;continue;}
                if(char==='}'&&phase==='key'){closed=true;depth=0;continue;}
                if(char!=='"')throw new Error('Opening Database shard key is invalid.');inString=true;key='';continue;
            }
            if(char==='"'){inString=true;key='';}else if(char==='{'||char==='[')depth++;else if(char==='}'||char===']'){depth--;if(depth<1)throw new Error('Opening Database shard is invalid.');}
        }
    },finish(){if(!started||!closed||collecting||inString||depth!==0)throw new Error('Opening Database shard is incomplete.');done=true;return null;}});
}
export async function readOpeningEntry(response,hash,{signal}={}) {
    if(!response.body?.getReader)throw new Error('Opening Database streaming is unavailable in this browser.');
    const reader=response.body.getReader(),decoder=new TextDecoder(),scanner=createEntryScanner(hash);
    let bytes=0,sinceYield=0;
    try{while(true){if(signal?.aborted)throw new Error('Opening Database request cancelled.');const {done,value}=await reader.read();
        if(done){scanner.write(decoder.decode());return scanner.done?scanner.entry:scanner.finish();}
        bytes+=value.byteLength;sinceYield+=value.byteLength;if(bytes>128*1024*1024)throw new Error('Opening Database shard exceeds its read limit.');
        for(let offset=0;offset<value.length;offset+=65536){scanner.write(decoder.decode(value.subarray(offset,offset+65536),{stream:true}));if(scanner.done)return scanner.entry;await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw new Error('Opening Database request cancelled.');}
        if(sinceYield>=131072){sinceYield=0;await new Promise(resolve=>setTimeout(resolve,0));}
    }}finally{await reader.cancel().catch(()=>{});}
}
