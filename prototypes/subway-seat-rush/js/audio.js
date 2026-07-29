"use strict";
/* 외부 음원 없이 Web Audio API로 만드는 가벼운 절차적 사운드 시스템 */
const AudioFX = (() => {
  let ctx=null, master=null, music=null, ambience=null, muted=false, beatTimer=null, rumbleTimer=null;

  function ensure(){
    if (!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master=ctx.createGain(); master.gain.value=.42; master.connect(ctx.destination);
    }
    if (ctx.state==='suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, duration, options={}){
    if (muted) return;
    ensure();
    const now=ctx.currentTime, osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type=options.type||'sine';
    osc.frequency.setValueAtTime(freq,now);
    if(options.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20,options.to),now+duration);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(options.volume||.12,now+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain); gain.connect(options.bus||master); osc.start(now); osc.stop(now+duration+.03);
  }
  function noise(duration, volume=.12, filterFreq=1000, bus){
    if(muted) return;
    ensure();
    const len=Math.ceil(ctx.sampleRate*duration), buf=ctx.createBuffer(1,len,ctx.sampleRate), data=buf.getChannelData(0);
    for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
    const src=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    src.buffer=buf; filter.type='lowpass'; filter.frequency.value=filterFreq; gain.gain.value=volume;
    src.connect(filter); filter.connect(gain); gain.connect(bus||master); src.start();
  }
  function start(){
    ensure(); stop();
    // 효과음과 별도 버스. 멜로디가 열차 환경음 아래로 묻히지 않을 정도로 유지한다.
    music=ctx.createGain(); music.gain.value=.68; music.connect(master);
    ambience=ctx.createGain(); ambience.gain.value=.22; ambience.connect(master);
    const notes=[220,277.18,329.63,277.18,246.94,293.66,349.23,293.66]; let i=0;
    const bass=[110,123.47,92.5,103.83];
    const beat=()=>{ if(muted||!music)return;
      tone(notes[i%notes.length],.38,{type:'triangle',volume:.10,bus:music});
      if(i%2===0) tone(notes[i%notes.length]*2,.18,{type:'sine',volume:.045,bus:music});
      if(i%4===0){
        const root=bass[Math.floor(i/4)%bass.length];
        tone(root,1.55,{type:'sine',volume:.075,bus:music});
        tone(root*1.5,1.35,{type:'triangle',volume:.032,bus:music});
      }
      i++;
    };
    beat(); beatTimer=setInterval(beat,430);
    const rumble=()=>{ if(!muted&&ambience){ tone(43,.8,{type:'sawtooth',to:38,volume:.018,bus:ambience}); noise(.7,.012,180,ambience); } };
    rumble(); rumbleTimer=setInterval(rumble,760);
  }
  function stop(){ clearInterval(beatTimer); clearInterval(rumbleTimer); beatTimer=rumbleTimer=null; music=ambience=null; }
  function play(name){
    const sounds={
      approach:()=>{ tone(92,1.2,{type:'sawtooth',to:48,volume:.07}); noise(1.1,.055,420); },
      doorOpen:()=>{ tone(520,.18,{to:760,volume:.08}); setTimeout(()=>tone(760,.16,{to:960,volume:.07}),170); },
      doorClose:()=>{ tone(720,.16,{to:480,volume:.07}); setTimeout(()=>tone(210,.14,{type:'square',volume:.055}),150); },
      sit:()=>{ tone(150,.16,{to:95,volume:.1}); noise(.12,.035,600); },
      stand:()=>tone(180,.1,{to:240,volume:.05}),
      villain:()=>{ tone(155,.24,{type:'sawtooth',to:92,volume:.12}); setTimeout(()=>tone(105,.3,{type:'square',to:72,volume:.07}),160); },
      backpack:()=>{ noise(.3,.13,900); tone(90,.28,{type:'sawtooth',to:55,volume:.1}); },
      warning:()=>{ tone(880,.16,{type:'square',volume:.07}); setTimeout(()=>tone(880,.16,{type:'square',volume:.07}),260); },
      brake:()=>{ noise(.85,.17,1800); tone(120,.75,{type:'sawtooth',to:38,volume:.14}); },
      swing:()=>noise(.16,.08,2200),
      hit:()=>{ noise(.1,.16,700); tone(85,.13,{type:'square',to:48,volume:.12}); },
      success:()=>[523,659,784].forEach((n,i)=>setTimeout(()=>tone(n,.28,{volume:.08}),i*105)),
      fail:()=>{ tone(180,.45,{type:'sawtooth',to:70,volume:.1}); }
    };
    if(sounds[name]) sounds[name]();
  }
  function toggle(){
    muted=!muted;
    if(master) master.gain.setTargetAtTime(muted?0:.42,ctx.currentTime,.03);
    return muted;
  }
  return { ensure,start,stop,play,toggle,get muted(){return muted;} };
})();
