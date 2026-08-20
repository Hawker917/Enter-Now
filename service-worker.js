const CACHE_NAME = "enter-now-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./beep-boop.wav",
  "./icon-192.svg",
  "./icon-512.svg"
];


self.addEventListener(
  "install",
  (event) => {

    event.waitUntil(

      caches.open(
        CACHE_NAME
      ).then(
        (cache) => {

          return cache.addAll(
            APP_FILES
          );

        }
      )

    );

    self.skipWaiting();

  }
);


self.addEventListener(
  "activate",
  (event) => {

    event.waitUntil(

      caches.keys().then(
        (keys) => {

          return Promise.all(

            keys
              .filter(
                (key) =>
                  key !== CACHE_NAME
              )
              .map(
                (key) =>
                  caches.delete(key)
              )

          );

        }
      )

    );

    self.clients.claim();

  }
);


self.addEventListener(
  "fetch",
  (event) => {

    const request =
      event.request;


    if (
      request.method !== "GET"
    ) {

      return;

    }


    event.respondWith(

      caches.match(
        request
      ).then(

        (cachedResponse) => {

          if (cachedResponse) {

            return cachedResponse;

          }


          return fetch(
            request
          ).then(

            (response) => {

              const copy =
                response.clone();


              caches.open(
                CACHE_NAME
              ).then(
                (cache) => {

                  cache.put(
                    request,
                    copy
                  );

                }
              );


              return response;

            }

          );

        }

      )

    );

  }
);