import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import { VoiceMessagePost } from "./VoiceMessagePost";
import { useInView } from "react-intersection-observer";
import { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Globe, Users, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 10;
const MAX_CACHED_EVENTS = 1000;
const POLL_INTERVAL_ACTIVE = 5000;
const POLL_INTERVAL_IDLE = 15000;

type FeedFilter = "global" | "following";

interface ThreadedMessage extends NostrEvent {
  replies: ThreadedMessage[];
}

// Type guard
function isNostrEvent(event: unknown): event is NostrEvent {
  return !!event && typeof event === 'object' && 'id' in event && 'kind' in event;
}

export function VoiceMessageFeed() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { ref, inView } = useInView();
  const [filter, setFilter] = useState<FeedFilter>("global");
  const queryClient = useQueryClient();
  const processedEvents = useRef<Set<string>>(new Set());
  const threadMapRef = useRef<Map<string, ThreadedMessage>>(new Map());
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [pollingInterval, setPollingInterval] = useState(POLL_INTERVAL_ACTIVE);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["voiceMessages", filter],
    initialPageParam: Math.floor(Date.now() / 1000),
    queryFn: async ({ pageParam }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      try {
        const baseFilter = {
          kinds: [1222],
          limit: PAGE_SIZE,
          until: pageParam as number,
        };

        if (filter === "following" && user?.pubkey) {
          const following = await nostr.query(
            [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
            { signal: controller.signal }
          );

          const followingEvent = following[0];
          if (followingEvent?.tags) {
            const followingList = followingEvent.tags
              .filter((tag) => tag[0] === "p")
              .map((tag) => tag[1]);

            if (followingList.length > 0) {
              const events = await nostr.query(
                [{ ...baseFilter, authors: followingList }],
                { signal: controller.signal }
              );
              return Array.isArray(events) ? events : [];
            }
          }
          return [];
        }

        const events = await nostr.query([baseFilter], { signal: controller.signal });
        return Array.isArray(events) ? events : [];
      } finally {
        clearTimeout(timeoutId);
      }
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.length || lastPage.length < PAGE_SIZE) return undefined;
      const lastMessage = lastPage[lastPage.length - 1];
      return lastMessage?.created_at ? lastMessage.created_at - 1 : undefined;
    },
  });

  // Adaptive polling
  useEffect(() => {
    if (!nostr) return;

    let consecutiveEmptyPolls = 0;
    
    const poll = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [1222], since: Math.floor(Date.now() / 1000) - 30 }],
          { signal: AbortSignal.timeout(2000) }
        );

        // Update polling interval based on activity
        if (events.length === 0) {
          consecutiveEmptyPolls++;
          if (consecutiveEmptyPolls > 3) {
            setPollingInterval(POLL_INTERVAL_IDLE);
          }
        } else {
          consecutiveEmptyPolls = 0;
          setPollingInterval(POLL_INTERVAL_ACTIVE);
        }

        // Process events (with size limit)
        for (const event of events) {
          if (!isNostrEvent(event)) continue;
          
          // Prevent memory leak
          if (processedEvents.current.size > MAX_CACHED_EVENTS) {
            const entries = Array.from(processedEvents.current);
            processedEvents.current = new Set(entries.slice(-MAX_CACHED_EVENTS));
          }
          
          if (processedEvents.current.has(event.id)) continue;
          
          // Update cache atomically
          await processNewEvent(event);
          processedEvents.current.add(event.id);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    const interval = setInterval(poll, pollingInterval);
    return () => clearInterval(interval);
  }, [nostr, filter, pollingInterval]);

  // Atomic cache update
  const processNewEvent = useCallback(async (event: NostrEvent) => {
    const rootTag = event.tags.find(t => t[0] === "e" && t[3] === "root");
    const replyTag = event.tags.find(t => t[0] === "e" && t[3] === "reply");

    if (!rootTag || !replyTag) return;

    queryClient.setQueryData<{ pages: ThreadedMessage[][] }>(
      ["voiceMessages", filter],
      (oldData) => {
        if (!oldData) return oldData;

        // Deep clone to avoid mutation
        const newData = JSON.parse(JSON.stringify(oldData));
        let updated = false;

        newData.pages = newData.pages.map((page: ThreadedMessage[]) => 
          page.map((msg: ThreadedMessage) => {
            if (msg.id === rootTag[1]) {
              const exists = msg.replies?.some(r => r.id === event.id);
              if (!exists) {
                updated = true;
                return {
                  ...msg,
                  replies: [...(msg.replies || []), { ...event, replies: [] }]
                    .sort((a, b) => a.created_at - b.created_at)
                };
              }
            }
            return msg;
          })
        );

        return updated ? newData : oldData;
      }
    );
  }, [queryClient, filter]);

  // Memoized thread builder
  const threadedMessages = useMemo(() => {
    if (!data?.pages?.length) return [];
    
    const allMessages = data.pages.flat();
    const messageMap = new Map<string, ThreadedMessage>();
    const rootMessages: ThreadedMessage[] = [];

    // Build map
    allMessages.forEach(msg => {
      messageMap.set(msg.id, { ...msg, replies: [] });
    });

    // Build threads
    allMessages.forEach(msg => {
      const rootTag = msg.tags.find(t => t[0] === "e" && t[3] === "root");
      if (rootTag) {
        const parent = messageMap.get(rootTag[1]);
        if (parent && !parent.replies.some(r => r.id === msg.id)) {
          parent.replies.push({ ...msg, replies: [] });
        }
      } else {
        const root = messageMap.get(msg.id);
        if (root) rootMessages.push(root);
      }
    });

    // Sort replies
    rootMessages.forEach(root => {
      root.replies.sort((a, b) => a.created_at - b.created_at);
    });

    return rootMessages.sort((a, b) => b.created_at - a.created_at);
  }, [data?.pages]);

  // Infinite scroll
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (status === "error") {
    return <div className="text-center text-destructive">Error: {error?.message}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter toggle */}
      <div className="flex justify-center">
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as FeedFilter)}>
          <ToggleGroupItem value="global">
            <Globe className="h-4 w-4 mr-2" /> Global
          </ToggleGroupItem>
          <ToggleGroupItem value="following" disabled={!user}>
            <Users className="h-4 w-4 mr-2" /> Following
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {status === "pending" ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : threadedMessages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {filter === "following" && !user
              ? "Please log in to see messages from people you follow"
              : filter === "following" && user
              ? "No messages from people you follow yet"
              : "No messages yet. Be the first to record a voice message!"}
          </div>
        ) : (
          threadedMessages.map((message) => (
            <div key={message.id}>
              <VoiceMessagePost message={message} />
              {message.replies.length > 0 && (
                <div className="ml-8 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedReplies(prev => {
                      const next = new Set(prev);
                      next.has(message.id) ? next.delete(message.id) : next.add(message.id);
                      return next;
                    })}
                  >
                    {expandedReplies.has(message.id) ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                    {message.replies.length} {message.replies.length === 1 ? 'reply' : 'replies'}
                  </Button>
                  {expandedReplies.has(message.id) && (
                    <div className="mt-2 space-y-2 border-l-2 border-muted pl-4">
                      {message.replies.map(reply => (
                        <VoiceMessagePost key={reply.id} message={reply} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Load more trigger */}
      <div ref={ref} className="h-12 flex items-center justify-center">
        {isFetchingNextPage ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
        ) : !hasNextPage && threadedMessages.length > 0 ? (
          <span className="text-sm text-muted-foreground">No more messages</span>
        ) : null}
      </div>
    </div>
  );
}