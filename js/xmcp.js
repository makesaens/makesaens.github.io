/* ============================================================
   XMCP — moteur « particles cursor animation » partagé.
   Recréation fidèle de l'effet de xmcp.dev (basement.studio) :
   - grille N×N de points WebGL ;
   - la LUMINOSITÉ d'une image (le texte) pilote taille + éclat ;
   - une texture de traînée curseur (canvas 256, halo qui s'efface)
     éjecte les points localement ;
   - twinkle + drift + fondu additif.
   Mode totem : uniforms uForm/uZoom en plus — le bruit plein écran
   se condense dans les lettres au fil du scroll (dispo, non branché :
   le totem du site utilise son système 2D d'origine).
   Instances : hero, footer. Panneau rétractable partagé.
   ============================================================ */
(function () {
  'use strict';

  /* Réglages de base — donnés par Guillaume (19/07) */
  var DEFAULTS = {
    particleQuantity: 512, particleSize: 0.035, motionBlurStrength: 2.95,
    displacementForce: 3.3, mouseAreaSize: 0.5, /* souris — réglages Guillaume 20/07 */
    smoothstepMin: 0.11, smoothstepMax: 0,
    fadeSpeed: 0.005, speedAlphaMultiplier: 0.23,
    cursorSmoothing: 0.24, cursorLerpStrength: 0.27,
    canvasResolution: 256
  };

  var VERT = [
    'precision highp float;',
    'attribute vec2 aPos;attribute vec2 aUv;attribute float aIntensity;attribute float aAngle;',
    'uniform vec2 uResolution;uniform sampler2D uPictureTexture;uniform sampler2D uDisplacementTexture;',
    'uniform float uDisplacementStrength;uniform float uPointSizeMultiplier;',
    'uniform float uSmoothstepMin;uniform float uSmoothstepMax;uniform float uTime;',
    'uniform float uMotionBlurStrength;uniform float uPlaneAspect;uniform float uImageAspect;',
    'uniform vec2 uCursorVelocity;uniform float uForm;uniform float uZoom;uniform vec4 uBand;',
    'varying vec3 vColor;varying vec2 vUv;',
    'void main(){',
    '  vec2 adjustedUv=aUv;',
    '  if(uPlaneAspect>uImageAspect){float s=uPlaneAspect/uImageAspect;adjustedUv.x=(aUv.x-0.5)*s+0.5;}',
    '  else{float s=uImageAspect/uPlaneAspect;adjustedUv.y=(aUv.y-0.5)*s+0.5;}',
    '  float pictureIntensity=texture2D(uPictureTexture,adjustedUv).r;',
    /* — mode totem : chaque point part d'une position éparse (hash 2D uniforme) et rejoint sa case
       dans la BANDE du texte (uBand = centre + échelle), départs étalés — */
    '  float stag=smoothstep(aIntensity*0.55,1.0,uForm);',
    '  float ei=stag*stag*(3.0-2.0*stag);',
    '  float h1=fract(sin(aAngle*127.1+aIntensity*311.7)*43758.5453);',
    '  float h2=fract(sin(aAngle*269.5+aIntensity*183.3)*28001.8384);',
    '  vec2 scatter=vec2(h1*2.0-1.0,h2*2.0-1.0)*(1.2+fract(aAngle*3.7)*2.2);',
    '  vec2 homePos=aPos*uBand.zw+uBand.xy;',
    '  vec3 newPosition=vec3(mix(scatter,homePos,ei),0.0);',
    '  float displacementIntensity=texture2D(uDisplacementTexture,aUv).r;',
    '  float rawIntensity=displacementIntensity;',
    /* seuils inversés : le repos est BLANC -> raw doit aussi s'inverser (sinon mix+bulge déplacent tout au repos) */
    '  if(uSmoothstepMax<uSmoothstepMin){rawIntensity=1.0-rawIntensity;}',
    '  displacementIntensity=smoothstep(uSmoothstepMin,uSmoothstepMax,displacementIntensity);',
    '  displacementIntensity=mix(displacementIntensity,rawIntensity,0.4);',
    '  displacementIntensity=pow(displacementIntensity,0.8);',
    '  displacementIntensity+=pow(rawIntensity,3.5)*0.3;',
    '  vec3 radialDisplacement=vec3(cos(aAngle)*0.25,sin(aAngle)*0.25,1.2);',
    '  vec3 flowDisplacement=vec3(uCursorVelocity.x*2.0,uCursorVelocity.y*2.0,0.3);',
    '  vec3 displacement=mix(radialDisplacement,flowDisplacement,displacementIntensity*0.7);',
    '  displacement=normalize(displacement);',
    '  displacement.z+=pow(displacementIntensity,1.5)*0.3;',
    '  displacement*=displacementIntensity*uDisplacementStrength*aIntensity*max(pictureIntensity,0.25*(1.0-uForm));',
    '  newPosition.xy+=displacement.xy*0.12;',
    '  float dz=displacement.z*0.10;',
    '  float driftSpeed=uTime*0.3;',
    '  vec2 drift=vec2(',
    '    sin(driftSpeed+aAngle*3.0)*0.03+sin(driftSpeed*0.5+aAngle)*0.015,',
    '    cos(driftSpeed+aAngle*2.0)*0.03+cos(driftSpeed*0.7+aAngle*1.5)*0.015);',
    '  drift*=aIntensity*uMotionBlurStrength*(1.0-displacementIntensity*0.5)*(1.0-pictureIntensity*0.5)*0.12;',
    '  newPosition.xy+=drift;',
    '  gl_Position=vec4(newPosition.xy*uZoom,0.0,1.0);',
    '  float twinkle1=sin(uTime*0.4+aAngle*10.0+aPos.x*2.0)*0.5+0.5;',
    '  float twinkle2=sin(uTime*0.25+aAngle*7.0+aPos.y*2.0)*0.5+0.5;',
    '  float twinkle3=sin(uTime*0.6+aAngle*13.0)*0.5+0.5;',
    '  float basePulse=sin(uTime*0.3)*0.5+0.5;',
    '  float tw=mix(mix(mix(twinkle1,twinkle2,0.5),twinkle3,0.3),basePulse,0.2);',
    '  tw=smoothstep(0.2,0.8,tw);',
    '  float twinkleStrength=(1.0-displacementIntensity*0.5)*uMotionBlurStrength;',
    '  float brightnessVariation=0.6+tw*0.6*twinkleStrength;',
    '  float sizePulse=1.0+sin(uTime*0.5+aAngle*5.0)*0.12*uMotionBlurStrength*(1.0-pictureIntensity*0.8);',
    '  float sizeFromBrightness=mix(0.85,1.15,brightnessVariation);',
    /* taille : image quand formé — petit grain de bruit clairsemé quand dispersé (mode totem) */
    '  float noiseGate=step(0.92,fract(aAngle*17.77));', /* ~8 % des points portent le brouillard */
    '  float noiseSize=(0.8+fract(aAngle*9.1)*1.2)*noiseGate*(uResolution.y/900.0);',
    /* taille des points image ∝ l'ESPACEMENT réel de la grille (uBand.w) — sinon une grille concentrée sature en blanc */
    '  float picSize=uPointSizeMultiplier*pictureIntensity*uResolution.y*uBand.w*(1.0/18.0);',
    '  gl_PointSize=mix(noiseSize,picSize,ei)*sizePulse*sizeFromBrightness*(1.0+dz*14.0);',
    '  float picL=pow(pictureIntensity,1.2)*1.8;',
    '  float noiseL=0.45*noiseGate;',
    '  vColor=vec3(mix(noiseL,picL,ei)*brightnessVariation*(1.0+dz*6.0));',
    '  vUv=aUv;',
    '}'].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec3 vColor;varying vec2 vUv;',
    'void main(){',
    '  vec2 uv=gl_PointCoord;',
    '  float d=length(uv-vec2(0.5));',
    '  if(d>0.5)discard;',
    '  float edgeDist=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y));',
    '  float edgeFade=smoothstep(0.0,0.4,edgeDist);',
    '  float alpha=1.0-smoothstep(0.0,0.5,d);',
    '  alpha=pow(alpha,0.8);',
    '  float glow=pow(alpha,2.0)*0.5;',
    '  vec3 c=vColor*(1.0+alpha*0.4+glow)*edgeFade;',
    '  float lum=clamp(max(max(c.r,c.g),c.b),0.0,1.0);',
    '  gl_FragColor=vec4(c*alpha,alpha*lum);', /* alpha ∝ luminosité : les points sombres ne masquent pas le fond */
    '}'].join('\n');

  /* halo de la traînée (équivalent de leur glow.png, généré) */
  var glowSprite = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return c;
  })();

  var mouse = { x: -9e4, y: -9e4 };
  window.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  function create(opts) {
    var canvas = opts.canvas;
    var P = opts.params || Object.assign({}, DEFAULTS);
    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) return null;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); /* additif */
    gl.clearColor(0, 0, 0, 0);    /* transparent : le fond du site vit derrière */

    var uni = {};
    ['uResolution', 'uPictureTexture', 'uDisplacementTexture', 'uDisplacementStrength', 'uPointSizeMultiplier',
     'uSmoothstepMin', 'uSmoothstepMax', 'uTime', 'uMotionBlurStrength', 'uPlaneAspect', 'uImageAspect',
     'uCursorVelocity', 'uForm', 'uZoom', 'uBand'].forEach(function (n) { uni[n] = gl.getUniformLocation(prog, n); });

    /* --- image pilote --- */
    var picTex = gl.createTexture(), imageAspect = 1;
    function setPicture(srcCanvas) {
      imageAspect = srcCanvas.width / srcCanvas.height;
      gl.bindTexture(gl.TEXTURE_2D, picTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    /* --- traînée curseur --- */
    var trail = {
      canvas: document.createElement('canvas'), ctx: null, tex: gl.createTexture(),
      target: { x: 9e4, y: 9e4 }, smoothed: { x: 9e4, y: 9e4 }, cursor: { x: 9e4, y: 9e4 },
      prev: { x: 9e4, y: 9e4 }, vel: { x: 0, y: 0 }, velS: { x: 0, y: 0 }
    };
    function resetTrail() {
      trail.canvas.width = trail.canvas.height = P.canvasResolution;
      trail.ctx = trail.canvas.getContext('2d');
      /* seuils inversés (max < min) : l'état de repos NET correspond à une traînée BLANCHE
         (= « je viens de nettoyer ») — sinon le texte charge tout éclaté et il faut passer la souris */
      trail.ctx.fillStyle = P.smoothstepMax < P.smoothstepMin ? '#fff' : '#000';
      trail.ctx.fillRect(0, 0, P.canvasResolution, P.canvasResolution);
      gl.bindTexture(gl.TEXTURE_2D, trail.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trail.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    resetTrail();

    /* --- grille de points --- */
    var buffers = null, count = 0, builtQuantity = -1;
    function makeGrid() {
      var n = P.particleQuantity + 1;
      builtQuantity = P.particleQuantity;
      count = n * n;
      var pos = new Float32Array(count * 2), uv = new Float32Array(count * 2);
      var inten = new Float32Array(count), ang = new Float32Array(count);
      var i = 0;
      for (var yy = 0; yy < n; yy++) {
        for (var xx = 0; xx < n; xx++) {
          var u = xx / (n - 1), v = yy / (n - 1);
          pos[i * 2] = u * 2 - 1; pos[i * 2 + 1] = v * 2 - 1;
          uv[i * 2] = u; uv[i * 2 + 1] = v;
          inten[i] = Math.random();
          ang[i] = Math.random() * Math.PI * 2;
          i++;
        }
      }
      if (buffers) Object.keys(buffers).forEach(function (k) { gl.deleteBuffer(buffers[k]); });
      buffers = {};
      function buf(name, data, size) {
        var b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        buffers[name] = b;
      }
      buf('aPos', pos, 2); buf('aUv', uv, 2); buf('aIntensity', inten, 1); buf('aAngle', ang, 1);
    }
    makeGrid();

    function resize(wCss, hCss) {
      canvas.width = Math.max(2, Math.floor(wCss * dpr));
      canvas.height = Math.max(2, Math.floor(hCss * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    /* --- une frame : maj traînée + rendu. state = { form, zoom } (défaut 1/1) --- */
    function render(tMs, state) {
      state = state || {};
      if (builtQuantity !== P.particleQuantity) makeGrid();
      if (trail.canvas.width !== P.canvasResolution) resetTrail();
      var t = tMs / 1000;

      /* position souris -> uv de CE canvas */
      var r = canvas.getBoundingClientRect();
      if (r.width > 0 && mouse.x > -9e3) {
        trail.target.x = (mouse.x - r.left) / r.width * trail.canvas.width;
        trail.target.y = (mouse.y - r.top) / r.height * trail.canvas.height;
      }
      var c = trail.ctx, cw = trail.canvas.width;
      trail.smoothed.x += (trail.target.x - trail.smoothed.x) * P.cursorSmoothing;
      trail.smoothed.y += (trail.target.y - trail.smoothed.y) * P.cursorSmoothing;
      var ox = trail.cursor.x, oy = trail.cursor.y;
      trail.cursor.x += (trail.smoothed.x - trail.cursor.x) * P.cursorLerpStrength;
      trail.cursor.y += (trail.smoothed.y - trail.cursor.y) * P.cursorLerpStrength;
      trail.vel.x = (trail.cursor.x - ox) / cw;
      trail.vel.y = -(trail.cursor.y - oy) / cw;
      trail.velS.x += (trail.vel.x - trail.velS.x) * 0.15;
      trail.velS.y += (trail.vel.y - trail.velS.y) * 0.15;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = P.fadeSpeed;
      c.fillStyle = P.smoothstepMax < P.smoothstepMin ? '#fff' : '#000';
      c.fillRect(0, 0, cw, cw);
      var dist = Math.hypot(trail.cursor.x - trail.prev.x, trail.cursor.y - trail.prev.y);
      trail.prev.x = trail.cursor.x; trail.prev.y = trail.cursor.y;
      var a = Math.min(dist * P.speedAlphaMultiplier, 1);
      if (a > 0.001 && trail.cursor.x < 8e4 && trail.cursor.x > -cw) {
        var sz = cw * P.mouseAreaSize;
        var inverted = P.smoothstepMax < P.smoothstepMin;
        c.globalCompositeOperation = inverted ? 'difference' : 'lighten'; /* inversé : le halo CREUSE le blanc */
        c.globalAlpha = a;
        c.drawImage(glowSprite, trail.cursor.x - sz / 2, trail.cursor.y - sz / 2, sz, sz);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, trail.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trail.canvas);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uni.uResolution, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, picTex);
      gl.uniform1i(uni.uPictureTexture, 0);
      gl.uniform1i(uni.uDisplacementTexture, 1);
      gl.uniform1f(uni.uDisplacementStrength, P.displacementForce);
      gl.uniform1f(uni.uPointSizeMultiplier, P.particleSize);
      gl.uniform1f(uni.uSmoothstepMin, P.smoothstepMin);
      gl.uniform1f(uni.uSmoothstepMax, P.smoothstepMax);
      gl.uniform1f(uni.uTime, t);
      gl.uniform1f(uni.uMotionBlurStrength, P.motionBlurStrength);
      var bandLoc = state.band || [0, 0, 1, 1];
      gl.uniform1f(uni.uPlaneAspect, (canvas.width * bandLoc[2]) / (canvas.height * bandLoc[3]));
      gl.uniform1f(uni.uImageAspect, imageAspect);
      gl.uniform2f(uni.uCursorVelocity, trail.velS.x, trail.velS.y);
      gl.uniform1f(uni.uForm, state.form === undefined ? 1 : state.form);
      gl.uniform1f(uni.uZoom, state.zoom === undefined ? 1 : state.zoom);
      var band = state.band || [0, 0, 1, 1];
      gl.uniform4f(uni.uBand, band[0], band[1], band[2], band[3]);
      gl.drawArrays(gl.POINTS, 0, count);
    }

    return { params: P, setPicture: setPicture, resize: resize, render: render };
  }

  /* --- image-texte utilitaire : dessine des lignes en Druk, blanc sur noir, léger halo --- */
  function textPicture(lines, opts) {
    opts = opts || {};
    var tw = opts.width || 2048;
    var m = document.createElement('canvas').getContext('2d');
    m.font = '900 100px Druk, "Arial Narrow", Arial';
    var widest = 0;
    lines.forEach(function (l) { widest = Math.max(widest, m.measureText(l).width); });
    if (!widest) return null;
    var fs = 100 * (tw * (opts.fill || 0.94)) / widest;
    var lineH = fs * (opts.lineH || 1.02);
    var th = Math.ceil(lineH * lines.length + fs * 0.16);
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    var x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, tw, th);
    x.font = '900 ' + fs + 'px Druk, "Arial Narrow", Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(255,255,255,0.55)';
    x.shadowBlur = fs * 0.03;
    x.fillStyle = '#fff';
    lines.forEach(function (l, i) {
      x.fillText(l, tw / 2, th / 2 + (i - (lines.length - 1) / 2) * lineH);
    });
    return c;
  }

  /* --- panneau rétractable partagé --- */
  var PANEL_DEFS = [
    ['Souris', [['mouseAreaSize', 'Zone', 0.05, 1, 0.01], ['displacementForce', 'Force', 0, 10, 0.1]]],
    ['Particules', [['particleQuantity', 'Quantité', 64, 512, 32], ['particleSize', 'Taille', 0.01, 0.3, 0.005], ['motionBlurStrength', 'Vie', 0, 3, 0.05]]],
    ['Déplacement', [['smoothstepMin', 'Seuil bas', 0, 1, 0.01], ['smoothstepMax', 'Seuil haut', 0, 1, 0.01]]],
    ['Traînée', [['fadeSpeed', 'Effacement', 0.005, 0.12, 0.005], ['speedAlphaMultiplier', 'Sensibilité', 0.01, 0.4, 0.01], ['cursorSmoothing', 'Lissage', 0.02, 0.5, 0.01], ['cursorLerpStrength', 'Poursuite', 0.02, 0.5, 0.01]]]
  ];
  function buildPanel(host, P, extraRows) {
    var panel = document.createElement('aside');
    panel.className = 'fx-panel';
    panel.setAttribute('aria-label', 'Réglages de l’effet');
    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'fx-tab';
    tab.textContent = '{ réglages }';
    tab.setAttribute('aria-label', 'Ouvrir / fermer les réglages');
    panel.appendChild(tab);
    var body = document.createElement('div');
    body.className = 'fx-body';
    panel.appendChild(body);

    function row(parent, name, label, min, max, step, get, set) {
      var r = document.createElement('label');
      r.className = 'tt-row';
      var nm = document.createElement('span');
      nm.className = 'tt-name'; nm.textContent = label;
      var input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.value = get();
      var val = document.createElement('span');
      val.className = 'tt-val';
      var show = function (v) { val.textContent = step >= 1 ? String(Math.round(v)) : (+v).toFixed(step < 0.01 ? 3 : 2); };
      show(get());
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        set(v); show(v);
      });
      r.appendChild(nm); r.appendChild(input); r.appendChild(val);
      parent.appendChild(r);
    }
    (extraRows || []).forEach(function (def) {
      row(body, def.key, def.label, def.min, def.max, def.step, def.get, def.set);
    });
    PANEL_DEFS.forEach(function (grp) {
      var h = document.createElement('div');
      h.className = 'fx-grp';
      h.textContent = grp[0];
      body.appendChild(h);
      grp[1].forEach(function (d) {
        row(body, d[0], d[1], d[2], d[3], d[4],
          function () { return P[d[0]]; },
          function (v) { P[d[0]] = v; });
      });
    });
    tab.addEventListener('click', function () { panel.classList.toggle('closed'); });
    host.appendChild(panel);
    return panel;
  }

  window.XMCP = { create: create, textPicture: textPicture, buildPanel: buildPanel, DEFAULTS: DEFAULTS };
})();
