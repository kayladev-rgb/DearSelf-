// DearSelf V40 Beta — local same-network sync bridge
// Run on one device: node dearself-sync-bridge.js
// Then open the bridge URL shown in the terminal from DearSelf on both devices.
const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();
const server = http.createServer((req,res)=>{
  res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Access-Control-Allow-Origin':'*'});
  res.end('DearSelf local sync bridge is running.\n');
});
const wss = new WebSocket.Server({server});
function code(){ return String(Math.floor(100000 + Math.random()*900000)); }
function send(ws,msg){ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function leave(ws){
  if(!ws.room) return;
  const r=rooms.get(ws.room);
  if(r){ r.delete(ws); if(r.size===0) rooms.delete(ws.room); else for(const peer of r) send(peer,{type:'peer-left'}); }
  ws.room=null;
}
wss.on('connection', ws=>{
  ws.on('message', raw=>{
    let m; try{m=JSON.parse(raw)}catch{return}
    if(m.type==='host'){
      leave(ws); let id=crypto.randomBytes(4).toString('hex'); while(rooms.has(id)) id=crypto.randomBytes(4).toString('hex');
      const r=new Set([ws]); rooms.set(id,r); ws.room=id; ws.role='host'; ws.pairCode=code();
      send(ws,{type:'host-ready',room:id,code:ws.pairCode}); return;
    }
    if(m.type==='join'){
      leave(ws); const r=rooms.get(String(m.room||''));
      if(!r || r.size>=2){ send(ws,{type:'error',message:'Room not found or already has two devices.'}); return; }
      const host=[...r][0]; if(host.pairCode!==String(m.code||'')){ send(ws,{type:'error',message:'Pairing code is incorrect.'}); return; }
      r.add(ws); ws.room=String(m.room); ws.role='guest'; send(ws,{type:'joined',room:ws.room}); send(host,{type:'peer-joined'}); return;
    }
    if(m.type==='relay' && ws.room){ const r=rooms.get(ws.room); if(r) for(const peer of r) if(peer!==ws) send(peer,{type:'relay',payload:m.payload}); }
  });
  ws.on('close',()=>leave(ws));
});
server.listen(PORT,'0.0.0.0',()=>{
  const nets=os.networkInterfaces(), ips=[];
  for(const list of Object.values(nets)) for(const n of (list||[])) if(n.family==='IPv4'&&!n.internal) ips.push(n.address);
  console.log('\nDearSelf Local Sync Bridge');
  console.log(`Running on port ${PORT}`);
  console.log(`This device: http://localhost:${PORT}`);
  ips.forEach(ip=>console.log(`Other devices on the same network: http://${ip}:${PORT}`));
  console.log('Keep this window running while pairing/syncing.\n');
});
