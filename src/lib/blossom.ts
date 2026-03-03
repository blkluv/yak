import { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_AUTH_EXPIRATION_HOURS = 1; // 1 hour max for uploads
const UPLOAD_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY_BASE = 1000; // 1 second

const DEFAULT_BLOSSOM_SERVERS: string[] = [
  "https://blossom.primal.net",
  "https://blossom.band",
  "https://nostr.media",
];

const SUPPORTED_MIME_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

// ============================================
// TYPES
// ============================================

interface BlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  uploaded: number;
}

interface BlossomServer {
  url: string;
  pubkey?: string;
}

interface UploadOptions {
  timeout?: number;
  retries?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

// ============================================
// TYPE GUARDS
// ============================================

function isBlobDescriptor(data: unknown): data is BlobDescriptor {
  return !!data && 
         typeof data === 'object' && 
         'url' in data && 
         'sha256' in data &&
         typeof (data as any).url === 'string';
}

function isNostrEvent(event: unknown): event is NostrEvent {
  return !!event && 
         typeof event === 'object' && 
         'id' in event && 
         'kind' in event;
}

// ============================================
// URL UTILITIES
// ============================================

/**
 * Normalize blossom server URL to consistent format
 */
function normalizeBlossomUrl(url: string): string {
  // Remove any whitespace
  url = url.trim();
  
  // Remove trailing slashes
  url = url.replace(/\/+$/, '');
  
  // Force HTTPS
  if (url.startsWith('http://')) {
    console.warn(`Insecure HTTP URL detected, converting to HTTPS: ${url}`);
    url = url.replace('http://', 'https://');
  }
  
  // Add protocol if missing
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    url = `https://${url}`;
  }
  
  // Handle common mistakes
  const fixes: [RegExp, string][] = [
    [/\/net\//g, '.net/'],      // blossom.band/net/ → blossom.band
    [/\/$/, ''],                 // Remove trailing slash
    [/\/+/g, '/'],               // Replace multiple slashes
  ];
  
  for (const [pattern, replacement] of fixes) {
    url = url.replace(pattern, replacement);
  }
  
  // Validate URL
  try {
    new URL(url);
    return url;
  } catch {
    throw new Error(`Invalid blossom server URL: ${url}`);
  }
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// ENCODING UTILITIES (Cross-platform)
// ============================================

/**
 * Base64 encode for both browser and Node.js
 */
function base64Encode(str: string): string {
  if (typeof btoa === 'function') {
    // Browser environment
    return btoa(str);
  }
  
  // Node.js/SSR environment
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  }
  
  throw new Error('No base64 encoding available in this environment');
}

// ============================================
// FILE VALIDATION
// ============================================

/**
 * Validate blob size and type
 */
function validateBlob(blob: Blob): void {
  // Check size
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB. ` +
      `Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }
  
  if (blob.size === 0) {
    throw new Error('File is empty');
  }
  
  // Check MIME type
  const isSupported = SUPPORTED_MIME_TYPES.some(type => 
    blob.type.startsWith(type.split(';')[0])
  );
  
  if (!isSupported && blob.type) {
    console.warn(`Unsupported MIME type: ${blob.type}, but will attempt upload anyway`);
  }
}

/**
 * Get file extension from blob type
 */
function getExtensionFromBlob(blob: Blob): string {
  if (blob.type.includes('webm')) return 'webm';
  if (blob.type.includes('mp4')) return 'mp4';
  if (blob.type.includes('mpeg') || blob.type.includes('mp3')) return 'mp3';
  if (blob.type.includes('wav')) return 'wav';
  if (blob.type.includes('ogg')) return 'ogg';
  return 'dat'; // fallback
}

// ============================================
// CRYPTO UTILITIES
// ============================================

/**
 * Calculate SHA-256 hash of a blob
 */
async function calculateSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Create NIP-98 authorization event
 */
async function createAuthorizationEvent(
  verb: "get" | "upload" | "list" | "delete",
  content: string,
  pubkey: string,
  signer: { signEvent: (event: Partial<NostrEvent>) => Promise<NostrEvent> },
  sha256?: string,
  expirationHours: number = MAX_AUTH_EXPIRATION_HOURS
): Promise<NostrEvent> {
  const now = Math.floor(Date.now() / 1000);
  const tags: string[][] = [
    ["t", verb],
    ["expiration", (now + expirationHours * 3600).toString()],
  ];

  if (sha256 && (verb === "upload" || verb === "delete")) {
    tags.push(["x", sha256]);
  }

  // Add timestamp for replay protection
  tags.push(["created_at", now.toString()]);

  const event = await signer.signEvent({
    kind: 24242,
    content,
    tags,
    created_at: now,
    pubkey,
  });

  if (!isNostrEvent(event)) {
    throw new Error("Signer returned invalid event");
  }

  return event;
}

// ============================================
// FETCH WITH RETRY & TIMEOUT
// ============================================

/**
 * Fetch with retry logic and timeout
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  uploadOptions?: UploadOptions
): Promise<Response> {
  const timeout = uploadOptions?.timeout ?? UPLOAD_TIMEOUT;
  const maxRetries = uploadOptions?.retries ?? MAX_RETRIES;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: uploadOptions?.abortSignal ?? controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Don't retry on certain status codes
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return response;
      }
      
      if (response.ok || attempt === maxRetries) {
        return response;
      }
      
      // Exponential backoff
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Don't retry on abort
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      
      // Exponential backoff
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}

// ============================================
// SERVER DISCOVERY
// ============================================

/**
 * Get blossom servers from user's kind:10063 or use defaults
 */
export async function getBlossomServers(
  nostr: { query: (filters: NostrFilter[]) => Promise<NostrEvent[]> },
  pubkey?: string
): Promise<BlossomServer[]> {
  // Start with defaults
  const servers: BlossomServer[] = DEFAULT_BLOSSOM_SERVERS.map(url => ({
    url: normalizeBlossomUrl(url),
  }));

  try {
    if (!pubkey) {
      console.log("No pubkey provided, using default servers");
      return servers;
    }

    const blossomEvents = await nostr.query([
      {
        kinds: [10063],
        authors: [pubkey],
        limit: 10,
      },
    ]);

    if (!blossomEvents?.length) {
      console.log("No blossom servers found, using defaults");
      return servers;
    }

    // Extract servers from events
    const userServers = blossomEvents
      .flatMap(event => 
        event.tags
          .filter(tag => tag[0] === "server")
          .map(tag => ({
            url: normalizeBlossomUrl(tag[1]),
            pubkey: event.pubkey,
          }))
      )
      .filter(server => isValidUrl(server.url));

    if (userServers.length > 0) {
      // Prefer user servers, but keep defaults as fallback
      return [...userServers, ...servers];
    }

    return servers;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error fetching blossom servers:", message);
    return servers; // Return defaults on error
  }
}

// ============================================
// UPLOAD TO BLOSSOM
// ============================================

/**
 * Upload a blob to blossom servers
 */
export async function uploadToBlossom(
  blob: Blob,
  servers: (string | BlossomServer)[] = DEFAULT_BLOSSOM_SERVERS,
  userPubkey?: string,
  signer?: { signEvent: (event: Partial<NostrEvent>) => Promise<NostrEvent> },
  options?: UploadOptions
): Promise<string> {
  // Validate inputs
  validateBlob(blob);

  if (!userPubkey) {
    throw new Error("User pubkey is required for upload authorization");
  }

  if (!signer) {
    throw new Error("Signer is required for upload authorization");
  }

  // Normalize servers
  const normalizedServers: BlossomServer[] = servers.map(s => {
    if (typeof s === 'string') {
      return { url: normalizeBlossomUrl(s) };
    }
    return { ...s, url: normalizeBlossomUrl(s.url) };
  }).filter(s => isValidUrl(s.url));

  if (normalizedServers.length === 0) {
    throw new Error("No valid blossom servers available");
  }

  // Calculate hash
  const sha256 = await calculateSHA256(blob);
  const extension = getExtensionFromBlob(blob);
  
  // Create auth event
  const authEvent = await createAuthorizationEvent(
    "upload",
    `Upload voice-message.${extension}`,
    userPubkey,
    signer,
    sha256
  );

  const authHeader = `Nostr ${base64Encode(JSON.stringify(authEvent))}`;

  // Track progress
  let lastProgress = 0;
  const progressInterval = options?.onProgress ? setInterval(() => {
    // Simulate progress (actual progress not available with fetch)
    lastProgress = Math.min(90, lastProgress + 10);
    options.onProgress?.(lastProgress);
  }, 500) : null;

  try {
    // Try each server in order
    for (const server of normalizedServers) {
      try {
        const uploadUrl = new URL("/upload", server.url).toString();
        
        const response = await fetchWithRetry(
          uploadUrl,
          {
            method: "PUT",
            body: blob,
            headers: {
              "Content-Type": blob.type,
              Accept: "application/json",
              Authorization: authHeader,
              Origin: typeof window !== 'undefined' ? window.location.origin : '',
            },
            mode: "cors",
            credentials: "omit",
          },
          options
        );

        if (!response.ok) {
          const reason = response.headers.get("X-Reason");
          const errorText = await response.text().catch(() => 'No error details');
          console.warn(
            `Upload failed to ${server.url}: ${response.status} ${response.statusText}` +
            (reason ? ` - ${reason}` : '')
          );
          continue; // Try next server
        }

        const data = await response.json();
        
        if (!isBlobDescriptor(data)) {
          console.warn(`Invalid response from ${server.url}`);
          continue;
        }

        if (data.sha256 !== sha256) {
          console.warn(`Hash mismatch from ${server.url}`);
          continue;
        }

        // Success!
        options?.onProgress?.(100);
        return data.url;

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Failed to upload to ${server.url}:`, message);
        continue; // Try next server
      }
    }

    throw new Error("All blossom servers failed");
    
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

// ============================================
// DOWNLOAD/GET FROM BLOSSOM
// ============================================

/**
 * Download a blob from blossom server
 */
export async function downloadFromBlossom(
  hash: string,
  servers: (string | BlossomServer)[] = DEFAULT_BLOSSOM_SERVERS,
  userPubkey?: string,
  signer?: { signEvent: (event: Partial<NostrEvent>) => Promise<NostrEvent> },
  options?: UploadOptions
): Promise<Blob> {
  const normalizedServers = servers.map(s => {
    if (typeof s === 'string') {
      return { url: normalizeBlossomUrl(s) };
    }
    return { ...s, url: normalizeBlossomUrl(s.url) };
  }).filter(s => isValidUrl(s.url));

  let authHeader: string | undefined;
  
  if (userPubkey && signer) {
    const authEvent = await createAuthorizationEvent(
      "get",
      `Download ${hash}`,
      userPubkey,
      signer,
      hash
    );
    authHeader = `Nostr ${base64Encode(JSON.stringify(authEvent))}`;
  }

  for (const server of normalizedServers) {
    try {
      const downloadUrl = new URL(`/${hash}`, server.url).toString();
      
      const headers: HeadersInit = {};
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const response = await fetchWithRetry(
        downloadUrl,
        { headers },
        options
      );

      if (!response.ok) {
        continue;
      }

      const blob = await response.blob();
      return blob;

    } catch (error) {
      continue;
    }
  }

  throw new Error(`Failed to download ${hash} from any blossom server`);
}

// ============================================
// DELETE FROM BLOSSOM
// ============================================

/**
 * Delete a blob from blossom server
 */
export async function deleteFromBlossom(
  hash: string,
  server: string | BlossomServer,
  userPubkey: string,
  signer: { signEvent: (event: Partial<NostrEvent>) => Promise<NostrEvent> }
): Promise<boolean> {
  const normalizedUrl = normalizeBlossomUrl(typeof server === 'string' ? server : server.url);
  
  const authEvent = await createAuthorizationEvent(
    "delete",
    `Delete ${hash}`,
    userPubkey,
    signer,
    hash
  );

  const authHeader = `Nostr ${base64Encode(JSON.stringify(authEvent))}`;

  try {
    const deleteUrl = new URL(`/${hash}`, normalizedUrl).toString();
    
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
      },
    });

    return response.ok;

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to delete ${hash}:`, message);
    return false;
  }
}