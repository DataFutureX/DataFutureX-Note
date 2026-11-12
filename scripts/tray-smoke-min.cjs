const fs=require('fs');const path=require('path');
const out=path.join('D:/CodeWorkspace/codex/DataFutureX-Note/resources','.tray-smoke.log');
fs.writeFileSync(out,'booted '+Date.now()+'\n');
const {app,Tray,nativeImage}=require('electron');
app.whenReady().then(()=>{
  fs.appendFileSync(out,'exe='+process.execPath+'\n');
  try{fs.appendFileSync(out,'aumidAttempt\n')}catch(e){}
  const icon='D:/CodeWorkspace/codex/DataFutureX-Note/resources/tray-32.png';
  const tray=new Tray(nativeImage.createFromPath(icon).resize({width:16,height:16}));
  tray.setToolTip('DFXprobe');
  fs.appendFileSync(out,'bounds='+JSON.stringify(tray.getBounds())+'\n');
  setTimeout(()=>{fs.appendFileSync(out,'bounds2='+JSON.stringify(tray.getBounds())+'\n');app.quit()},1200);
});
