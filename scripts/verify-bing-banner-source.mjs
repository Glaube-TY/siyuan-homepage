import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BING_METADATA_URL = (host, count) =>
  `${host}/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=zh-CN`;

async function loadFixture() {
  const result = await build({
    stdin: {
      sourcefile: "verify-bing-banner-source-fixture.ts",
      resolveDir: root,
      contents: `
        export { resolveBingDailyImage, resolveBingDailyImageUrl } from "./src/homepage/banner/bingDailyImage.ts";
        export { resolveBannerImage } from "./src/homepage/configLoader.ts";
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port.ts";
      `,
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    mainFields: ["browser", "module", "main"],
    target: "node24",
    tsconfig: resolve(root, "tsconfig.json"),
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

function metadataResponse(payload, options = {}) {
  return {
    status: 200,
    bodyEncoding: "text",
    contentType: "application/json; charset=utf-8",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    ...options,
  };
}

function metadata(urlbase, options = {}) {
  return metadataResponse({ images: [{ urlbase }] }, options);
}

async function main() {
  const fixture = await loadFixture();

  const podCases = [
    ["POD_UHD", "_UHD.jpg", "OHR.Test_ZH-CN123", {}],
    ["POD_1K", "_1920x1080.jpg", "OHR.Test_ZH-CN124", { contentType: "text/plain" }],
    ["POD_Normal", "_1366x768.jpg", "OHR.Test_ZH-CN125", {}],
  ];
  for (const [apiType, suffix, id, responseOptions] of podCases) {
    const requests = [];
    const result = await fixture.resolveBingDailyImageUrl(apiType, {
      requestMetadata: async (url) => {
        requests.push(url);
        return metadata(`/th?id=${id}`, responseOptions);
      },
    });
    assert.deepEqual(requests, [BING_METADATA_URL("https://cn.bing.com", 1)]);
    assert.equal(result, `https://cn.bing.com/th?id=${id}${suffix}`);
  }

  const uhdResolution = await fixture.resolveBingDailyImage("POD_UHD", {
    requestMetadata: async () => metadataResponse({
      images: [{
        urlbase: "/th?id=OHR.Uhd",
        url: "/th?id=OHR.Uhd_1920x1080.jpg&pid=hp",
      }],
    }),
  });
  assert.deepEqual(uhdResolution, {
    imageUrl: "https://cn.bing.com/th?id=OHR.Uhd_UHD.jpg",
    fallbackImageUrl: "https://cn.bing.com/th?id=OHR.Uhd_1920x1080.jpg&pid=hp",
  });

  const oneKResolution = await fixture.resolveBingDailyImage("POD_1K", {
    requestMetadata: async () => metadataResponse({
      images: [{
        urlbase: "/th?id=OHR.OneK",
        url: "/th?id=OHR.OneK_1920x1080.jpg&pid=hp",
      }],
    }),
  });
  assert.equal(oneKResolution.fallbackImageUrl, undefined);

  const bomResult = await fixture.resolveBingDailyImageUrl("POD_UHD", {
    requestMetadata: async () => metadataResponse(
      { images: [{ urlbase: "/th?id=OHR.Bom" }] },
      { body: `\uFEFF${JSON.stringify({ images: [{ urlbase: "/th?id=OHR.Bom" }] })}` },
    ),
  });
  assert.equal(bomResult, "https://cn.bing.com/th?id=OHR.Bom_UHD.jpg");

  const httpFailureRequests = [];
  await assert.rejects(
    () => fixture.resolveBingDailyImageUrl("POD_UHD", {
      requestMetadata: async (url) => {
        httpFailureRequests.push(url);
        return metadataResponse("<html>blocked</html>", {
          status: 403,
          contentType: "text/html",
        });
      },
    }),
    (error) => {
      assert.equal(error.failures[0].failureStage, "http_status");
      assert.equal(error.failures[0].status, 403);
      assert.equal(error.failures[0].contentType, "text/html");
      return true;
    },
  );
  assert.equal(httpFailureRequests.length, 2);

  for (const [body, expectedStage] of [["", "empty_body"], [JSON.stringify({ images: [] }), "body_encoding"]]) {
    await assert.rejects(
      () => fixture.resolveBingDailyImageUrl("POD_UHD", {
        requestMetadata: async () => metadataResponse(body, {
          bodyEncoding: expectedStage === "body_encoding" ? "base64" : "text",
        }),
      }),
      (error) => {
        assert.equal(error.failures[0].failureStage, expectedStage);
        return true;
      },
    );
  }

  await assert.rejects(
    () => fixture.resolveBingDailyImageUrl("POD_UHD", {
      requestMetadata: async () => metadataResponse("{invalid json"),
    }),
    (error) => {
      assert.equal(error.failures[0].failureStage, "json_parse");
      return true;
    },
  );

  for (const [apiType, suffix] of [
    ["rand_uhd", "_UHD.jpg"],
    ["rand_1K", "_1920x1080.jpg"],
    ["rand_Normal", "_1366x768.jpg"],
  ]) {
    const requests = [];
    const result = await fixture.resolveBingDailyImageUrl(apiType, {
      random: () => 0.5,
      requestMetadata: async (url) => {
        requests.push(url);
        return metadataResponse({
          images: Array.from({ length: 8 }, (_, index) => ({
            urlbase: `/th?id=OHR.History${index}`,
          })),
        });
      },
    });
    assert.deepEqual(requests, [BING_METADATA_URL("https://cn.bing.com", 8)]);
    assert.equal(result, `https://cn.bing.com/th?id=OHR.History4${suffix}`);
  }

  const fewerHistoryImages = await fixture.resolveBingDailyImageUrl("rand_uhd", {
    random: () => 0.5,
    requestMetadata: async (url) => {
      assert.equal(url, BING_METADATA_URL("https://cn.bing.com", 8));
      return metadata("/th?id=OHR.HistoryOnly");
    },
  });
  assert.equal(fewerHistoryImages, "https://cn.bing.com/th?id=OHR.HistoryOnly_UHD.jpg");

  const fallbackRequests = [];
  const fallbackResult = await fixture.resolveBingDailyImageUrl("POD_Normal", {
    requestMetadata: async (url) => {
      fallbackRequests.push(url);
      if (url === BING_METADATA_URL("https://cn.bing.com", 1)) {
        throw new Error("primary host unavailable");
      }
      return metadata("/th?id=OHR.Secondary");
    },
  });
  assert.deepEqual(fallbackRequests, [
    BING_METADATA_URL("https://cn.bing.com", 1),
    BING_METADATA_URL("https://www.bing.com", 1),
  ]);
  assert.equal(fallbackResult, "https://www.bing.com/th?id=OHR.Secondary_1366x768.jpg");

  const untouchedConfig = { bannerGlobalType: "bing", bingApiType: "POD_UHD" };
  const configSnapshot = structuredClone(untouchedConfig);
  const failedRequests = [];
  await assert.rejects(
    () => fixture.resolveBingDailyImageUrl("POD_UHD", {
      requestMetadata: async (url) => {
        failedRequests.push(url);
        throw new Error("metadata unavailable");
      },
    }),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(error.message, "Bing daily image metadata is unavailable.");
      assert.deepEqual(error.failures.map(({ sourceHost, failureStage }) => ({ sourceHost, failureStage })), [
        { sourceHost: "cn.bing.com", failureStage: "network" },
        { sourceHost: "www.bing.com", failureStage: "network" },
      ]);
      return true;
    },
  );
  assert.equal(failedRequests.length, 2);
  assert.deepEqual(untouchedConfig, configSnapshot);

  for (const invalidPayload of [{ images: [] }, { images: [{}] }]) {
    await assert.rejects(
      () => fixture.resolveBingDailyImageUrl("POD_UHD", {
        requestMetadata: async () => metadataResponse(invalidPayload),
      }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message, "Bing daily image metadata is unavailable.");
        assert.equal(error.failures[0].failureStage, "invalid_schema");
        return true;
      },
    );
  }

  const metadataProxyRequests = [];
  fixture.setSiyuanRuntimePort({
    async post(path, payload) {
      metadataProxyRequests.push({ path, payload });
      return {
        code: 0,
        data: {
          body: metadata("/th?id=OHR.Proxy").body,
          bodyEncoding: "text",
          contentType: "text/javascript",
          elapsed: 0,
          headers: {},
          status: 200,
          url: payload.url,
        },
      };
    },
  });
  const proxyResolvedImage = await fixture.resolveBingDailyImageUrl("POD_UHD");
  assert.equal(proxyResolvedImage, "https://cn.bing.com/th?id=OHR.Proxy_UHD.jpg");
  assert.equal(metadataProxyRequests.length, 1);
  assert.equal(metadataProxyRequests[0].path, "/api/network/forwardProxy");
  assert.equal(metadataProxyRequests[0].payload.url, BING_METADATA_URL("https://cn.bing.com", 1));
  assert.equal(metadataProxyRequests[0].payload.method, "GET");
  assert.deepEqual(metadataProxyRequests[0].payload.payload, {});
  assert.deepEqual(metadataProxyRequests[0].payload.headers, [{
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  }]);
  assert.equal(metadataProxyRequests[0].payload.timeout, 10000);
  assert.equal(metadataProxyRequests[0].payload.contentType, "application/json");
  assert.equal(metadataProxyRequests[0].payload.payloadEncoding, "json");
  assert.equal(metadataProxyRequests[0].payload.responseEncoding, "text");

  const fallbackImageRequests = [];
  const previousFallbackWarn = console.warn;
  console.warn = () => {};
  try {
    fixture.setSiyuanRuntimePort({
      async post(_path, payload) {
        fallbackImageRequests.push(payload.url);
        if (payload.url === BING_METADATA_URL("https://cn.bing.com", 1)) {
          return {
            code: 0,
            data: {
              body: metadataResponse({
                images: [{
                  urlbase: "/th?id=OHR.UhdFallback",
                  url: "/th?id=OHR.UhdFallback_1920x1080.jpg&pid=hp",
                }],
              }).body,
              bodyEncoding: "text",
              contentType: "application/json; charset=utf-8",
              elapsed: 0,
              headers: {},
              status: 200,
              url: payload.url,
            },
          };
        }
        if (payload.url.endsWith("_UHD.jpg")) {
          return {
            code: 0,
            data: {
              body: "",
              bodyEncoding: "base64",
              contentType: "image/jpeg",
              elapsed: 0,
              headers: {},
              status: 200,
              url: payload.url,
            },
          };
        }
        return {
          code: 0,
          data: {
            body: "iVBORw0KGgo=",
            bodyEncoding: "base64",
            contentType: "image/png",
            elapsed: 0,
            headers: {},
            status: 200,
            url: payload.url,
          },
        };
      },
    });
    const fallbackBanner = await fixture.resolveBannerImage({
      bannerEnabled: true,
      bannerGlobalType: "bing",
      bingApiType: "POD_UHD",
    }, true);
    assert.match(fallbackBanner.bannerImgSrc, /^data:image\/png;base64,/);
    assert.deepEqual(fallbackImageRequests, [
      BING_METADATA_URL("https://cn.bing.com", 1),
      "https://cn.bing.com/th?id=OHR.UhdFallback_UHD.jpg",
      "https://cn.bing.com/th?id=OHR.UhdFallback_1920x1080.jpg&pid=hp",
    ]);
  } finally {
    console.warn = previousFallbackWarn;
  }

  const warningEvents = [];
  const previousWarn = console.warn;
  console.warn = (...args) => warningEvents.push(args);
  try {
    fixture.setSiyuanRuntimePort({
      async post(_path, payload) {
        return {
          code: 0,
          data: {
            body: "<html>blocked</html>",
            bodyEncoding: "text",
            contentType: "text/html",
            elapsed: 0,
            headers: {},
            status: 403,
            url: payload.url,
          },
        };
      },
    });
    const failedBanner = await fixture.resolveBannerImage({
      bannerEnabled: true,
      bannerGlobalType: "bing",
      bingApiType: "POD_UHD",
    }, true);
    assert.equal(failedBanner.bannerImgSrc, "");
    assert.equal(warningEvents.length, 1);
    assert.equal(warningEvents[0][1].message, "Bing daily image metadata is unavailable.");
    assert.equal(warningEvents[0][1].failures[0].failureStage, "http_status");
    assert.equal(Object.hasOwn(warningEvents[0][1].failures[0], "body"), false);
  } finally {
    console.warn = previousWarn;
  }

  const legacyRequests = [];
  fixture.setSiyuanRuntimePort({
    async post(path, payload) {
      legacyRequests.push({ path, payload });
      return {
        code: 0,
        data: {
          body: "iVBORw0KGgo=",
          bodyEncoding: "base64",
          contentType: "image/png",
          elapsed: 0,
          headers: {},
          status: 200,
          url: payload.url,
        },
      };
    },
  });
  for (const [apiType, expectedUrl] of [
    ["ECY1", "https://www.dmoe.cc/random.php"],
    ["RAND1", "https://api.btstu.cn/sjbz/api.php"],
  ]) {
    legacyRequests.length = 0;
    const result = await fixture.resolveBannerImage({
      bannerEnabled: true,
      bannerGlobalType: "bing",
      bingApiType: apiType,
    }, true);
    assert.equal(legacyRequests.length, 1);
    assert.equal(legacyRequests[0].payload.url, expectedUrl);
    assert.match(result.bannerImgSrc, /^data:image\/png;base64,/);
  }

  console.log("Bing banner source verification passed.");
}

await main();
