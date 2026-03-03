import { NostrEvent } from "@nostrify/nostrify";

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_BLOSSOM_SERVERS: string[] = [
  "https://blossom.primal.net",
  "https://blossom.band",
  "https://nostr.media",
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate SHA-256 hash of a blob
 */
export async function calculateSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize blossom server URL
 */
function normalizeUrl(url: string): string {
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

// ============================================
// CORE API FUNCTIONS
// ============================================

/**
 * Get blossom servers from user's kind:10063 or use defaults
 */
export async function getBlossomServers(
  nostr: { query: (filters: any[]) => Promise<NostrEvent[]> },
  pubkey?: string
): Promise<string[]> {
  // Return defaults if no pubkey
  if (!pubkey || !nostr) {
    return DEFAULT_BLOSSOM_SERVERS;
  }

  try {
    const events = await nostr.query([
      {
        kinds: [10063],
        authors: [pubkey],
        limit: 10,
      },
    ]);

    if (!events?.length) {
      return DEFAULT_BLOSSOM_SERVERS;
    }

    // Extract server URLs from events
    const userServers = events
      .flatMap((event) =>
        event.tags
          .filter((tag) => tag[0] === "server")
          .map((tag) => normalizeUrl(tag[1]))
      )
      .filter((url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      });

    // Return user servers + defaults as fallback
    return userServers.length ? [...userServers, ...DEFAULT_BLOSSOM_SERVERS] : DEFAULT_BLOSSOM_SERVERS;

  } catch (error) {
    console.error("Error fetching blossom servers:", error);
    return DEFAULT_BLOSSOM_SERVERS;
  }
}

/**
 * Upload a blob to blossom servers
 */
export async function uploadToBlossom(
  blob: Blob,
  servers: string[] = DEFAULT_BLOSSOM_SERVERS,
  userPubkey?: string,
  signer?: { signEvent: (event: Partial<NostrEvent>) => Promise<NostrEvent> }
): Promise<string> {
  if (!userPubkey) {
    throw new Error("User pubkey is required for upload");
  }

  if (!signer) {
    throw new Error("Signer is required for upload");
  }

  // Calculate hash
  const sha256 = await calculateSHA256(blob);

  // Normalize servers
  const validServers = servers
    .map(normalizeUrl)
    .filter(url => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

  if (validServers.length === 0) {
    throw new Error("No valid blossom servers available");
  }

  // Create auth event
  const now = Math.floor(Date.now() / 1000);
  const authEvent = {
    kind: 24242,
    content: `Upload audio file`,
    tags: [
      ["t", "upload"],
      ["expiration", (now + 3600).toString()], // 1 hour expiry
      ["x", sha256],
    ],
    created_at: now,
    pubkey: userPubkey,
  };

  const signedEvent = await signer.signEvent(authEvent);
  const authHeader = `Nostr ${btoa(JSON.stringify(signedEvent))}`;

  // Try each server
  for (const server of validServers) {
    try {
      const uploadUrl = new URL("/upload", server).toString();
      
      const response = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "Authorization": authHeader,
          "Accept": "application/json",
        },
        mode: "cors",
      });

      if (!response.ok) {
        console.warn(`Upload failed to ${server}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (!data.url) {
        console.warn(`No URL returned from ${server}`);
        continue;
      }

      return data.url;

    } catch (error) {
      console.warn(`Upload error to ${server}:`, error);
      continue;
    }
  }

  throw new Error("All blossom servers failed");
}