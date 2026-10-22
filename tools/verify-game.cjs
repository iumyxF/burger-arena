/* Developer-only browser regression and deterministic replay. Game has no dependencies.
   Requires Playwright and Chrome. Optional BURGER_SCREENSHOTS / NODE_PATH. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    const report=await page.evaluate(()=>{
      loop=()=>{};SFX.muted=true;
      const passed=[];const check=(ok,name)=>{if(!ok)throw Error(name);passed.push(name);};
      const close=(a,b)=>Math.abs(a-b)<1e-7;
      let seed=117;const originalRandom=Math.random;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
      const solvent=()=>{G.cash=10000;G.totalMaterials=10000;G.totalSpent=0;G.totalSales=0;};
      const shopFixture=()=>{newGame();finishWave();continueSettlement();solvent();};
      const offer=(kind='weapon',id='auto',tier=1)=>{const def=(kind==='weapon'?WDEF:PDEF).find(d=>d.id===id);return {kind,def,tier,price:shopPrice(kind,def,tier),locked:false,sold:false};};
      const moneyOK=()=>check(G.cash===G.totalMaterials+(G.totalSales||0)-G.totalSpent,'currency conservation');
      check(WAVES.length===10&&WAVES.reduce((n,w)=>n+w.duration,0)===350,'ten waves / 350 seconds');
      newGame();check(G.weapons.length===1&&G.weapons[0].tier===1,'one white starter');
      // Spatial broad phase and swept projectile collision.
      for(let i=0;i<140;i++)spawnEnemy(i%5===0?'elite':'fries',rnd(0,WW),rnd(0,WH));enemyGrid.rebuild();
      for(let i=0;i<1000;i++){
        const x=rnd(0,WW),y=rnd(0,WH),r=rnd(0,160),actual=new Set([...enemyGrid.query(x,y,r)].filter(e=>hypo(e.x-x,e.y-y)<e.r+r));
        const expected=G.enemies.filter(e=>!e.dead&&hypo(e.x-x,e.y-y)<e.r+r);
        check(actual.size===expected.length&&expected.every(e=>actual.has(e)),'grid '+i);
      }
      const foe=(x,y=100)=>({x,y,r:4,hp:10000,dead:false});
      function world(foes){return {bullets:[],events:[],nearest:(x,y,r,h)=>nearestTarget(foes,x,y,r,h),query:()=>foes,hit(e,b){this.events.push(e);e.hp-=b.dmg;},impact(){},terrain(){},shot(){},explode(x,y,b){for(const e of foes)if(hypo(e.x-x,e.y-y)<b.blast+e.r)this.hit(e,b);}};}
      for(const def of WDEF)for(const tier of [1,4]){
        const st=weaponStats(def,tier),p={x:20,y:100},foes=[80,110,140,170,200,230].map(x=>foe(x)),env=world(foes),w={id:def.id,def,t:0,burstLeft:0,burstT:0};
        advanceWeapon(w,st,p,1/60,env);
        const count=def.id==='shot'?(tier===4?9:6):def.id==='home'&&tier===4?2:1;
        check(env.bullets.length===count,'projectile count '+def.id+' '+tier);check(p.x===20&&p.y===100,'no player displacement '+def.id);
        check(st.r===def.r,'fixed range '+def.id);
        if(def.id==='pierce'||def.id==='bounce'){
          for(let i=0;i<150;i++)advanceProjectiles(env.bullets,1/60,env);
          check(env.events.length===(tier===4?5:3),'hit limit '+def.id+' '+tier);check(new Set(env.events).size===env.events.length,'no repeated hits '+def.id);
        }
        if(def.id==='pie'){for(let i=0;i<60;i++)advanceProjectiles(env.bullets,1/60,env);check(env.events.filter(e=>e===foes[0]).length===1,'grenade only once');check(st.blast===(tier===4?40:28),'grenade radius');}
        if(def.id==='auto'&&tier===4){advanceWeapon(w,st,p,.039,env);check(env.bullets.length===1,'burst delay');advanceWeapon(w,st,p,.0011,env);advanceWeapon(w,st,p,.04,env);check(env.bullets.length===3,'gold three-shot burst');}
        const idle=world([foe(1000)]),iw={id:def.id,def,t:0,burstLeft:0};advanceWeapon(iw,st,p,1,idle);check(idle.bullets.length===0&&iw.t===0,'no empty firing '+def.id);
      }
      {
        const def=WDEF.find(d=>d.id==='pierce'),env=world([foe(100)]);emitShot({id:def.id,def},weaponStats(def,1),{x:20,y:100},foe(100),env);advanceProjectiles(env.bullets,.4,env);check(env.events.length===1,'swept high-speed collision');
        const white=weaponStats(def,1),blue=weaponStats(def,2),purple=weaponStats(def,3),gold=weaponStats(def,4);
        check(close(blue.dmg/white.dmg,1.3)&&close(purple.dmg/white.dmg,1.65)&&close(gold.dmg/white.dmg,2),'four quality damage multipliers');
        check(close(blue.cd/white.cd,.97)&&close(purple.cd/white.cd,.94)&&close(gold.cd/white.cd,.91),'four quality cooldown multipliers');
        const hd=WDEF.find(d=>d.id==='home'),a=foe(100),b=foe(150,130),hw=world([a,b]);emitShot({id:hd.id,def:hd},weaponStats(hd,1),{x:20,y:100},a,hw);a.dead=true;advanceProjectiles(hw.bullets,1/60,hw);check(hw.bullets[0].target===b,'homing reacquires');
      }
      // Additive build stats, unique nutrition and clamps.
      newGame('shot');const single=G.stats;for(let i=0;i<5;i++)buildWeapon(WDEF[1]);recalc();
      check(G.stats.atkSpeed===single.atkSpeed&&G.stats.speed===single.speed,'nutrition deduplicates six identical weapons');
      G.weapons[0].t=.4;G.weapons[1].t=.9;updateWeapons(.1);check(close(G.weapons[0].t,.3)&&close(G.weapons[1].t,.8),'independent weapon cooldowns');
      const base=buildStats([],{},{}),mixed=buildStats([],{hash:2,flurry:1},{as:.08});check(close(mixed.atkSpeed,1+.3-.08+.08),'percent modifiers add');
      check(close(buildStats([],{}, {armor:3}).damageTaken,1/1.24),'positive armor');check(close(buildStats([],{}, {armor:-2}).damageTaken,1.16),'negative armor');
      const capped=buildStats([],{}, {hp:-200,dmg:-3,as:-3,crit:5});check(capped.maxHp===1&&capped.atk===.25&&capped.atkSpeed===.35&&capped.crit===.75,'stat limits');
      newGame();G.pending=2;showCards();check(G.state==='playing','attribute UI cannot interrupt combat');
      for(const d of PDEF){const st=buildStats([],{[d.id]:1},{});check(Object.values(st).every(v=>typeof v!=='number'||Number.isFinite(v)),'finite item stats '+d.id);}
      newGame();G.items.flurry=2;G.upgrades.income=8;recalc();beginWave(1);G.player.hp=50;
      dropGem(G.player.x,G.player.y,7);dropGem(100,100,9);updateGems(1/60);
      check(G.cash===7&&close(G.waveStats.experience,9.1),'XP bonus does not multiply currency');
      check(G.state==='playing','experience never interrupts combat');
      finishWave();check(G.cash===24&&close(G.waveStats.experience,20.8)&&G.waveStats.autoMaterials===9,'full auto collection and income');
      check(G.player.hp===65&&G.state==='settlement','15 percent recovery');
      const cash=G.cash;check(!finishWave()&&G.cash===cash,'settlement idempotent');
      continueSettlement();check(G.state==='levelup'&&G.pending===1,'deferred upgrade choice');
      G.choices=[LDEF.find(d=>d.id==='income')];chooseCard(0);check(G.state==='shop'&&G.cash===24,'new income not retroactive');
      startNextWave();check(G.wave===2&&G.waveIncome===12,'new income starts next wave');finishWave();while(G.pending){continueSettlement();if(G.state==='levelup')chooseCard(0);}if(G.state==='settlement')continueSettlement();
      check(G.cash===36,'next-wave income paid once');moneyOK();
      // Purchase, manual merge, buying into full equipment, resale.
      shopFixture();G.shop.offers=[offer(),offer('weapon','auto',4),offer('item','salad'),offer('item','hash')];
      const startCash=G.cash;check(purchase(0)&&G.weapons.length===2&&G.weapons.every(w=>w.tier===1),'purchase does not auto-merge');
      const cost=G.shop.offers[0].price;check(G.cash===startCash-cost&&!purchase(0),'sold offer cannot repeat');
      check(el('shop-weapons').querySelectorAll('.sale-preview').length===2,'sale attribute preview for each weapon');
      check(el('shop-weapons').querySelectorAll('.merge-preview').length===2,'merge attack preview for each pair');
      const keep=G.weapons[0].uid,consumed=G.weapons[1].uid;check(mergeWeapon(keep)&&G.weapons.length===1&&G.weapons[0].tier===2&&G.damageLog[consumed].status==='已合成','manual merge consumes one copy');
      check(G.cash===startCash-cost&&!mergeWeapon(keep),'merge is free and requires a pair');moneyOK();
      shopFixture();const emptyUid=G.weapons[0].uid;check(sellWeapon(emptyUid)&&G.weapons.length===0,'selling final weapon allowed');startNextWave();step(1/60);check(G.state==='playing'&&G.weapons.length===0,'empty loadout is safe');
      shopFixture();for(let i=0;i<5;i++)buildWeapon(WDEF[0]);recalc();G.shop.offers[0]=offer();
      const fullCash=G.cash;check(!purchase(0)&&G.cash===fullCash,'full slots block ordinary purchase');check(purchase(0,true)&&G.weapons.length===6&&G.weapons.some(w=>w.tier===2),'purchase-and-merge keeps six slots');moneyOK();
      G.shop.offers[1]=offer('weapon','auto',4);check(!purchase(1,true),'gold cannot combine');
      const sold=G.weapons[0],refund=Math.floor(shopPrice('weapon',sold.def,sold.tier)/2),balance=G.cash;
      check(sellWeapon(sold.uid)&&G.cash===balance+refund&&G.damageLog[sold.uid].status==='已出售','sell half current price');check(!sellWeapon(sold.uid),'sell cannot repeat');moneyOK();
      shopFixture();G.items.salad=4;recalc();G.shop.offers=[offer('item','salad'),offer('item','salad'),offer(),offer()];toggleLock(1);
      check(purchase(0)&&G.items.salad===5&&!purchase(1)&&!G.shop.offers[1].locked,'item cap unlocks unavailable duplicate');
      for(let i=0;i<50;i++)check(makeOffer('item').def.id!=='salad','capped item excluded');
      G.cash=0;check(!purchase(2)&&!rerollShop(),'insufficient funds cannot spend');
      shopFixture();const held=G.shop.offers[1],heldPrice=held.price;toggleLock(1);const rerollPrice=refreshCost();
      check(rerollShop()&&G.shop.offers[1]===held&&held.price===heldPrice,'refresh preserves locked offer');check(refreshCost()===rerollPrice+2,'refresh escalates by two');
      for(let i=0;i<4;i++)if(!G.shop.offers[i].locked)toggleLock(i);
      const lockedCash=G.cash;check(!rerollShop()&&G.cash===lockedCash,'all locked blocks refresh');
      startNextWave();finishWave();continueSettlement();while(G.state==='levelup')chooseCard(0);
      check(G.shop.offers[1]===held&&held.price===heldPrice&&G.shop.rerolls===0,'cross-wave lock preserves price and resets rerolls');moneyOK();
      G.player.hp=30;const healCost=8+3*G.wave,beforeHeal=G.cash;check(buyHeal()&&close(G.player.hp,60)&&G.cash===beforeHeal-healCost&&!buyHeal(),'one heal per shop');moneyOK();
      const frozenTime=G.t;step(1);togglePause();check(G.state==='shop'&&G.t===frozenTime,'shop never advances combat');
      // Wave caps, special events and reset boundaries.
      newGame();beginWave(4);G.waveTime=15;updateSpawn(0);check(G.enemies.filter(e=>e.type==='elite').length===1,'wave four elite');updateSpawn(0);check(G.enemies.length===1,'elite once');
      beginWave(8);G.waveTime=20;updateSpawn(0);check(G.enemies.filter(e=>e.type==='elite').length===2,'wave eight two elites');
      beginWave(9);updateSpawn(100);check(G.enemies.filter(e=>e.type!=='elite').length===105,'normal spawn cap');
      const tray=TERRAIN.find(t=>t.t==='tray');tray.dead=true;dropGem(20,20,5);G.bullets.push({dead:false});beginWave(10);
      check(G.enemies.length===0&&G.gems.length===0&&G.bullets.length===0&&!tray.dead&&G.boss.hp===2600,'new wave resets transient objects and terrain');
      const oldBossHP=G.boss.hp;explode(G.boss.x,G.boss.y,28,10,0,G.weapons[0].uid);for(let i=0;i<30;i++)updateRings(1/60);
      check(G.boss.hp===oldBossHP-10&&G.damageLog[G.weapons[0].uid].damage===10,'one explosion hit with source attribution');
      newGame();beginWave(10);G.waveTime=44.999;G.player.hp=0;step(1/60);check(G.state==='over'&&G.completedWaves===0,'death before timeout');
      newGame();beginWave(10);G.hitstop=0;G.waveTime=44.999;G.boss.hp=1;
      emitShot(G.weapons[0],wstatsAt(WDEF[0],1),{x:G.boss.x,y:G.boss.y},G.boss,combatWorld);step(1/60);
      check(G.state==='over'&&G.completedWaves===10&&el('rgrade').textContent==='S','boss kill wins timeout tie');
      newGame();beginWave(10);G.waveTime=44.999;G.player.inv=10;step(1/60);check(G.state==='over'&&el('rgrade').textContent==='A','survive final wave without boss kill');
      // Repeatable actual first-wave runs and ten-wave equipped flow checks.
      const starters=[];
      for(const def of WDEF){seed=117;newGame(def.id);let peak=0;
        for(let i=0;i<1505&&G.state==='playing';i++){const phase=Math.floor(i/180)%4;keys.d=phase===0;keys.s=phase===1;keys.a=phase===2;keys.w=phase===3;step(1/60);peak=Math.max(peak,G.bullets.length);}
        starters.push({weapon:def.id,waves:G.completedWaves,hp:+G.player.hp.toFixed(1),materials:G.cash,peakProjectiles:peak});check(G.completedWaves===1,'starter survives first wave '+def.id);
      }
      function runBuild(specialized){seed=117;newGame();for(let i=1;i<6;i++)buildWeapon(specialized?WDEF[0]:WDEF[i]);recalc();const record=[];
        // Six white weapons are a test fixture. HP is replenished to isolate flow from AI skill.
        for(let i=0;i<22000&&G.state!=='over';i++){
          if(G.state==='settlement')continueSettlement();
          if(G.state==='levelup'){chooseCard(0);continue;}
          if(G.state==='shop'){
            for(let tries=0;tries<6;tries++){const pair=G.weapons.find(w=>matchingWeapon({def:w.def,tier:w.tier},w.uid));if(pair)mergeWeapon(pair.uid);}
            for(let j=0;j<4;j++)if(!purchaseReason(j))purchase(j);
            moneyOK();record.push({wave:G.wave,balance:G.cash,qualities:G.weapons.map(w=>w.tier),purchases:G.history.at(-1).purchases.length});startNextWave();
          }
          G.player.hp=G.player.maxHp;G.player.inv=10;
          if(G.boss?.alive)G.boss.hp=G.boss.maxHp=1e9;
          step(1/60);
        }
        check(G.state==='over'&&G.completedWaves===10&&close(G.t,350),'ten-wave '+(specialized?'specialized':'mixed')+' flow');moneyOK();
        return {kind:specialized?'six identical':'mixed',time:+G.t.toFixed(2),materials:G.totalMaterials,spent:G.totalSpent,record};
      }
      const builds=[runBuild(true),runBuild(false)];
      function naturalRun(){
        seed=117;newGame('auto');const rounds=[],route=[[660,370],[300,370],[300,170],[660,170]];let waypoint=0;
        for(let i=0;i<23000&&G.state!=='over';i++){
          if(G.state==='settlement')continueSettlement();
          if(G.state==='levelup'){
            const order=G.stats.armor<6?['armor','regen','hp','as','dmg','crit','move','income']:G.stats.regen<2?['regen','hp','as','dmg','armor','crit','move','income']:['as','dmg','hp','armor','regen','crit','move','income'];
            let choice=0;for(let j=1;j<3;j++)if(order.indexOf(G.choices[j].id)<order.indexOf(G.choices[choice].id))choice=j;chooseCard(choice);continue;
          }
          if(G.state==='shop'){
            for(let visit=0;visit<4;visit++){
              for(let index=0;index<4;index++){
                const o=G.shop.offers[index];if(o.sold||o.kind!=='weapon'||G.cash<o.price)continue;
                if(G.weapons.length>=6){
                  if(!purchaseReason(index,true)){purchase(index,true);continue;}
                  const weakest=G.weapons.slice().sort((a,b)=>a.tier-b.tier)[0];
                  if(weakest.tier<o.tier){sellWeapon(weakest.uid);purchase(index);}
                }else purchase(index);
              }
              for(let index=0;index<4;index++){
                const o=G.shop.offers[index];if(o.kind==='item'&&!purchaseReason(index)&&G.cash>o.price+20)purchase(index);
              }
              if(visit<3&&G.cash>40)rerollShop();else break;
            }
            if(G.player.hp<G.player.maxHp*.5)buyHeal();
            rounds.push({wave:G.wave,hp:+G.player.hp.toFixed(1),balance:G.cash,qualities:G.weapons.map(w=>w.tier)});startNextWave();
          }
          const target=route[waypoint];if(hypo(G.player.x-target[0],G.player.y-target[1])<8)waypoint=(waypoint+1)%route.length;
          const [x,y]=route[waypoint];keys.d=x>G.player.x+4;keys.a=x<G.player.x-4;keys.s=y>G.player.y+4;keys.w=y<G.player.y-4;
          step(1/60);
        }
        moneyOK();return {completed:G.completedWaves,grade:el('rgrade').textContent,time:+G.t.toFixed(1),rounds};
      }
      const natural=naturalRun();
      check(natural.completed===10&&natural.grade==='S','normal-health and real-income policy clears ten waves');
      newGame();check(G.cash===0&&G.items&&Object.keys(G.items).length===0&&G.history.length===0&&G.weapons.length===1,'restart clears economy and inventory');
      Math.random=originalRandom;
      return {assertions:passed.length,starters,builds,natural};
    });
    console.log(JSON.stringify(report,null,2));
    // Real UI flow; no simulation helper can hide navigation failures.
    await page.reload();await page.click('#startbtn');await page.keyboard.press('4');
    assert.equal(await page.evaluate(()=>G===null&&starterOpen),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>G.weapons[0].id),'pierce');
    await page.evaluate(()=>{SFX.muted=true;collectMaterials(40);finishWave();});
    const screenshotDir=process.env.BURGER_SCREENSHOTS;
    if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
    assert.equal(await page.locator('#settlement').isVisible(),true);
    if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'wave-settlement.png')});
    await page.click('#settlement-continue');
    if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'wave-attributes.png')});
    while(await page.evaluate(()=>G.state==='levelup'))await page.keyboard.press('1');
    assert.equal(await page.locator('#shop').isVisible(),true);assert.equal(await page.locator('.shop-offer').count(),4);
    const locked=await page.locator('[data-lock="1"]').textContent();await page.click('[data-lock="1"]');assert.notEqual(await page.locator('[data-lock="1"]').textContent(),locked);
    await page.evaluate(()=>{G.cash+=200;G.totalMaterials+=200;renderShop();});await page.click('[data-buy="0"]');assert.equal(await page.evaluate(()=>G.weapons.length),2);
    const t=await page.evaluate(()=>G.t);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>G.t),t);
    for(const [width,height]of [[1280,800],[960,640],[480,320]]){
      await page.setViewportSize({width,height});
      await page.locator('.shop-scroll').evaluate(e=>e.scrollTop=0);
      const next=await page.locator('#next-wave').boundingBox();assert.ok(next.y>=0&&next.y+next.height<=height,'next wave reachable '+width);
      const overflow=await page.locator('.shop-scroll').evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(overflow,false,'no horizontal clipping '+width);
      if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'wave-shop-'+width+'.png')});
      await page.locator('.shop-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
      if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'wave-shop-bottom-'+width+'.png')});
    }
    await page.setViewportSize({width:1280,height:800});await page.click('#next-wave');assert.equal(await page.evaluate(()=>G.wave),2);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#pause').isVisible(),true);await page.click('#resumebtn');assert.equal(await page.evaluate(()=>G.state),'playing');
    await page.locator('.slot').first().focus();assert.equal(await page.locator('#weapon-tooltip').isVisible(),true);
    await page.evaluate(()=>endGame('dead'));
    if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'wave-result.png')});
    await page.click('#againbtn');assert.equal(await page.evaluate(()=>G===null&&starterOpen),true);
    if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,'wave-starter.png')});
    await page.evaluate(async()=>{start();togglePause();SFX.bgm.on=false;SFX.muted=false;for(let i=0;i<80;i++)SFX.tone({f:440,dur:.03,vol:.01});if(SFX.voices>32)throw Error('voice cap');if(SFX.ac.state==='suspended')await SFX.ac.resume();await new Promise(r=>setTimeout(r,1000));if(SFX.voices)throw Error('audio node leak');SFX.muted=true;});
    // Max-quality / 105 enemy / 1200 material deterministic frame replay.
    await page.reload();await page.evaluate(()=>{loop=()=>{};SFX.muted=true;});
    const frames=await page.evaluate(async()=>{
      let seed=117;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
      newGame();beginWave(9);G.weapons[0].tier=4;for(const def of WDEF.slice(1))buildWeapon(def,4);recalc();
      for(let i=0;i<105;i++)spawnEnemy('fries',rnd(20,WW-20),rnd(20,WH-20));
      for(let i=0;i<1200;i++)dropGem(rnd(20,WW-20),rnd(20,WH-20),1);
      const frames=[],updates=[],draws=[];let last=0,peak=0;
      for(let i=0;i<240;i++){
        const ts=await new Promise(requestAnimationFrame);if(last)frames.push(ts-last);last=ts;
        G.player.hp=G.player.maxHp;G.player.inv=10;const a=performance.now();step(1/60);updateCamera();updateHUD();const b=performance.now();render();const c=performance.now();
        peak=Math.max(peak,G.bullets.length);if(i>=30){updates.push(b-a);draws.push(c-b);}
      }
      const pct=(a,p)=>a.sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
      return {frameP50:pct(frames,.5),frameP95:pct(frames,.95),longFrames:frames.filter(v=>v>33.4).length,updateP95:pct(updates,.95),drawP95:pct(draws,.95),peakProjectiles:peak,enemies:G.enemies.length,materials:G.gems.length};
    });
    console.log('FRAME_REPLAY',JSON.stringify(frames));assert.deepEqual(errors,[]);
    console.log('PASS: mechanics, transactions, economy, ten-wave flows, UI, layouts, audio and pressure replay');
    await page.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
