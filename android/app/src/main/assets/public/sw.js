/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "525e724ef0b05c7367c14b7217e437fc"
  }, {
    "url": "pwa-512x512.png",
    "revision": "cc53ff8a4e9f06a7abce136d858f6ecd"
  }, {
    "url": "pwa-192x192.png",
    "revision": "eaeeaf54142ba6e3a8789be65d50a614"
  }, {
    "url": "index.html",
    "revision": "153ce38b5bdf809961d89b349e1b3c98"
  }, {
    "url": "icon.svg",
    "revision": "0ca2ec3223e7f1c20e67353ee30f47f2"
  }, {
    "url": "favicon.ico",
    "revision": "48da10ca454f2efc4c1cb60eacd1238e"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "388987159764ca473e6a206d06b53744"
  }, {
    "url": "assets/sagar_management_logo_1794727716847-CMJFokbQ.jpg",
    "revision": null
  }, {
    "url": "assets/sagar_hero_banner_1794727718342-3u5hWWou.jpg",
    "revision": null
  }, {
    "url": "assets/purify.es-Dzkdzyfv.js",
    "revision": null
  }, {
    "url": "assets/index.es-t5UtrF3v.js",
    "revision": null
  }, {
    "url": "assets/index-CXHVN8O_.js",
    "revision": null
  }, {
    "url": "assets/index-Bufy_T_X.css",
    "revision": null
  }, {
    "url": "assets/html2canvas-CMmPqx-B.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "388987159764ca473e6a206d06b53744"
  }, {
    "url": "favicon.ico",
    "revision": "48da10ca454f2efc4c1cb60eacd1238e"
  }, {
    "url": "icon.svg",
    "revision": "0ca2ec3223e7f1c20e67353ee30f47f2"
  }, {
    "url": "pwa-192x192.png",
    "revision": "eaeeaf54142ba6e3a8789be65d50a614"
  }, {
    "url": "pwa-512x512.png",
    "revision": "cc53ff8a4e9f06a7abce136d858f6ecd"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "525e724ef0b05c7367c14b7217e437fc"
  }, {
    "url": "manifest.webmanifest",
    "revision": "99d2d0d3f70f42157b8428b50283fa13"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
