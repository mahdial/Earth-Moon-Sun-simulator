// GLSL for the Earth, Moon, atmosphere, stars. Eclipse shading is computed per-pixel from the true
// angular overlap of the Sun's disc and the occluding body (Moon for Earth, Earth for Moon).

export const OCC = /* glsl */`
float occlusion(vec3 P, vec3 sunPos, float sunR, vec3 occPos, float occR){
  vec3 ds = sunPos - P;  float Ls = length(ds);
  vec3 dc = occPos - P;  float Lo = length(dc);
  if (Lo >= Ls) return 0.0;
  float rs = asin(min(sunR / Ls, 0.9999));
  float ro = asin(min(occR / Lo, 0.9999));
  vec3 a = ds / Ls; vec3 b = dc / Lo;
  float d = atan(length(cross(a, b)), dot(a, b));
  if (d >= rs + ro) return 0.0;
  if (d <= abs(rs - ro)) return (ro >= rs) ? 1.0 : (ro * ro) / (rs * rs);
  float a0 = acos(clamp((d*d + rs*rs - ro*ro) / (2.0*d*rs), -1.0, 1.0));
  float a1 = acos(clamp((d*d + ro*ro - rs*rs) / (2.0*d*ro), -1.0, 1.0));
  float area = rs*rs*(a0 - sin(2.0*a0)*0.5) + ro*ro*(a1 - sin(2.0*a1)*0.5);
  return clamp(area / (3.14159265 * rs * rs), 0.0, 1.0);
}`;

export const bodyVert = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const earthFrag = /* glsl */`
precision highp float;
uniform sampler2D uDay, uNight, uSpec;
uniform vec3 uSunPos; uniform float uSunR;
uniform vec3 uOccPos; uniform float uOccR; uniform float uEclipse;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${OCC}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vP);
  vec3 L = normalize(uSunPos - vP);
  float ndl = dot(N, L);
  float vis = 1.0;
  if (uEclipse > 0.5) vis = pow(1.0 - occlusion(vP, uSunPos, uSunR, uOccPos, uOccR), 1.7);
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 night = texture2D(uNight, vUv).rgb;
  float spec = texture2D(uSpec, vUv).r;
  float lit = smoothstep(-0.02, 0.10, ndl) * max(ndl, 0.0);
  float soft = smoothstep(-0.10, 0.12, ndl);
  vec3 col = day * (0.030 + 1.15 * lit * vis);
  float lum = dot(day, vec3(0.3, 0.55, 0.15));
  float tw = exp(-pow((ndl - 0.01) / 0.045, 2.0));
  col += vec3(1.0, 0.45, 0.18) * tw * (0.03 + lum * 0.35) * vis * 0.30;
  vec3 R = reflect(-L, N);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(R, V), 0.0), 260.0) * spec * 0.55 * vis * step(0.0, ndl);
  float nightAmt = 1.0 - smoothstep(-0.14, 0.05, ndl);
  col += night * nightAmt * 2.1;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.20, 0.45, 1.0) * fres * (0.04 + 0.85 * smoothstep(-0.30, 0.35, ndl) * vis) * 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const moonFrag = /* glsl */`
precision highp float;
uniform sampler2D uTex;
uniform vec3 uSunPos; uniform float uSunR;
uniform vec3 uOccPos; uniform float uOccR; uniform float uEclipse;
uniform float uFlat; uniform float uTint;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${OCC}
void main(){
  vec3 N = normalize(vN);
  vec3 L = normalize(uSunPos - vP);
  float ndl = dot(N, L);
  float vis = 1.0;
  if (uEclipse > 0.5) vis = 1.0 - occlusion(vP, uSunPos, uSunR, uOccPos, uOccR);
  vec3 tex = texture2D(uTex, vUv).rgb * 1.55;
  float lit = smoothstep(-0.02, 0.06, ndl) * max(ndl, 0.0);
  vec3 col = tex * (0.010 + 1.75 * lit * vis);
  if (uEclipse > 0.5) {
    float umb = smoothstep(0.35, 1.0, 1.0 - vis);
    col += tex * vec3(1.0, 0.26, 0.08) * umb * 0.20 * smoothstep(-0.05, 0.3, ndl);
  }
  vec3 flatCol = tex * 1.15 * (0.85 + 0.15 * dot(N, normalize(cameraPosition - vP)));
  col = mix(col, flatCol, uFlat);
  col *= uTint;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const atmoVert = /* glsl */`
varying vec3 vN; varying vec3 vP;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const atmoFrag = /* glsl */`
precision highp float;
uniform vec3 uSunPos; uniform vec3 uCenter;
varying vec3 vN; varying vec3 vP;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
  float c = clamp(-dot(N, V), 0.0, 1.0);
  float f = pow(smoothstep(0.0, 0.46, c), 1.7);
  vec3 L = normalize(uSunPos - uCenter);
  vec3 dc = normalize(vP - uCenter);
  float sun = smoothstep(-0.30, 0.50, dot(dc, L));
  vec3 col = mix(vec3(0.10, 0.22, 0.55), vec3(0.32, 0.60, 1.0), sun);
  float a = f * (0.06 + 0.94 * sun);
  gl_FragColor = vec4(col * 0.95, a * 0.9);
}`;

export const starVert = /* glsl */`
attribute float aSize; attribute vec3 aColor;
uniform float uPR; varying vec3 vC;
void main(){
  vC = aColor;
  gl_PointSize = aSize * uPR;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
export const starFrag = /* glsl */`
precision mediump float; varying vec3 vC;
void main(){
  vec2 p = gl_PointCoord - 0.5; float d = length(p);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vC * a, a);
}`;
