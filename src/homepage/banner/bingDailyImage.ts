import { forwardProxyChecked } from "@/api";

const BING_DAILY_IMAGE_SUFFIXES = {
    POD_UHD: "_UHD.jpg",
    POD_1K: "_1920x1080.jpg",
    POD_Normal: "_1366x768.jpg",
    rand_uhd: "_UHD.jpg",
    rand_1K: "_1920x1080.jpg",
    rand_Normal: "_1366x768.jpg",
} as const;

const BING_METADATA_ORIGINS = ["https://cn.bing.com", "https://www.bing.com"] as const;
const BING_METADATA_HEADERS: Record<string, string>[] = [{
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}];

type BingDailyImageType = keyof typeof BING_DAILY_IMAGE_SUFFIXES;
type BingMetadataRequest = (url: string) => Promise<unknown>;
type BingMetadataFailureStage = "network" | "http_status" | "empty_body" | "body_encoding" | "json_parse" | "invalid_schema";

export interface ResolveBingDailyImageOptions {
    random?: () => number;
    requestMetadata?: BingMetadataRequest;
}

export interface BingDailyImageResolution {
    imageUrl: string;
    fallbackImageUrl?: string;
}

interface BingImageMetadataItem {
    urlbase: string;
    url?: string;
}

export interface BingMetadataFailure {
    sourceHost: string;
    status: number | null;
    contentType: string | null;
    bodyEncoding: string | null;
    bodyLength: number;
    errorCode: string;
    failureStage: BingMetadataFailureStage;
}

export class BingDailyImageMetadataUnavailableError extends Error {
    readonly failures: BingMetadataFailure[];

    constructor(failures: BingMetadataFailure[]) {
        super("Bing daily image metadata is unavailable.");
        this.name = "BingDailyImageMetadataUnavailableError";
        this.failures = failures;
    }
}

class BingMetadataFailureError extends Error {
    readonly failure: BingMetadataFailure;

    constructor(failure: BingMetadataFailure) {
        super(failure.errorCode);
        this.name = "BingMetadataFailureError";
        this.failure = failure;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeDiagnosticString(value: unknown): string | null {
    return typeof value === "string" && value ? value.slice(0, 120) : null;
}

function getErrorCode(error: unknown): string {
    if (isRecord(error) && typeof error.code === "string" && error.code.trim()) {
        return error.code.trim().slice(0, 120);
    }
    return "network_error";
}

function createFailure(
    origin: string,
    response: Record<string, unknown> | null,
    failureStage: BingMetadataFailureStage,
    errorCode: string,
): BingMetadataFailure {
    const status = response && typeof response.status === "number" && Number.isFinite(response.status)
        ? response.status
        : null;
    const body = response?.body;
    return {
        sourceHost: origin.replace(/^https?:\/\//, ""),
        status,
        contentType: safeDiagnosticString(response?.contentType),
        bodyEncoding: safeDiagnosticString(response?.bodyEncoding),
        bodyLength: typeof body === "string" ? body.length : 0,
        errorCode: errorCode.slice(0, 120),
        failureStage,
    };
}

function fail(
    origin: string,
    response: Record<string, unknown> | null,
    failureStage: BingMetadataFailureStage,
    errorCode: string,
): never {
    throw new BingMetadataFailureError(createFailure(origin, response, failureStage, errorCode));
}

function parseBingImageMetadata(payload: unknown): BingImageMetadataItem[] {
    if (!isRecord(payload) || !Array.isArray(payload.images) || payload.images.length === 0) {
        throw new Error("Bing metadata images are invalid.");
    }

    return payload.images.map((item) => {
        if (!isRecord(item) || typeof item.urlbase !== "string" || !item.urlbase.trim()) {
            throw new Error("Bing metadata image URL is invalid.");
        }
        if (item.url !== undefined && typeof item.url !== "string") {
            throw new Error("Bing metadata fallback URL is invalid.");
        }
        return {
            urlbase: item.urlbase.trim(),
            ...(typeof item.url === "string" ? { url: item.url } : {}),
        };
    });
}

function isRandomBingDailyImageType(apiType: string): boolean {
    return apiType === "rand_uhd" || apiType === "rand_1K" || apiType === "rand_Normal";
}

function buildBingMetadataUrl(origin: string, imageCount: number): string {
    return `${origin}/HPImageArchive.aspx?format=js&idx=0&n=${imageCount}&mkt=zh-CN`;
}

function buildImageUrl(origin: string, image: BingImageMetadataItem, suffix: string): string {
    if (!image.urlbase.startsWith("/")) {
        return "";
    }
    return `${origin}${image.urlbase}${suffix}`;
}

function buildFallbackImageUrl(origin: string, image: BingImageMetadataItem): string | undefined {
    const url = image.url?.trim();
    if (!url || !url.startsWith("/")) return undefined;
    return `${origin}${url}`;
}

async function requestBingMetadata(url: string): Promise<unknown> {
    return forwardProxyChecked(
        url,
        "GET",
        {},
        BING_METADATA_HEADERS,
        10000,
        "application/json",
        "json",
        "text",
    );
}

function parseBingMetadataResponse(origin: string, responseValue: unknown): BingImageMetadataItem[] {
    if (!isRecord(responseValue)) {
        fail(origin, null, "network", "invalid_proxy_response");
    }

    const response = responseValue;
    if (
        typeof response.status !== "number"
        || !Number.isFinite(response.status)
        || response.status < 200
        || response.status >= 300
    ) {
        const errorCode = typeof response.status === "number" && Number.isFinite(response.status)
            ? `http_status_${response.status}`
            : "invalid_http_status";
        fail(origin, response, "http_status", errorCode);
    }

    if (typeof response.body !== "string" || !response.body.trim()) {
        fail(origin, response, "empty_body", "empty_body");
    }

    if (response.bodyEncoding !== "text") {
        fail(origin, response, "body_encoding", "unexpected_body_encoding");
    }

    const text = response.body.trim().replace(/^\uFEFF/, "").trim();
    if (!text) {
        fail(origin, response, "empty_body", "empty_body");
    }

    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        fail(origin, response, "json_parse", "invalid_json");
    }

    try {
        return parseBingImageMetadata(payload);
    } catch {
        fail(origin, response, "invalid_schema", "invalid_schema");
    }
}

function selectBingImage(images: BingImageMetadataItem[], random: () => number): BingImageMetadataItem {
    const value = random();
    const index = Number.isFinite(value)
        ? Math.min(images.length - 1, Math.max(0, Math.floor(value * images.length)))
        : 0;
    return images[index];
}

export async function resolveBingDailyImage(
    apiType: string,
    options: ResolveBingDailyImageOptions = {},
): Promise<BingDailyImageResolution | null> {
    const suffix = BING_DAILY_IMAGE_SUFFIXES[apiType as BingDailyImageType];
    if (!suffix) return null;

    const isRandom = isRandomBingDailyImageType(apiType);
    const imageCount = isRandom ? 8 : 1;
    const requestMetadata = options.requestMetadata ?? requestBingMetadata;
    const random = options.random ?? Math.random;
    const failures: BingMetadataFailure[] = [];

    for (const origin of BING_METADATA_ORIGINS) {
        let response: unknown = null;
        try {
            response = await requestMetadata(buildBingMetadataUrl(origin, imageCount));
            const images = parseBingMetadataResponse(origin, response);
            const image = isRandom ? selectBingImage(images, random) : images[0];
            const imageUrl = buildImageUrl(origin, image, suffix);
            if (!imageUrl) {
                fail(
                    origin,
                    isRecord(response) ? response : null,
                    "invalid_schema",
                    "invalid_urlbase",
                );
            }
            const fallbackImageUrl = apiType === "POD_UHD" || apiType === "rand_uhd"
                ? buildFallbackImageUrl(origin, image)
                : undefined;
            return {
                imageUrl,
                ...(fallbackImageUrl ? { fallbackImageUrl } : {}),
            };
        } catch (error) {
            const failure = error instanceof BingMetadataFailureError
                ? error.failure
                : createFailure(
                    origin,
                    isRecord(response) ? response : null,
                    "network",
                    getErrorCode(error),
                );
            failures.push(failure);
        }
    }

    throw new BingDailyImageMetadataUnavailableError(failures);
}

export async function resolveBingDailyImageUrl(
    apiType: string,
    options: ResolveBingDailyImageOptions = {},
): Promise<string | null> {
    const resolution = await resolveBingDailyImage(apiType, options);
    return resolution?.imageUrl ?? null;
}
