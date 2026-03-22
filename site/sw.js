const CACHE_VERSION = 'v1';
const CACHE_NAME = `citypaul-course-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './_sidebar.md',
  './manifest.json',
  './theme.css',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/favicon.svg'
];

const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/docsify@4/lib/docsify.min.js',
  'https://cdn.jsdelivr.net/npm/docsify-themeable@0/dist/css/theme-simple.css',
  'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
  'https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-typescript.min.js',
  'https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-javascript.min.js',
  'https://cdn.jsdelivr.net/npm/docsify-copy-code@2/dist/docsify-copy-code.min.js'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('citypaul-course-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          fetchAndCache(request);
          return cachedResponse;
        }
        
        return fetchAndCache(request);
      })
      .catch(() => {
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

function fetchAndCache(request) {
  return fetch(request)
    .then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }
      
      if (shouldCache(request.url)) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(request, responseClone);
          });
      }
      
      return response;
    });
}

function shouldCache(url) {
  const cacheablePatterns = [
    /\.md$/,
    /\.html$/,
    /\.css$/,
    /\.js$/,
    /\.png$/,
    /\.ico$/,
    /\.svg$/,
    /\.json$/,
    /cdn\.jsdelivr\.net/,
    /human_course\//
  ];
  
  return cacheablePatterns.some(pattern => pattern.test(url));
}
