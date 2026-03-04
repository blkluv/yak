// src/lib/blossom.ts
import { NostrEvent } from "@nostrify/nostrify";

const DEFAULT_BLOSSOM_SERVERS = [
  "https://blossom.primal.net",
  "https://blossom.band",
  "https://nostr.media",
];

/**
 * Get blossom servers with timeout and fallback
 */
export async function getBlossomServers(
  nostr: any,
  pubkey?: string
): Promise<string[]> {
  console.log('[Blossom] Getting servers for:', pubkey?.slice(0, 8));
  
  // Always return defaults immediately (don't wait for relays)
  const defaultServers = [...DEFAULT_BLOSSOM_SERVERS];
  
  if (!pubkey || !nostr) {
    console.log('[Blossom] No pubkey, using defaults');
    return defaultServers;
  }

  // Try to get user servers with timeout
  try {
    // Create a promise that resolves with user servers or times out
    const userServersPromise = (async () => {
      const events = await nostr.query([
        { kinds: [10063], authors: [pubkey], limit: 3 }
      ]);
      
      if (!events?.length) return [];
      
      return events
        .flatMap((event: any) => 
          event.tags
            .filter((tag: string[]) => tag[0] === 'server')
            .map((tag: string[]) => tag[1])
        )
        .filter((url: string) => url?.startsWith('http'));
    })();

    // Wait max 2 seconds for user servers
    const userServers = await Promise.race([
      userServersPromise,
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 2000))
    ]);

    if (userServers.length > 0) {
      console.log('[Blossom] Found user servers:', userServers);
      return [...userServers, ...defaultServers];
    }

  } catch (error) {
    console.log('[Blossom] Error fetching user servers:', error);
  }

  console.log('[Blossom] Using default servers');
  return defaultServers;
}

/**
 * Upload to blossom with timeout
 */
export async function uploadToBlossom(
  blob: Blob,
  servers: string[] = DEFAULT_BLOSSOM_SERVERS,
  userPubkey?: string,
  signer?: { signEvent: (event: any) => Promise<any> }
): Promise<string> {
  if (!userPubkey) throw new Error("User pubkey required");
  if (!signer) throw new Error("Signer required");

  const sha256 = await calculateSHA256(blob);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    for (const server of servers) {
      try {
        const authEvent = {
          kind: 24242,
          content: `Upload audio`,
          tags: [
            ["t", "upload"],
            ["expiration", (Math.floor(Date.now() / 1000) + 3600).toString()],
            ["x", sha256],
          ],
          created_at: Math.floor(Date.now() / 1000),
          pubkey: userPubkey,
        };

        const signedEvent = await signer.signEvent(authEvent);
        const authHeader = 'Nostr ' + btoa(JSON.stringify(signedEvent));

        const response = await fetch(`${server}/upload`, {
          method: 'PUT',
          body: blob,
          headers: {
            'Content-Type': blob.type || 'application/octet-stream',
            'Authorization': authHeader,
          },
          signal: controller.signal,
        });

        if (!response.ok) continue;

        const result = await response.json();
        if (result.url) return result.url;

      } catch (err) {
        console.log(`Upload to ${server} failed:`, err);
        continue;
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  throw new Error("All blossom servers failed");
}

export async function calculateSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}