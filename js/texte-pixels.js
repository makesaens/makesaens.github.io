/* ============================================================
   LE TEXTE DU HÉROS EN PIXELS (08/08) — ESSAI
   Même moteur que les dalles (voir skills/premium-animations/recette-image-pixels.md) :
   une surface redécoupée en carrés jointifs, que le curseur écarte.

   La difficulté propre au texte : reproduire la mise en page EXACTE dans un canvas.
   Astuce : le moteur d'apparition a déjà emballé chaque mot dans un <span>. On lit
   donc la position et la police de chaque mot, et on le redessine à l'identique —
   aucune logique de retour à la ligne à réécrire.

   Le vrai texte RESTE dans le DOM (référencement, lecteurs d'écran) : il devient
   simplement transparent. Le canvas ne fait que le doubler.
   ============================================================ */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* Fonction paramétrée plutôt que valeurs en dur : le wordmark du 10/08 s'y était
     monté en une ligne. Il est retiré, la forme reste — elle ne coûte rien. */
  function monter(hote, REGL) {
  if (!hote) return;

  var CONF = { gap: REGL.gap, force: 9, radius: 130, spring: 0.020, maxd: 34, marge: REGL.marge };
  /* Le texte se disloque MOINS que les images : à intensité égale il devient illisible
     bien plus vite. Ce coefficient garde la phrase déchiffrable pendant le scroll. */
  var TXT_ATTENUE = REGL.attenue;
  var M = CONF.marge;
  var cv = document.createElement('canvas');
  cv.className = 'txt-px';
  hote.appendChild(cv);
  var ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, src = null, cases = [];
  var mx = -9999, my = -9999, raf = null, actif = false, pret = false;

  function motsVisibles() {
    return Array.prototype.slice.call(hote.querySelectorAll('.rv-i'))
      .filter(function (w) { return w.textContent.trim(); });
  }

  /* Peint le texte dans un canvas hors écran, mot par mot, à sa position réelle. */
  function peindre() {
    var mots = motsVisibles();
    if (!mots.length) return false;
    var hb = hote.getBoundingClientRect();
    W = Math.max(1, Math.round(hb.width));
    H = Math.max(1, Math.round(hb.height));

    /* ⚠ Le canvas SOURCE doit être à la résolution de l'écran, comme le canvas visible.
       En 1× alors que le contexte visible est en 2×, chaque tranche était AGRANDIE :
       texte flou et blanc affaibli par l'interpolation. */
    src = document.createElement('canvas');
    src.width = Math.round(W * dpr); src.height = Math.round(H * dpr);
    var o = src.getContext('2d');
    o.setTransform(dpr, 0, 0, dpr, 0, 0);   /* on continue à dessiner en pixels CSS */
    o.textBaseline = 'alphabetic';

    for (var i = 0; i < mots.length; i++) {
      var w = mots[i];
      var r = w.getBoundingClientRect();
      if (r.width < 0.5) return false;              /* mise en page pas encore stable */
      var cs = getComputedStyle(w.parentElement || w);
      o.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      /* ⚠ SANS letterSpacing, le canvas dessine les mots plus LARGES que leur boîte
         DOM (« Saens » : 151,3 px contre 147,5) et les espaces se referment.
         Avec, l'écart mesuré tombe à 0,0 px sur tous les mots. */
      if ('letterSpacing' in o) o.letterSpacing = cs.letterSpacing;
      o.fillStyle = cs.color;
      /* ⚠ Placement vertical : le rectangle du span fait la hauteur de la LIGNE
         (line-height), pas celle des lettres. Avec textBaseline 'top' on collait
         le haut du cadratin sur le haut de la ligne — d'où un décalage vertical et
         un espacement entre les deux phrases différent du DOM.
         On replace donc la ligne de base : demi-interligne + ascendante. */
      var m = o.measureText(w.textContent);
      var asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      var y;
      if (asc === undefined) { o.textBaseline = 'top'; y = r.top - hb.top; }
      else {
        var demi = (r.height - (asc + desc)) / 2;
        y = (r.top - hb.top) + demi + asc;
      }
      o.fillText(w.textContent, r.left - hb.left, y);
    }

    cv.style.left = (-M) + 'px'; cv.style.top = (-M) + 'px';
    cv.style.width = (W + M * 2) + 'px'; cv.style.height = (H + M * 2) + 'px';
    cv.width = (W + M * 2) * dpr; cv.height = (H + M * 2) * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cases = [];
    var g = CONF.gap;
    var SW = src.width, SH = src.height;
    var data = o.getImageData(0, 0, SW, SH).data;
    for (var y = 0; y < H; y += g) {
      for (var x = 0; x < W; x += g) {
        /* on ne garde que les carrés qui contiennent de l'encre :
           un titre est surtout du vide, inutile de dessiner des carrés transparents.
           Le test se fait en pixels ÉCRAN, puisque la source est en dpr. */
        var vide = true;
        var dy0 = Math.round(y * dpr), dy1 = Math.min(Math.round((y + g) * dpr), SH);
        var dx0 = Math.round(x * dpr), dx1 = Math.min(Math.round((x + g) * dpr), SW);
        for (var yy = dy0; yy < dy1 && vide; yy++) {
          for (var xx = dx0; xx < dx1; xx++) {
            if (data[(yy * SW + xx) * 4 + 3] > 12) { vide = false; break; }
          }
        }
        if (vide) continue;
        cases.push({
          sx: x, sy: y, sw: Math.min(g, W - x), sh: Math.min(g, H - y),
          hx: M + x, hy: M + y, x: M + x, y: M + y, vx: 0, vy: 0,
          n: 0.55 + ((x * 73 + y * 131 + ((x * y) % 17)) % 100) / 100 * 0.9,
          g: (((x * 37 + y * 91 + ((x + y) % 13)) % 100) / 100 - 0.5) * 2
        });
      }
    }
    return cases.length > 0;
  }

  function dessiner() {
    ctx.clearRect(0, 0, W + M * 2, H + M * 2);
    /* — EFFET DE MARÉE, partagé avec les dalles (09/08) —
       On lit les MÊMES réglages : un seul panneau pilote les deux. Le texte est
       moins haut qu'une dalle, donc le gradient y est plus serré — c'est voulu :
       le bas de la phrase reste net pendant que le haut décroche. */
    var R = window.__reglages, tr = 0, cis = 0, SCg = null;
    if (R) {
      SCg = R.SC;
      tr = R.SCROLL.retard;
      cis = (R.SCROLL.retard / (SCg.trainee || 1)) * SCg.cisail;
    }
    for (var i = 0; i < cases.length; i++) {
      var p = cases[i];
      var dxS = 0, dyS = 0;
      if (SCg && (Math.abs(tr) > 0.05 || Math.abs(cis) > 0.05)) {
        var t = H > 1 ? p.sy / H : 0;
        var grad = cis >= 0 ? Math.pow(1 - t, SCg.courbe) : Math.pow(t, SCg.courbe);
        dyS = tr - cis * grad;
        var inten = Math.abs(cis) * SCg.fente * grad * TXT_ATTENUE;
        var rx = ((p.sx * 37 + p.sy * 17) % 23) / 23 - 0.5;
        var ry = ((p.sx * 61 + p.sy * 41) % 29) / 29 - 0.5;
        dxS = rx * inten; dyS += ry * inten;
      }
      ctx.drawImage(src, p.sx * dpr, p.sy * dpr, p.sw * dpr, p.sh * dpr,
                         p.x + dxS, p.y + dyS, p.sw, p.sh);
      if (p.g > 0.18 || p.g < -0.18) {
        var ec = Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy);
        if (ec > 0.6) {
          var a = Math.min(ec / 90, 1) * 0.09 * Math.abs(p.g);
          ctx.fillStyle = p.g > 0 ? 'rgba(242,240,235,' + a.toFixed(3) + ')'
                                  : 'rgba(6,6,5,' + a.toFixed(3) + ')';
          ctx.fillRect(p.x + dxS, p.y + dyS, p.sw, p.sh);
        }
      }
    }
  }

  function tick() {
    raf = null;
    var R = CONF.radius, R2 = R * R, F = CONF.force, K = CONF.spring;
    var SIG = R / 4, MAXD = CONF.maxd, bouge = false;
    for (var i = 0; i < cases.length; i++) {
      var p = cases[i];
      var dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0.01) {
        var d = Math.sqrt(d2);
        var f = Math.exp(-(d * d) / (2 * SIG * SIG)) * F * p.n / Math.max(d, 14);
        p.vx += dx * f; p.vy += dy * f;
      }
      p.vx += (p.hx - p.x) * K; p.vy += (p.hy - p.y) * K;
      p.vx *= 0.84; p.vy *= 0.84;
      p.x += p.vx; p.y += p.vy;
      var ox = p.x - p.hx, oy = p.y - p.hy, od = Math.sqrt(ox * ox + oy * oy);
      if (od > MAXD) { p.x = p.hx + ox / od * MAXD; p.y = p.hy + oy / od * MAXD; p.vx *= 0.5; p.vy *= 0.5; }
      if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02 || od > 0.3) bouge = true;
    }
    dessiner();
    var R2 = window.__reglages;
    if (R2 && Math.abs(R2.SCROLL.retard) > 0.05) bouge = true;
    if (bouge || actif) raf = requestAnimationFrame(tick);
  }
  function relancer() { if (!raf && pret) raf = requestAnimationFrame(tick); }
  /* le traqueur de scroll des dalles réveille aussi le texte */
  (function brancher() {
    var R = window.__reglages;
    if (!R) { setTimeout(brancher, 200); return; }
    addEventListener('scroll', function () { relancer(); }, { passive: true });
  })();

  /* Le curseur agit depuis TOUT le héros, pas seulement sur les lettres :
     on doit pouvoir « frôler » le texte pour le troubler. */
  /* 11/08 : la scène du curseur est PROPRE À L'HÔTE (le héros pour le titre,
     le pied pour la mention) — un seul écouteur global aurait fait réagir
     les deux textes au même geste. */
  var scene = hote.closest('header, footer, section') || document.body;
  scene.addEventListener('pointermove', function (e) {
    if (!pret) return;
    var hb = hote.getBoundingClientRect();
    mx = M + (e.clientX - hb.left);
    my = M + (e.clientY - hb.top);
    actif = true; relancer();
  });
  scene.addEventListener('pointerleave', function () { mx = my = -9999; actif = false; relancer(); });

  function demarrer() {
    if (peindre()) { pret = true; hote.classList.add('txt-px-on'); dessiner(); }
  }
  /* On attend que l'apparition des mots soit finie ET les polices chargées,
     sinon on photographie un texte encore en mouvement. */
  function quandPret() { setTimeout(demarrer, 2200); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(quandPret);
  else quandPret();

  var t = null;
  addEventListener('resize', function () {
    clearTimeout(t);
    /* ⚠ La classe txt-px-on rend le texte DOM transparent — et peindre() lit la couleur
       CALCULÉE. La photographier sans la retirer produit un canvas vide : le titre
       disparaissait au premier redimensionnement. On l'ôte le temps de la photo. */
    t = setTimeout(function () {
      pret = false;
      hote.classList.remove('txt-px-on');
      if (peindre()) { pret = true; hote.classList.add('txt-px-on'); dessiner(); }
    }, 250);
  });
  }

  monter(document.querySelector('.hero-top'), { gap: 6, marge: 120, attenue: 0.78 });
  /* 11/08 : la mention du pied — même matière, mêmes gestes (la forme
     paramétrée de la passe 28 sert enfin) */
  monter(document.querySelector('.ft-mention'), { gap: 6, marge: 120, attenue: 0.78 });
})();
