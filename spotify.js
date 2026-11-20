/* Opt-in Spotify music for Starfighter: Last Signal (see SPOTIFY.md).
 *
 * OFF BY DEFAULT. Nothing in this file runs, loads or contacts anything until the player presses
 * CONNECT SPOTIFY (or was already signed in on this computer). The player supplies the Client ID of
 * their OWN free Spotify developer app; sign-in is Authorization Code + PKCE in a popup window (no
 * secret, no server). Spotify's Web Playback SDK script is fetched only after sign-in, and playback
 * needs Spotify Premium. The refresh token stays in this browser profile; the access token stays in
 * memory. Neither is ever written to saves, the performance log or any export. Every failure
 * (offline, cancelled, not Premium, expired sign-in, lost player) hands the music back to the game's
 * own soundtrack. Inert, with its controls hidden, inside the Flight School practice document.
 *
 * Spotify's Developer Policy restricts games and commercial use; read SPOTIFY.md before shipping this. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterSpotify=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  // Optional: the game's owner may paste a PUBLIC Client ID here so friends only press CONNECT (their Spotify
  // accounts must then be added under Users Management in that app, five at most). Leave empty for own-app use.
  const DEFAULT_CLIENT_ID='';
  const URLS=Object.freeze({sdk:'https://sdk.scdn.co/spotify-player.js',authorize:'https://accounts.spotify.com/authorize',token:'https://accounts.spotify.com/api/token',api:'https://api.spotify.com/v1'});
  // streaming/email/private are the scopes Spotify's own Web Playback SDK guide lists; modify-playback-state starts playback. The email is never read or stored.
  const SCOPES=Object.freeze(['streaming','user-read-email','user-read-private','user-modify-playback-state']);
  const KEYS=Object.freeze({store:'starfighterSpotify',on:'starfighterSpotifyOn',callback:'starfighterSpotifyCallback',channel:'starfighter-spotify',type:'starfighter-spotify-callback'});
  const LIMITS=Object.freeze({signInMs:300000,sdkMs:15000,holdMs:1500,reconnectMs:Object.freeze([2000,5000,12000]),volumeGapMs:100});
  const TEXT=Object.freeze({
    intro:'Not connected. Nothing is contacted until you press CONNECT SPOTIFY.',
    needId:'Paste the Client ID of your Spotify developer app first (32 letters and numbers).',
    badId:'That does not look like a Client ID. It is 32 letters and numbers, shown in your Spotify app\'s Settings.',
    blocked:'Your browser blocked the Spotify window. Allow pop-ups for this page, then press CONNECT SPOTIFY again.',
    waiting:'Waiting for Spotify. Finish signing in in the Spotify window, or press CANCEL SIGN-IN.',
    timedOut:'Spotify sign-in timed out. Press CONNECT SPOTIFY to try again.',
    cancelled:'Spotify sign-in was cancelled. Nothing was changed.',
    connecting:'Connecting to Spotify…',
    finishing:'Finishing Spotify sign-in…',
    ready:'Connected. Paste a playlist, album or song link below, or press PLAY MY SPOTIFY HERE to bring over what you were playing. The game soundtrack steps aside while Spotify plays.',
    offline:'Cannot reach Spotify right now. The game music keeps playing.',
    signedOut:'Your Spotify sign-in expired. Press CONNECT SPOTIFY to sign in again. The game music keeps playing.',
    sdk:'Could not load Spotify\'s player (offline, or blocked by an extension). The game music keeps playing.',
    init:'This browser cannot play Spotify protected audio. Use Microsoft Edge or Google Chrome. The game music keeps playing.',
    account:'Spotify says this account cannot stream here. It needs Spotify Premium (Free and mobile-only plans do not work). The game music keeps playing.',
    refused:'Spotify refused this. The account must be Premium and listed under Users Management in your Spotify app.',
    lost:'Spotify lost its connection to the game. The game music is back. Press CONNECT SPOTIFY to try again.',
    dropped:'The Spotify connection dropped. Trying again…',
    badLink:'That is not a Spotify playlist, album, artist or song link. In Spotify choose Share, then Copy link.',
    noDevice:'Connect Spotify first.',
    nothing:'Spotify has nothing playing to bring here. Start a song in your Spotify app, or paste a link.',
    notFound:'Spotify could not find that. Check the link, or press CONNECT SPOTIFY again.',
    busy:'Spotify says there are too many requests. Wait a moment and try again.',
    autoplay:'Your browser held back the sound until you click. Press PLAY.',
    playback:'Spotify could not play that track. Try another song.',
    disconnected:'Disconnected. Your Spotify sign-in was removed from this computer. The game music is back.'
  });
  const guard=(fn,fallback)=>{try{return fn()}catch{return fallback}};
  // Run a player/API call and swallow both a thrown error and a rejected promise: audio must never break the game.
  const quiet=fn=>{try{const r=fn();if(r&&typeof r.catch==='function')r.catch(()=>{})}catch{}};
  const readJson=async res=>{try{return await res.json()}catch{return null}};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const validClientId=value=>/^[0-9a-f]{32}$/i.test(String(value||'').trim());
  const clipText=(value,limit=200)=>String(value??'').slice(0,limit);
  const b64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
  // 64 symbols, so a random byte maps to a symbol with no bias.
  const SYMBOLS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function randomString(length,cryptoApi){const bytes=new Uint8Array(length);cryptoApi.getRandomValues(bytes);let out='';for(const b of bytes)out+=SYMBOLS[b%64];return out}
  async function challengeFor(verifier,cryptoApi){return b64url(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))}
  function authorizeUrl({clientId,redirectUri,challenge,state}){
    return URLS.authorize+'?'+new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:SCOPES.join(' '),state,code_challenge_method:'S256',code_challenge:challenge}).toString();
  }
  // Spotify accepts https, or plain http only for the loopback IP literals; "localhost" was removed in Nov 2025.
  function redirectProblem(href){
    const url=guard(()=>new URL(href),null);
    if(!url||!/^https?:$/.test(url.protocol))return'Open the game from a web address such as http://127.0.0.1:8765 so Spotify can send you back.';
    if(url.protocol==='https:'||url.hostname==='127.0.0.1'||url.hostname==='[::1]')return'';
    if(url.hostname==='localhost')return`Spotify does not accept "localhost". Open the game at http://127.0.0.1:${url.port||80} instead.`;
    return`Spotify only accepts https addresses or http://127.0.0.1. This page is ${url.origin}.`;
  }
  const ID=/^[0-9A-Za-z]{22}$/;
  function parseLink(text){
    const raw=String(text||'').trim();if(!raw||raw.length>300)return null;
    let kind,id,m=raw.match(/^spotify:(track|album|playlist|artist):([0-9A-Za-z]{22})$/);
    if(m){kind=m[1];id=m[2]}
    else{
      const url=guard(()=>new URL(raw),null);
      if(!url||url.protocol!=='https:'||!/^(open|play)\.spotify\.com$/.test(url.hostname))return null;
      const parts=url.pathname.split('/').filter(Boolean);
      while(/^(intl-[a-z]{2,3}(-[a-z]{2,4})?|embed)$/i.test(parts[0]||''))parts.shift();
      [kind,id]=parts;if(!['track','album','playlist','artist'].includes(kind)||!ID.test(id||''))return null;
    }
    const uri=`spotify:${kind}:${id}`;
    return{kind,id,uri,body:kind==='track'?{uris:[uri]}:{context_uri:uri}};
  }
  // Only show artwork from Spotify's own image host and links to open.spotify.com.
  function cleanTrack(current){
    if(!current||typeof current!=='object')return null;
    const images=Array.isArray(current.album?.images)?current.album.images.filter(i=>typeof i?.url==='string'&&guard(()=>{const u=new URL(i.url);return u.protocol==='https:'&&/(^|\.)scdn\.co$/.test(u.hostname)},false)):[];
    const art=[...images].sort((a,b)=>(a.width||999)-(b.width||999)).find(i=>(i.width||999)>=64)||images.at(-1);
    const id=typeof current.id==='string'&&ID.test(current.id)?current.id:'';
    return{name:clipText(current.name,120),artist:clipText((current.artists||[]).map(a=>a?.name).filter(Boolean).join(', '),160),album:clipText(current.album?.name,120),image:art?.url||'',url:id?`https://open.spotify.com/track/${id}`:''};
  }

  function create(options={}){
    const win=options.window||null,doc=options.document||win?.document||null,store=options.storage||null,sandbox=!!options.sandbox;
    const fetchFn=options.fetch||(typeof win?.fetch==='function'?win.fetch.bind(win):null),cryptoApi=options.crypto||win?.crypto||null;
    const now=options.now||Date.now,playerName=clipText(options.name||'Starfighter: Last Signal',60);
    const timers=options.timers||{set:(fn,ms)=>win?.setTimeout?.(fn,ms),clear:id=>win?.clearTimeout?.(id)};
    let status='idle',message='',clientId='',refresh='',access='',expiresAt=0,player=null,deviceId='',playing=false,yielded=false,away=false,autoPaused=false;
    let level=.3,muted=false,track=null,pending=null,stopListening=null,refreshing=null,busy=false,reconnects=0,authRetried=false,bound=false,ui=null;
    let holdTimer=null,reconnectTimer=null,volumeTimer=null,lastVolume=-1,lastVolumeAt=0,sdkPromise=null,noteHold=0;
    const read=key=>guard(()=>store?.getItem(key),null),write=(key,value)=>guard(()=>{store?.setItem(key,value);return true},false),drop=key=>guard(()=>store?.removeItem(key));
    if(!sandbox){
      const saved=guard(()=>JSON.parse(read(KEYS.store)||'null'),null);
      if(saved&&typeof saved==='object'){
        if(validClientId(saved.clientId))clientId=saved.clientId.trim();
        if(typeof saved.refresh==='string'&&saved.refresh&&read(KEYS.on)==='1')refresh=saved.refresh;
      }
    }
    const persist=()=>{if(sandbox)return;write(KEYS.store,JSON.stringify({v:1,clientId,refresh}));if(refresh)write(KEYS.on,'1')};
    const effectiveClientId=()=>validClientId(clientId)?clientId:validClientId(DEFAULT_CLIENT_ID)?DEFAULT_CLIENT_ID:'';
    const redirectUri=()=>guard(()=>options.redirectUri||new URL('spotify-callback.html',win.location.href).href,'');
    const deviceReady=()=>!!player&&!!deviceId;
    function describe(){
      if(message)return message;
      if(status==='idle')return refresh?'Spotify is signed in on this computer. Press CONNECT SPOTIFY to reconnect.':TEXT.intro;
      if(status==='waiting')return TEXT.waiting;
      if(status==='connecting')return TEXT.connecting;
      if(status==='ready')return TEXT.ready;
      if(status==='playing')return'Playing from Spotify. The game soundtrack is paused; sound effects keep working.';
      if(status==='paused')return'Spotify is paused. The game soundtrack is back until you press play.';
      return TEXT.offline;
    }
    function snapshot(){
      return{status,message:describe(),signedIn:!!refresh,deviceReady:deviceReady(),playing:yielded&&playing,takesMusic:yielded&&deviceReady(),track:track?{...track}:null,
        redirectUri:redirectUri(),redirectProblem:redirectProblem(redirectUri()),clientIdSet:!!effectiveClientId(),usingBuiltInId:!validClientId(clientId)&&validClientId(DEFAULT_CLIENT_ID),level,muted};
    }
    function render(){
      if(!ui)return;const s=snapshot(),on=s.deviceReady,set=(el,v)=>{if(el)el.textContent=v},show=(el,v)=>{if(el)el.hidden=!v};
      set(ui.status,s.message);show(ui.player,on);show(ui.mini,on);
      if(ui.clientId&&!ui.clientId.value&&clientId)ui.clientId.value=clientId;
      set(ui.redirect,s.redirectUri);
      if(ui.connect){ui.connect.textContent=status==='waiting'?'CANCEL SIGN-IN':status==='connecting'?'CONNECTING…':on?'CONNECTED':'CONNECT SPOTIFY';ui.connect.disabled=status==='connecting'||on}
      show(ui.disconnect,!!refresh||on||status==='waiting');
      const t=s.track,title=t?t.name:'Nothing playing yet',artist=t?[t.artist,t.album].filter(Boolean).join(' · '):'';
      set(ui.title,title);set(ui.artist,artist);set(ui.miniTitle,t?`${t.name} — ${t.artist}`:'Spotify connected');
      if(ui.art){ui.art.hidden=!(t&&t.image);if(t&&t.image&&ui.art.src!==t.image)ui.art.src=t.image}
      if(ui.open){ui.open.hidden=!(t&&t.url);if(t&&t.url&&ui.open.href!==t.url)ui.open.href=t.url}
      for(const key of['toggle','miniToggle'])set(ui[key],yielded&&playing?'PAUSE':'PLAY');
    }
    function emit(){render();guard(()=>options.onChange?.(snapshot()))}
    function say(next,text=''){status=next;message=text;emit()}
    // A short notice that does not change the connection state.
    function note(text){message=text;emit()}
    function clearHold(){if(holdTimer){timers.clear(holdTimer);holdTimer=null}}
    function idleStatus(){return deviceId?(track?'paused':'ready'):status}

    // ---- tokens -------------------------------------------------------------------------------
    async function post(url,params){
      if(!fetchFn)throw{code:'offline'};
      let res;try{res=await fetchFn(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString()})}catch{throw{code:'offline'}}
      return{ok:!!res.ok,status:res.status,data:await readJson(res)};
    }
    function accept(data){access=String(data.access_token);expiresAt=now()+(Number(data.expires_in)>0?Number(data.expires_in):3600)*1000;if(typeof data.refresh_token==='string'&&data.refresh_token)refresh=data.refresh_token}
    function forgetTokens(){access='';expiresAt=0;refresh='';drop(KEYS.on);persist()}
    async function token(force=false){
      if(!force&&access&&now()<expiresAt-60000)return access;
      if(!refresh)throw{code:'signin'};
      if(refreshing)return refreshing;
      refreshing=(async()=>{
        try{
          const res=await post(URLS.token,{grant_type:'refresh_token',refresh_token:refresh,client_id:clientId||effectiveClientId()});
          if(!res.ok||!res.data?.access_token){if(res.status>=400&&res.status<500){forgetTokens();throw{code:'signin'}}throw{code:'offline'}}
          accept(res.data);persist();return access;
        }finally{refreshing=null}
      })();
      return refreshing;
    }
    function failure(error){
      const code=error?.code;
      if(code==='offline')return say('problem',TEXT.offline);
      if(code==='signin'){return say('idle',TEXT.signedOut)}
      if(code==='sdk')return say('problem',TEXT.sdk);
      return say('problem','Something went wrong with Spotify. The game music keeps playing.');
    }

    // ---- sign-in (popup, Authorization Code + PKCE) ---------------------------------------------
    function endSignIn(){
      const p=pending;pending=null;if(!p)return;
      timers.clear(p.timer);guard(()=>stopListening?.());stopListening=null;guard(()=>p.popup?.close?.());
    }
    function listen(){
      const undo=[],channel=guard(()=>win.BroadcastChannel?new win.BroadcastChannel(KEYS.channel):null,null);
      if(channel){channel.onmessage=e=>onCallback(e?.data);undo.push(()=>channel.close())}
      const onMessage=e=>{if(e&&e.origin===win.location.origin)onCallback(e.data)};
      win.addEventListener?.('message',onMessage);undo.push(()=>win.removeEventListener?.('message',onMessage));
      const onStorage=e=>{if(e?.key===KEYS.callback&&e.newValue)onCallback(guard(()=>JSON.parse(e.newValue),null))};
      win.addEventListener?.('storage',onStorage);undo.push(()=>win.removeEventListener?.('storage',onStorage));
      stopListening=()=>undo.forEach(fn=>guard(fn));
    }
    function onCallback(msg){
      if(!pending||!msg||typeof msg!=='object'||msg.type!==KEYS.type||typeof msg.state!=='string'||msg.state!==pending.state)return;
      const p=pending;endSignIn();
      if(msg.error||!msg.code)return say('idle',/access_denied/i.test(String(msg.error))?TEXT.cancelled:'Spotify did not finish the sign-in'+(msg.error?` (${String(msg.error).replace(/[^a-z_ ]/gi,'').slice(0,40)})`:'')+'. Nothing was changed.');
      exchange(p,String(msg.code).slice(0,2048));
    }
    async function exchange(p,code){
      say('connecting',TEXT.finishing);
      try{
        const res=await post(URLS.token,{grant_type:'authorization_code',code,redirect_uri:p.redirect,client_id:p.clientId,code_verifier:p.verifier});
        if(!res.ok||!res.data?.access_token||!res.data?.refresh_token){
          const reason=String(res.data?.error||'');
          return say('idle',reason==='invalid_client'?'Spotify does not recognise that Client ID. Copy it again from your Spotify app\'s Settings.':
            /invalid_(grant|request)/.test(reason)?'Spotify rejected the sign-in. Check that the Redirect URI shown here is added to your Spotify app exactly, then try again.':
            `Spotify could not finish the sign-in (error ${Number(res.status)||'unknown'}).`);
        }
        if(p.clientId!==DEFAULT_CLIENT_ID)clientId=p.clientId;accept(res.data);persist();
      }catch(error){return failure(error)}
      await startPlayer();
    }
    // Must be called from a click so the browser allows the popup.
    function connect(){
      if(sandbox||busy||pending)return false;
      const id=effectiveClientId();
      if(!id)return(say('idle',TEXT.needId),false);
      if(refresh&&(!clientId||clientId===id)){startPlayer();return true}
      const redirect=redirectUri(),problem=redirectProblem(redirect);
      if(problem)return(say('idle',problem),false);
      if(!cryptoApi?.subtle||!cryptoApi.getRandomValues)return(say('idle','This browser cannot do a secure sign-in from this address. Open the game at http://127.0.0.1:8765.'),false);
      const popup=guard(()=>win.open('','starfighter-spotify','popup=yes,width=480,height=740'),null);
      if(!popup)return(say('idle',TEXT.blocked),false);
      const verifier=randomString(64,cryptoApi),state=randomString(24,cryptoApi);
      pending={verifier,state,clientId:id,redirect,popup,timer:timers.set(()=>{endSignIn();say('idle',TEXT.timedOut)},LIMITS.signInMs)};
      say('waiting',TEXT.waiting);listen();
      challengeFor(verifier,cryptoApi).then(challenge=>{
        if(!pending||pending.state!==state)return;
        guard(()=>{popup.location.href=authorizeUrl({clientId:id,redirectUri:redirect,challenge,state})});
      },()=>{endSignIn();say('idle','This browser could not start a secure sign-in.')});
      return true;
    }
    function cancel(){if(pending){endSignIn();say('idle',TEXT.cancelled)}}

    // ---- Spotify's Web Playback SDK -------------------------------------------------------------
    function loadSdk(){
      if(win?.Spotify?.Player)return Promise.resolve(win.Spotify);
      if(sdkPromise)return sdkPromise;
      sdkPromise=new Promise((resolve,reject)=>{
        const timer=timers.set(()=>{sdkPromise=null;reject({code:'sdk'})},LIMITS.sdkMs),previous=win.onSpotifyWebPlaybackSDKReady;
        win.onSpotifyWebPlaybackSDKReady=()=>{timers.clear(timer);guard(()=>previous?.());resolve(win.Spotify)};
        const script=doc.createElement('script');script.src=URLS.sdk;script.async=true;
        script.onerror=()=>{timers.clear(timer);sdkPromise=null;reject({code:'sdk'})};
        doc.head.append(script);
      });
      return sdkPromise;
    }
    function buildPlayer(Spotify){
      player=new Spotify.Player({name:playerName,volume:muted?0:clamp(level,0,1),getOAuthToken:cb=>{token().then(cb,()=>cb(''))}});
      player.addListener('ready',e=>{deviceId=clipText(e?.device_id,120);reconnects=0;authRetried=false;lastVolume=-1;applyVolume();say(playing&&yielded?'playing':idleStatus())});
      player.addListener('not_ready',()=>{deviceId='';playing=false;yielded=false;clearHold();track=null;scheduleReconnect()});
      player.addListener('player_state_changed',applyState);
      player.addListener('initialization_error',()=>{dropPlayer();say('problem',TEXT.init)});
      player.addListener('account_error',()=>{dropPlayer();say('problem',TEXT.account)});
      player.addListener('authentication_error',async()=>{
        if(authRetried||!refresh)return(dropPlayer(),say('idle',TEXT.signedOut));
        authRetried=true;
        try{await token(true);quiet(()=>player?.connect())}catch(error){dropPlayer();failure(error)}
      });
      player.addListener('playback_error',()=>note(TEXT.playback));
      player.addListener('autoplay_failed',()=>note(TEXT.autoplay));
    }
    function dropPlayer(){clearHold();if(reconnectTimer){timers.clear(reconnectTimer);reconnectTimer=null}guard(()=>player?.disconnect());player=null;deviceId='';playing=false;yielded=false;track=null}
    function scheduleReconnect(){
      if(!player||!refresh||reconnects>=LIMITS.reconnectMs.length)return(dropPlayer(),say('problem',TEXT.lost));
      say('connecting',TEXT.dropped);
      reconnectTimer=timers.set(()=>{reconnectTimer=null;if(player)quiet(()=>player.connect())},LIMITS.reconnectMs[reconnects++]);
    }
    async function startPlayer(){
      if(busy)return;busy=true;
      try{
        say('connecting',TEXT.connecting);
        await token();
        const Spotify=await loadSdk();
        if(!player)buildPlayer(Spotify);
        const ok=await player.connect();
        if(!ok&&status==='connecting')say('problem','Spotify would not connect. Check that your account is Premium and is listed under Users Management in your Spotify app.');
      }catch(error){failure(error)}finally{busy=false}
    }
    function applyState(s){
      const current=s?.track_window?.current_track;track=current?cleanTrack(current):null;
      if(!s)return setPlay(false);
      if(autoPaused&&s.paused)return emit();
      setPlay(!s.paused&&!!current);
    }
    // The game soundtrack yields the moment Spotify plays, and takes back over only after a short debounce so a
    // track change that briefly reports "paused" does not make the two music sources trade places.
    function setPlay(value){
      playing=!!value;
      if(playing){clearHold();yielded=true;status='playing';message='';lastVolume=-1;applyVolume();return emit()}
      if(!yielded){status=idleStatus();return emit()}
      if(!holdTimer)holdTimer=timers.set(()=>{holdTimer=null;if(!playing&&!autoPaused){yielded=false;status=idleStatus();message=''}emit()},LIMITS.holdMs);
      emit();
    }
    function applyVolume(){
      if(!deviceReady())return;
      const v=muted?0:Math.round(clamp(level,0,1)*100)/100;if(v===lastVolume)return;
      const wait=lastVolumeAt+LIMITS.volumeGapMs-now();
      if(wait>0&&lastVolume>=0){if(!volumeTimer)volumeTimer=timers.set(()=>{volumeTimer=null;applyVolume()},wait);return}
      lastVolume=v;lastVolumeAt=now();quiet(()=>player.setVolume(v));
    }

    // ---- Web API calls (start playback here, bring the player's current music here) ------------------
    async function call(method,path,body,retry=true){
      let bearer;try{bearer=await token()}catch(error){return{ok:false,error}}
      if(!fetchFn)return{ok:false,offline:true};
      let res;
      try{res=await fetchFn(URLS.api+path,{method,headers:{Authorization:'Bearer '+bearer,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})}
      catch{return{ok:false,offline:true}}
      if(res.status===401&&retry){try{await token(true)}catch(error){return{ok:false,error}}return call(method,path,body,false)}
      const data=res.ok?null:await readJson(res);
      return{ok:!!res.ok,status:res.status,reason:clipText(data?.error?.reason,40)};
    }
    function callMessage(r,kind){
      if(r.offline)return TEXT.offline;if(r.error?.code==='signin')return TEXT.signedOut;if(r.error?.code==='offline')return TEXT.offline;
      if(r.status===403)return TEXT.refused;if(r.status===429)return TEXT.busy;
      if(r.status===404)return kind==='bring'||r.reason==='NO_ACTIVE_DEVICE'?TEXT.nothing:TEXT.notFound;
      return`Spotify returned an error (${Number(r.status)||'unknown'}). Try again.`;
    }
    function activate(){quiet(()=>player?.activateElement?.())}
    async function playLink(text){
      const link=parseLink(text);
      if(!link)return(note(TEXT.badLink),false);
      if(!deviceReady())return(note(TEXT.noDevice),false);
      activate();
      const r=await call('PUT','/me/player/play?device_id='+encodeURIComponent(deviceId),link.body);
      if(!r.ok){if(r.error?.code==='signin')failure(r.error);else note(callMessage(r,'play'));return false}
      note('Starting your music…');return true;
    }
    async function bringHere(){
      if(!deviceReady())return(note(TEXT.noDevice),false);
      activate();
      const r=await call('PUT','/me/player',{device_ids:[deviceId],play:true});
      if(!r.ok){if(r.error?.code==='signin')failure(r.error);else note(callMessage(r,'bring'));return false}
      note('Bringing your Spotify music here…');return true;
    }
    const control=name=>()=>{if(!deviceReady()||autoPaused)return false;activate();quiet(()=>player[name]?.());return true};

    // ---- hooks used by the game ---------------------------------------------------------------------
    function setLevel(value,isMuted){level=clamp(Number(value)||0,0,1);muted=!!isMuted;applyVolume()}
    // Pause while the page is hidden or Flight School is open; resume only what this call paused.
    function setAway(flag){
      flag=!!flag;if(flag===away)return;away=flag;if(!deviceReady())return;
      if(away){if(playing){autoPaused=true;quiet(()=>player.pause())}}
      else if(autoPaused){autoPaused=false;quiet(()=>player.resume())}
    }
    function setClientId(value){
      const next=clipText(value,80).trim();if(next===clientId)return;
      if(refresh&&next!==clientId)disconnect(false);
      clientId=validClientId(next)?next:'';persist();
      if(next&&!clientId)note(TEXT.badId);else if(status==='idle'&&!refresh)say('idle','');else emit();
    }
    function disconnect(speak=true){
      if(pending)endSignIn();
      dropPlayer();clearHold();if(volumeTimer){timers.clear(volumeTimer);volumeTimer=null}
      forgetTokens();authRetried=false;reconnects=0;busy=false;
      if(speak)say('idle',TEXT.disconnected);else emit();
    }
    function restore(){if(!sandbox&&refresh&&!busy&&!player)startPlayer()}
    async function copyRedirect(){try{await win.navigator.clipboard.writeText(redirectUri());note('Redirect URI copied. Paste it into your Spotify app\'s Redirect URIs.')}catch{note('Could not copy. Select the address above and copy it by hand.')}}
    // Text typed into the app ID box before this module was loaded (or before it was committed) still counts.
    function syncId(){const typed=ui?.clientId?.value;if(typeof typed==='string'&&typed.trim()&&typed.trim()!==clientId)setClientId(typed)}
    function bind(document=doc){
      if(sandbox){for(const id of['spotify-group','spotify-mini'])guard(()=>{const el=document?.getElementById(id);if(el)el.hidden=true});return false}
      if(bound||!document)return bound;bound=true;
      const find=id=>guard(()=>document.getElementById('spotify-'+id),null);
      ui={};for(const key of['status','clientId','redirect','copy','connect','disconnect','player','link','playLink','bring','prev','toggle','next','art','title','artist','open','mini','miniTitle','miniPrev','miniToggle','miniNext'])ui[key]=find(key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()));
      const click=(el,fn)=>el?.addEventListener?.('click',()=>guard(fn));
      click(ui.connect,()=>{syncId();return status==='waiting'?cancel():connect()});click(ui.disconnect,()=>disconnect());click(ui.copy,copyRedirect);
      ui.clientId?.addEventListener?.('change',()=>setClientId(ui.clientId.value));
      click(ui.playLink,()=>playLink(ui.link?.value));ui.link?.addEventListener?.('keydown',e=>{if(e?.key==='Enter')playLink(ui.link.value)});
      click(ui.bring,bringHere);
      for(const[a,b]of[['prev','miniPrev'],['toggle','miniToggle'],['next','miniNext']])for(const el of[ui[a],ui[b]])click(el,control(a==='toggle'?'togglePlay':a==='prev'?'previousTrack':'nextTrack'));
      win?.addEventListener?.('online',()=>{if(refresh&&!deviceReady()&&status==='problem')restore()});
      syncId();render();return true;
    }
    if(sandbox)return Object.freeze({sandbox:true,status:'idle',takesMusic:false,signedIn:false,snapshot,bind,connect:()=>false,cancel(){},disconnect(){},restore(){},setClientId(){},setLevel(){},setAway(){},copyRedirect:async()=>{},playLink:async()=>false,bringHere:async()=>false,toggle:()=>false,next:()=>false,previous:()=>false,redirectUri:()=>''});
    return{
      get sandbox(){return false},get status(){return status},get takesMusic(){return yielded&&deviceReady()},get signedIn(){return!!refresh},
      snapshot,bind,connect,cancel,disconnect,restore,setClientId,setLevel,setAway,playLink,bringHere,copyRedirect,
      toggle:control('togglePlay'),next:control('nextTrack'),previous:control('previousTrack'),redirectUri
    };
  }
  return Object.freeze({create,parseLink,validClientId,redirectProblem,authorizeUrl,challengeFor,randomString,cleanTrack,scopes:SCOPES,keys:KEYS,limits:LIMITS,urls:URLS,text:TEXT});
});
