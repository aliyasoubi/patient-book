/*
 * An installed Dentixo (home-screen or desktop app) should open the app, not
 * its marketing page. Installs made before this page existed still launch
 * `/`, and iOS keeps the URL it was added from, so the manifest alone can't
 * fix them. Loaded blocking in <head>, so the page never paints first.
 */
if (
  matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)')
    .matches ||
  navigator.standalone === true
) {
  location.replace('/dashboard');
}
