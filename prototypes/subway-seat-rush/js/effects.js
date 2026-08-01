"use strict";
/* 짧게 사라지는 3D 파티클과 화면 플래시 */
const VisualFX = (() => {
  const active=[];
  function burst(x,y,z,color=0xffffff,count=10){
    if(!scene) return;
    for(let i=0;i<count;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.045,5,4),
        new THREE.MeshBasicMaterial({color,transparent:true}));
      m.position.set(x,y,z); scene.add(m);
      const a=Math.random()*Math.PI*2, speed=.8+Math.random()*1.7;
      active.push({m,v:new THREE.Vector3(Math.cos(a)*speed,.7+Math.random()*1.5,Math.sin(a)*speed),life:.45+Math.random()*.25});
    }
  }
  function flash(kind='danger'){
    const el=document.getElementById('screenFx'); if(!el)return;
    el.className=''; void el.offsetWidth; el.className=kind+' flash';
  }
  function update(dt){
    for(let i=active.length-1;i>=0;i--){
      const p=active[i]; p.life-=dt; p.v.y-=3.2*dt; p.m.position.addScaledVector(p.v,dt);
      p.m.material.opacity=Math.max(0,p.life*2);
      if(p.life<=0){scene.remove(p.m);p.m.geometry.dispose();p.m.material.dispose();active.splice(i,1);}
    }
  }
  function clear(){ while(active.length){const p=active.pop();scene.remove(p.m);p.m.geometry.dispose();p.m.material.dispose();} }
  return {burst,flash,update,clear};
})();
