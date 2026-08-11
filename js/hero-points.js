/* ============================================================
   LE NUAGE DE POINTS DU HÉROS (11/08 soir — v3 : il VOYAGE)
   Retour de Guillaume : « l'effet doit se déplacer un peu partout sur la
   hero section — points plus rapprochés, mouvement vraiment organique,
   comme un nuage de points en dégradé qui bouge ».

   - TROIS FOYERS en promenade sur TOUT le héros (trajectoires de
     Lissajous désynchronisées) — le nuage n'a plus de port d'attache ;
   - grille resserrée à 5 px (points de 2 px, séparation structurelle) ;
   - le grésillement temporel (hash position×temps, 18 rebrassages/s)
     mélangé 60/40 à la trame de Bayer — le nuage vit de l'intérieur ;
   - bords fondus (haut 8 %, bas 12 %) : jamais de ligne dure, et le
     bas retombe à l'aplat — le testimonial arrive sans couture ;
   - ~30 i/s, suspendu hors écran, statique si prefers-reduced-motion.
   ============================================================ */
(function () {
  var hero = document.getElementById('hero');
  var cv = document.getElementById('hero-points');
  if (!hero || !cv) return;
  var reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = cv.getContext('2d');
  var B = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,
           60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,
           15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(function (v) { return (v + 0.5) / 64; });

  var G = 4, DOT = 2;   /* 11/08, 5e cran : points condensés */
  function tailler() {
    var r = hero.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width));
    cv.height = Math.max(1, Math.round(r.height));
  }
  tailler();

  /* trois promeneurs : chacun sa vitesse, son phrasé, son rayon */
  function promeneur(t, ph, va, vb) {
    return {
      x: 0.5 + Math.sin(t * va + ph) * 0.36 + Math.sin(t * vb * 1.7 + ph * 2.3) * 0.1,
      y: 0.5 + Math.cos(t * vb + ph * 1.4) * 0.34 + Math.sin(t * va * 0.6 + ph) * 0.08
    };
  }

  function peindre(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    var W = Math.ceil(cv.width / G), H = Math.ceil(cv.height / G);
    /* 11/08, 4e cran : promenade ×2,3 plus rapide, et chaque foyer PULSE —
       son intensité oscille fortement (0,25 → 1), les zones s'allument et
       s'éteignent : les « variations d'intensité bien présentes ». */
    /* 5e cran : CINQ pochettes PETITES (rayon serré) — « plus de petites
       zones, que ça fasse du bruit » — chacune pulse à sa fréquence. */
    var F = [promeneur(t, 0.0, 0.25, 0.18), promeneur(t, 2.6, 0.19, 0.30),
             promeneur(t, 4.9, 0.32, 0.14), promeneur(t, 1.3, 0.28, 0.22),
             promeneur(t, 3.7, 0.16, 0.34)];
    var I = [0.62 + 0.38 * Math.sin(t * 0.9),        0.62 + 0.38 * Math.sin(t * 0.63 + 2.1),
             0.62 + 0.38 * Math.sin(t * 1.17 + 4.4), 0.62 + 0.38 * Math.sin(t * 0.78 + 1.2),
             0.62 + 0.38 * Math.sin(t * 1.4 + 3.3)];
    var graine = Math.floor(t * 24);
    for (var y = 0; y < H; y++) {
      var ny = y / H;
      /* bords fondus : pas de ligne dure en haut, retour à l'aplat en bas */
      var bord = Math.min(1, ny / 0.08) * Math.min(1, (1 - ny) / 0.12);
      if (bord <= 0) continue;
      for (var x = 0; x < W; x++) {
        var nx = x / W;
        var somme = 0;
        for (var k = 0; k < 5; k++) {
          var dx = (nx - F[k].x) * 1.35, dy = ny - F[k].y;
          /* falloff 24 (contre 9) : des pochettes deux fois plus petites */
          somme += Math.exp(-(dx * dx + dy * dy) * 24) * I[k];
        }
        var force = 0.55 * bord * Math.min(1.1, somme);
        if (force < 0.02) continue;
        var h = (x * 374761393 + y * 668265263 + graine * 2246822519) >>> 0;
        h = (h ^ (h >> 13)) * 1274126177 >>> 0;
        var bruit = ((h >>> 16) % 1000) / 1000;
        var seuil = B[(y % 8) * 8 + (x % 8)] * 0.6 + bruit * 0.4;
        if (force > seuil) {
          var marge = force - seuil;
          ctx.fillStyle = marge > 0.05 ? 'rgba(242, 240, 235, 0.55)' : 'rgba(242, 240, 235, 0.24)';
          ctx.fillRect(x * G + 1, y * G + 1, DOT, DOT);
        }
      }
    }
  }

  var raf = null, visible = true, derniere = 0;
  function tourner(now) {
    raf = null;
    if (now - derniere >= 33) { derniere = now; peindre(now / 1000); }
    if (visible && !document.hidden && !reduit) raf = requestAnimationFrame(tourner);
  }
  function relancer() { if (!raf && !reduit) raf = requestAnimationFrame(tourner); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) relancer();
    }, { threshold: 0.05 }).observe(hero);
  }
  document.addEventListener('visibilitychange', relancer);

  var t = null;
  addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { tailler(); peindre(0); }, 250);
  });

  peindre(0);
  relancer();
})();
