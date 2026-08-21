/*
 * unlock.js — reads the guest id + decryption key from the URL fragment,
 * fetches that guest's encrypted bundle, and decrypts it locally with
 * WebCrypto. The fragment (everything after "#") is never sent in any HTTP
 * request — it never reaches GitHub's servers or any access log — so this
 * is the only script that ever sees it.
 *
 * Every failure path — no fragment, malformed fragment, wrong key, missing
 * file, corrupt ciphertext — leads to the exact same neutral fallback card.
 * Nothing distinguishes "you have no link" from "your link is wrong" from
 * "that guest was revoked".
 */
(function () {
  "use strict";

  function base64urlToBytes(str) {
    var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    var pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function showFallback() {
    document.getElementById("loading").hidden = true;
    document.getElementById("fallback").hidden = false;
  }

  async function unlock() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash || hash.indexOf(".") === -1) return showFallback();

    var dot = hash.indexOf(".");
    var id = hash.slice(0, dot);
    var keyPart = hash.slice(dot + 1);

    // ids are short random base64url tokens produced by build-invites.mjs
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(id)) return showFallback();
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(keyPart)) return showFallback();

    var keyBytes, cryptoKey, res, buf;

    try {
      keyBytes = base64urlToBytes(keyPart);
      if (keyBytes.length !== 32) return showFallback();
      cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
    } catch (err) {
      return showFallback();
    }

    try {
      res = await fetch("d/" + id + ".bin", { cache: "no-store" });
      if (!res.ok) return showFallback();
      buf = await res.arrayBuffer();
    } catch (err) {
      return showFallback();
    }

    if (buf.byteLength < 12 + 16) return showFallback();

    try {
      var iv = new Uint8Array(buf.slice(0, 12));
      var ciphertext = buf.slice(12);
      var plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        cryptoKey,
        ciphertext
      );
      var json = new TextDecoder().decode(plainBuf);
      var bundle = JSON.parse(json);

      if (!bundle || !bundle.guest || !bundle.content || !bundle.details) {
        return showFallback();
      }

      document.getElementById("loading").hidden = true;
      window.__WEDDING_BUNDLE__ = bundle;
      window.dispatchEvent(new CustomEvent("bundle:ready", { detail: bundle }));
    } catch (err) {
      // Wrong key, tampered ciphertext, or malformed JSON all fail the
      // GCM auth tag check or the parse — same neutral response either way.
      return showFallback();
    }
  }

  if (!window.crypto || !window.crypto.subtle) {
    // Very old browser with no WebCrypto support — fail neutrally rather
    // than throw where a guest can see it.
    document.addEventListener("DOMContentLoaded", showFallback);
  } else {
    unlock();
  }
})();
