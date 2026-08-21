/*
 * config.js — the one file that needs a manual value dropped in after the
 * Google Apps Script deployment step (see README.md, step 6).
 *
 * This URL is not a secret — it's meant to be called from the browser.
 * The real gate is the auth token carried inside each guest's encrypted
 * bundle, checked server-side in apps-script/Code.gs.
 */
window.WEDDING_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxzRbhVyf9QZkM-JSj94qlzFdSx_U_LUdM0byrb9w3oLyILYgtacXVPk4a4VPq2o467/exec",
};
