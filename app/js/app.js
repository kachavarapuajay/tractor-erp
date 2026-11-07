/* ============================================================
   app.js — boot sequence and Android bridge
   ============================================================ */

function boot() {
  loadState();
  migrateLocations();
  if (!location.hash || location.hash === '#/' ) {
    if (!S.meta.setupDone) location.hash = '#/setup';
    else if (!S.session.userId) location.hash = '#/login';
    else location.hash = '#/dashboard';
  } else if (!S.meta.setupDone && location.hash.indexOf('setup') === -1) {
    location.hash = '#/setup';
  }
  Shell.build();
  Router.render();
  if (window.Sync && Sync.resumeAuto) { try { Sync.resumeAuto(); } catch (e) {} }
  if (window.Srv && Srv.resume) { try { Srv.resume(); } catch (e) {} }
  if (window.Cloud && Cloud.resume) { try { Cloud.resume(); } catch (e) {} }

  // keep the shell fresh after data changes from anywhere
  window.addEventListener('online', function () { toast('Back online'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var ms = qsa('.modalwrap');
      if (ms.length) { var top = ms[ms.length - 1]; top.parentNode.removeChild(top); }
    }
  });
}

/* Android hardware back button — returns true when the app handled it */
window.androidBack = function () {
  var ms = qsa('.modalwrap');
  if (ms.length) {
    var top = ms[ms.length - 1];
    top.parentNode.removeChild(top);
    return true;
  }
  var d = document.getElementById('drawer');
  if (d && d.classList.contains('open')) { Shell.closeDrawer(); return true; }
  var r = Router.current;
  if (r && r !== 'dashboard' && r !== 'login' && r !== 'setup') {
    Router.go('dashboard');
    return true;
  }
  return false;
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
