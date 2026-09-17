import * as THREE from 'three';

const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const sampleShader = `
uniform sampler2D layer; uniform vec2 texel; uniform float scale; uniform bool outline;
uniform vec3 color; varying vec2 vUv;
void main(){
 vec4 p=texture2D(layer,vUv);float coverage=p.a;
 if(outline){float nearby=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)
   nearby=max(nearby,texture2D(layer,vUv+vec2(float(x),float(y))*texel).a);
  coverage=max(0.,nearby-p.a);p.rgb=color;
 }
 gl_FragColor=vec4(p.rgb*coverage,coverage)*scale;
}`;
const compositeShader = `
uniform sampler2D fills; uniform sampler2D lines; uniform sampler2D opaque;
uniform float scale; uniform float opacity; uniform vec3 background; varying vec2 vUv;
void main(){
 vec4 f=texture2D(fills,vUv),l=texture2D(lines,vUv);
 float a=1.-pow(1.-opacity,f.a/scale);
 vec3 c=mix(background,f.rgb/max(f.a,.00001),a);
 if(opacity>=1.){vec4 p=texture2D(opaque,vUv);c=mix(background,p.rgb,p.a);}
 c=mix(c,l.rgb/max(l.a,.00001),clamp(l.a/scale,0.,1.));
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Each ROI contributes its nearest surface once. Normalized additive layers are
 * order independent, including nested volumes. This is illustrative transparency,
 * not physical volume rendering; at 100% ordinary depth occlusion is retained. */
export class ContourCompositor {
 private layer: THREE.WebGLRenderTarget;
 private fills: THREE.WebGLRenderTarget;
 private lines: THREE.WebGLRenderTarget;
 private quadScene = new THREE.Scene();
 private camera = new THREE.Camera();
 private geometry = new THREE.PlaneGeometry(2,2);
 private sample: THREE.ShaderMaterial;
 private composite: THREE.ShaderMaterial;
 private quad: THREE.Mesh;
 constructor(private renderer: THREE.WebGLRenderer){
  const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
  this.layer=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});
  this.fills=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
  this.lines=this.fills.clone();
  this.sample=new THREE.ShaderMaterial({vertexShader,fragmentShader:sampleShader,depthTest:false,depthWrite:false,transparent:true,
   blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquation:THREE.AddEquation,
   uniforms:{layer:{value:this.layer.texture},texel:{value:new THREE.Vector2()},scale:{value:1},outline:{value:false},color:{value:new THREE.Color()}}});
  this.composite=new THREE.ShaderMaterial({vertexShader,fragmentShader:compositeShader,depthTest:false,depthWrite:false,
   uniforms:{fills:{value:this.fills.texture},lines:{value:this.lines.texture},opaque:{value:this.layer.texture},scale:{value:1},opacity:{value:.8},background:{value:new THREE.Color('#080c14')}}});
  this.quad=new THREE.Mesh(this.geometry,this.sample);this.quad.frustumCulled=false;this.quadScene.add(this.quad);
 }
 render(scene:THREE.Scene,camera:THREE.Camera,group:THREE.Group,opacity:number){
  const r=this.renderer,size=r.getDrawingBufferSize(new THREE.Vector2());
  if(this.layer.width!==size.x || this.layer.height!==size.y)for(const t of [this.layer,this.fills,this.lines])t.setSize(size.x,size.y);
  const target=r.getRenderTarget(),background=scene.background,clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),auto=r.autoClear;
  const meshes=group.children.filter(m=>m.visible) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[];
  const scale=1/Math.max(1,meshes.length);
  try{
   scene.background=null;r.setClearColor(0,0);r.autoClear=false;
   for(const t of [this.fills,this.lines]){r.setRenderTarget(t);r.clear();}
   for(const m of meshes)m.visible=false;
   this.quad.material=this.sample;this.sample.uniforms.scale.value=scale;
   this.sample.uniforms.texel.value.set(1.5*r.getPixelRatio()/size.x,1.5*r.getPixelRatio()/size.y);
   for(const m of meshes){
    m.visible=true;r.setRenderTarget(this.layer);r.clear();r.render(scene,camera);m.visible=false;
    this.sample.uniforms.outline.value=false;r.setRenderTarget(this.fills);r.render(this.quadScene,this.camera);
    this.sample.uniforms.outline.value=true;this.sample.uniforms.color.value.copy(m.material.color);
    r.setRenderTarget(this.lines);r.render(this.quadScene,this.camera);
   }
   for(const m of meshes)m.visible=true;
   if(opacity>=1){r.setRenderTarget(this.layer);r.clear();r.render(scene,camera);}
   this.quad.material=this.composite;this.composite.uniforms.scale.value=scale;this.composite.uniforms.opacity.value=opacity;
   r.setRenderTarget(target);r.render(this.quadScene,this.camera);
  }finally{for(const m of meshes)m.visible=true;scene.background=background;r.setRenderTarget(target);r.setClearColor(clear,alpha);r.autoClear=auto;}
 }
 dispose(){for(const t of [this.layer,this.fills,this.lines])t.dispose();this.sample.dispose();this.composite.dispose();this.geometry.dispose();}
}
