import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { io, type Socket } from "socket.io-client";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import {
  acceptFriendRequest, declineFriendRequest, getGetChatFriendsQueryKey, sendFriendRequest,
  useCreateDirectChat, useGetChatFriends, useGetChatMessages, useGetChatRooms, useJoinChatRoom,
  useLeaveChatRoom, useSearchChatStudents, useSendChatMessage,
} from "@workspace/api-client-react";
import type { ChatMessage, ChatRoom } from "@workspace/api-client-react";
import { getGetChatMessagesQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, ImagePlus, LoaderCircle, MessageCircle, MessagesSquare, MoreHorizontal,
  Paperclip, Search, Send, Smile, UserPlus, Users, X,
} from "lucide-react";
import { useAuth, errMsg } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const messageKey = (userId: string, roomId: string) =>
  ["chat-history", userId, getGetChatMessagesQueryKey(roomId)] as const;
const STICKERS = [
  { label: "You’ve got this", art: "YOU’VE GOT THIS", tone: "bg-amber-100 text-amber-900" },
  { label: "Nice work", art: "NICE WORK", tone: "bg-teal-100 text-teal-900" },
  { label: "Thinking of you", art: "KEEP GOING", tone: "bg-rose-100 text-rose-900" },
  { label: "Let’s practice", art: "PRACTICE?", tone: "bg-violet-100 text-violet-900" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "IQ";
}

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChatAvatar({ name, compact = false }: { name: string; compact?: boolean }) {
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/.12)] font-semibold text-[hsl(var(--primary))]", compact ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs")}>{initials(name)}</span>;
}

export default function CommunityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const roomsQuery = useGetChatRooms({ query: { enabled: !!user, staleTime: 20_000, queryKey: ["chat-rooms", user?.id] } });
  const friendsKey = ["chat-friends", user?.id, getGetChatFriendsQueryKey()] as const;
  const friendsQuery = useGetChatFriends({
    query: { enabled: !!user, staleTime: 15_000, queryKey: friendsKey },
  });
  const friendData = friendsQuery.data;
  const rooms = roomsQuery.data?.rooms ?? [];
  const [tab, setTab] = useState<"channels" | "direct">("channels");
  const [activeRoomId, setActiveRoomId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const searchParams = useMemo(() => ({ q: studentSearch.trim() }), [studentSearch]);
  const studentsQuery = useSearchChatStudents(searchParams, {
    query: { enabled: !!user && searchOpen && searchParams.q.length >= 2, queryKey: ["chat-students", user?.id, searchParams], staleTime: 10_000 },
  });
  const refreshFriendData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: friendsKey }),
      queryClient.invalidateQueries({ queryKey: ["chat-students", user?.id] }),
    ]);
  };
  const requestFriend = useMutation({ mutationFn: (input: { userId: string }) => sendFriendRequest(input), onSuccess: refreshFriendData });
  const acceptFriend = useMutation({ mutationFn: (requestId: string) => acceptFriendRequest(requestId), onSuccess: refreshFriendData });
  const declineFriend = useMutation({ mutationFn: (requestId: string) => declineFriendRequest(requestId), onSuccess: refreshFriendData });
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");
  const [picker, setPicker] = useState<"emoji" | "sticker" | null>(null);
  const [sendError, setSendError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [socketOnline, setSocketOnline] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketRoomRef = useRef("");
  const activeRoomRef = useRef("");
  const accountIdRef = useRef(user?.id);
  const sendingSignatures = useRef(new Set<string>());
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const messagesQuery = useGetChatMessages(activeRoomId || "", {
    query: {
      enabled: !!user && !!activeRoomId && !!activeRoom?.isMember,
      queryKey: messageKey(user?.id ?? "", activeRoomId || ""),
      staleTime: 0,
    },
  });
  const createDirect = useCreateDirectChat();
  const joinRoom = useJoinChatRoom();
  const leaveRoom = useLeaveChatRoom();
  const sendMessage = useSendChatMessage();
  const messages = messagesQuery.data?.messages ?? [];
  const directRooms = rooms.filter((room) => !room.isPublic);
  const publicRooms = rooms.filter((room) => room.isPublic);
  const friends = friendData?.friends ?? [];
  const incomingRequests = friendData?.incomingRequests ?? [];
  const outgoingRequests = friendData?.outgoingRequests ?? [];

  useEffect(() => {
    if (accountIdRef.current === user?.id) return;
    const previousId = accountIdRef.current;
    accountIdRef.current = user?.id;
    if (previousId) {
      queryClient.removeQueries({ queryKey: ["chat-friends", previousId] });
      queryClient.removeQueries({ queryKey: ["chat-students", previousId] });
    }
    setActiveRoomId("");
    setMobileChat(false);
    setSearchOpen(false);
    setStudentSearch("");
    requestFriend.reset();
    acceptFriend.reset();
    declineFriend.reset();
    setDraft("");
    setSendError("");
    setPicker(null);
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(null);
    setAttachmentPreview("");
  }, [user?.id, queryClient]);

  useEffect(() => () => {
    if (user?.id) {
      queryClient.removeQueries({ queryKey: ["chat-friends", user.id] });
      queryClient.removeQueries({ queryKey: ["chat-students", user.id] });
    }
  }, [user?.id, queryClient]);

  useEffect(() => {
    activeRoomRef.current = activeRoom?.isMember ? activeRoom.id : "";
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.connected) {
      if (socketRoomRef.current) socket.emit("chat:leave", { roomId: socketRoomRef.current });
      if (activeRoomRef.current) {
        socket.emit("chat:join", { roomId: activeRoomRef.current });
        socketRoomRef.current = activeRoomRef.current;
      } else {
        socketRoomRef.current = "";
      }
    }
  }, [activeRoom?.id, activeRoom?.isMember]);

  useEffect(() => {
    if (!user?.id) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketOnline(false);
      return;
    }
    const socket = io(window.location.origin, { withCredentials: true, path: "/socket.io" });
    socketRef.current = socket;
    const onConnect = () => {
      setSocketOnline(true);
      void queryClient.invalidateQueries({ queryKey: ["chat-friends", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["chat-students", user.id] });
      if (activeRoomRef.current) {
        socket.emit("chat:join", { roomId: activeRoomRef.current });
        socketRoomRef.current = activeRoomRef.current;
        void queryClient.invalidateQueries({ queryKey: messageKey(user.id, activeRoomRef.current) });
      }
    };
    const onDisconnect = () => setSocketOnline(false);
    const onMessage = (message: ChatMessage) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-rooms", user.id] });
      const roomId = activeRoomRef.current;
      if (!roomId || message.roomId !== roomId) return;
      const sig = `${message.senderId}:${message.text}:${message.imageUrl ?? ""}`;
      if (sendingSignatures.current.has(sig)) return;
      const key = messageKey(user.id, roomId);
      queryClient.setQueryData(key, (old: { messages: ChatMessage[] } | undefined) => {
        if (!old || old.messages.some((item) => item.id === message.id)) return old;
        return { ...old, messages: [...old.messages, message] };
      });
      void queryClient.invalidateQueries({ queryKey: key });
    };
    const onFriendUpdate = () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-friends", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["chat-students", user.id] });
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:message", onMessage);
    socket.on("chat:friend-update", onFriendUpdate);
    return () => {
      if (socketRoomRef.current) socket.emit("chat:leave", { roomId: socketRoomRef.current });
      socketRoomRef.current = "";
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:message", onMessage);
      socket.off("chat:friend-update", onFriendUpdate);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setSocketOnline(false);
    };
  }, [user?.id, queryClient]);

  useEffect(() => {
    if (rooms.length && !activeRoomId) {
      const first = rooms.find((room) => room.isPublic && room.isMember) ?? rooms.find((room) => !room.isPublic) ?? rooms[0];
      if (first) setActiveRoomId(first.id);
    }
  }, [rooms, activeRoomId]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeRoomId]);

  useEffect(() => () => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
  }, [attachmentPreview]);

  const selectRoom = (room: ChatRoom) => {
    setActiveRoomId(room.id);
    setMobileChat(true);
    setPicker(null);
    setSendError("");
  };

  const updateMembership = (room: ChatRoom) => {
    queryClient.setQueryData<{ rooms: ChatRoom[] }>(roomsQuery.queryKey, (old) =>
      old ? { ...old, rooms: old.rooms.map((item) => item.id === room.id ? room : item) } : old,
    );
    setActiveRoomId(room.id);
    setMobileChat(true);
  };

  const changeAttachment = (file?: File) => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    if (!file) {
      setAttachment(null);
      setAttachmentPreview("");
      return;
    }
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
    setPicker(null);
  };

  const uploadImage = async (roomId: string, file: File) => {
    const form = new FormData();
    form.append("image", file);
    setUploading(true);
    try {
      const response = await fetch(`/api/chat/rooms/${encodeURIComponent(roomId)}/images`, {
        method: "POST", credentials: "include", body: form,
      });
      if (!response.ok) {
        let message = "Image upload failed. Try again.";
        try {
          const payload = await response.json();
          if (typeof payload.error === "string") message = payload.error;
        } catch { /* Keep the readable fallback. */ }
        throw new Error(message);
      }
      return (await response.json() as { imageUrl: string }).imageUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!activeRoom || !activeRoom.isMember || (!draft.trim() && !attachment) || sendMessage.isPending || uploading) return;
    setSendError("");
    const roomId = activeRoom.id;
    const text = draft.trim();
    try {
      let imageUrl: string | undefined;
      if (attachment) imageUrl = await uploadImage(roomId, attachment);
      const payload = { ...(text ? { text } : {}), ...(imageUrl ? { imageUrl } : {}) };
      const signature = `${user?.id ?? ""}:${payload.text ?? ""}:${payload.imageUrl ?? ""}`;
      sendingSignatures.current.add(signature);
      window.setTimeout(() => sendingSignatures.current.delete(signature), 8_000);
      const result = await sendMessage.mutateAsync({ roomId, data: payload });
      const key = messageKey(user?.id ?? "", roomId);
       queryClient.setQueryData(key, (old: { messages: ChatMessage[] } | undefined) =>
        old && !old.messages.some((item) => item.id === result.id)
          ? { ...old, messages: [...old.messages, result] }
          : old,
      );
      setDraft("");
      changeAttachment();
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      sendingSignatures.current.clear();
      setSendError(errMsg(error, "Your message could not be sent."));
    }
  };

  const openDirect = (userId: string) => {
    createDirect.mutate({ data: { userId } }, {
      onSuccess: (room) => {
        void queryClient.invalidateQueries({ queryKey: roomsQuery.queryKey });
        updateMembership(room);
        setTab("direct");
        setSearchOpen(false);
        setStudentSearch("");
      },
    });
  };

  const join = () => {
    if (!activeRoom) return;
    joinRoom.mutate({ roomId: activeRoom.id }, { onSuccess: updateMembership });
  };

  const leave = () => {
    if (!activeRoom) return;
    const roomId = activeRoom.id;
    leaveRoom.mutate({ roomId }, {
      onSuccess: async () => {
        queryClient.setQueryData<{ rooms: ChatRoom[] }>(roomsQuery.queryKey, (old) =>
          old ? { ...old, rooms: old.rooms.map((room) => room.id === roomId ? { ...room, isMember: false } : room) } : old,
        );
        if (activeRoomRef.current === roomId) {
          socketRef.current?.emit("chat:leave", { roomId });
          activeRoomRef.current = "";
          socketRoomRef.current = "";
        }
        await queryClient.invalidateQueries({ queryKey: roomsQuery.queryKey });
      },
    });
  };

  const chooseEmoji = (emoji: EmojiClickData) => setDraft((value) => `${value}${emoji.emoji}`);
  const addSticker = (sticker: typeof STICKERS[number]) => {
    setDraft((value) => `${value}${value ? " " : ""}${sticker.label}`);
    setPicker(null);
  };
  const visibleRooms = tab === "channels" ? publicRooms : directRooms;
  const activeTitle = activeRoom ? (activeRoom.otherUser?.name ?? activeRoom.name) : "";
  const activeSubtitle = activeRoom?.isPublic ? activeRoom.description : "Direct conversation";

  if (authLoading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="w-full max-w-3xl animate-pulse space-y-4"><div className="h-8 w-48 rounded bg-muted" /><div className="h-[420px] rounded-2xl bg-muted" /></div></div>;

  if (!user) return (
    <section className="mx-auto mt-8 max-w-2xl rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm md:mt-16 md:p-14">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/.1)] text-primary"><MessagesSquare className="h-6 w-6" /></div>
      <p className="font-mono text-[10px] uppercase tracking-[.24em] text-muted-foreground">InterviewIQ / Community</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Better answers start together.</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">Join fellow candidates to trade perspective, find a practice partner, and make the next interview feel less like a solo act.</p>
      <Button asChild className="mt-7 rounded-xl"><Link href="/login">Sign in to join the conversation</Link></Button>
    </section>
  );

  return (
    <div className="community-page rise -mx-5 -my-8 flex min-h-[calc(100dvh-64px)] flex-col md:-mx-10 md:-my-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 px-5 py-6 md:px-8 md:py-7">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">InterviewIQ / Peer room</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-[2.55rem]">Community <span className="text-primary">&</span> messages</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", socketOnline ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          {socketOnline ? "Live connection" : "Connecting"}
          <Button onClick={() => setSearchOpen(true)} size="sm" className="ml-2 rounded-xl"><Users className="h-4 w-4" /> Find a student</Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 p-3 md:p-6">
        <div className="flex min-h-[72vh] w-full overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-[0_18px_60px_-40px_hsl(var(--foreground)/.28)] md:min-h-[660px]">
          <aside className={cn("w-full shrink-0 flex-col border-r border-border bg-[hsl(var(--muted)/.45)] md:flex md:w-[300px] xl:w-[326px]", mobileChat && "hidden md:flex")}>
            <div className="border-b border-border p-4">
              <div className="flex rounded-xl border border-border bg-background p-1">
                <button onClick={() => setTab("channels")} className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors", tab === "channels" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><MessagesSquare className="h-3.5 w-3.5" /> Community Channels</button>
                <button onClick={() => setTab("direct")} className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors", tab === "direct" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><MessageCircle className="h-3.5 w-3.5" /> Direct Messages</button>
              </div>
              <div className="mt-4 flex items-center justify-between px-1">
                <span className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">{tab === "channels" ? "Open rooms" : "Conversations"}</span>
                {tab === "direct" && <button onClick={() => setSearchOpen(true)} aria-label="Start a direct message" className="rounded-lg p-1.5 text-primary hover:bg-primary/10"><MessageCircle className="h-4 w-4" /></button>}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {roomsQuery.isLoading && <div className="space-y-2 p-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[68px] animate-pulse rounded-xl bg-muted" />)}</div>}
              {roomsQuery.isError && <div className="m-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><p className="font-medium">Couldn’t load conversations.</p><button onClick={() => void roomsQuery.refetch()} className="mt-2 text-primary underline underline-offset-4">Try again</button></div>}
              {tab === "direct" && <div className="mb-4 space-y-4 px-1">
                {friendsQuery.isLoading && <div className="space-y-2 px-2"><div className="h-3 w-24 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded-xl bg-muted" /></div>}
                {friendsQuery.isError && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs"><p className="font-semibold">Friend list unavailable.</p><button onClick={() => void friendsQuery.refetch()} className="mt-1.5 font-medium text-primary underline underline-offset-4">Retry</button></div>}
                {!friendsQuery.isLoading && !friendsQuery.isError && <>
                  {incomingRequests.length > 0 && <section aria-label="Incoming friend requests" className="space-y-1.5">
                    <div className="flex items-center justify-between px-2"><span className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Incoming requests</span><span className="rounded-full bg-accent/30 px-2 py-0.5 font-mono text-[9px]">{incomingRequests.length}</span></div>
                    {acceptFriend.isSuccess && <p role="status" className="px-2 text-[10px] text-primary">Request accepted. You’re connected.</p>}
                    {declineFriend.isSuccess && <p role="status" className="px-2 text-[10px] text-muted-foreground">Request declined.</p>}
                    {incomingRequests.map((request) => {
                      const accepting = acceptFriend.isPending && acceptFriend.variables === request.id;
                      const declining = declineFriend.isPending && declineFriend.variables === request.id;
                      const actionError = (acceptFriend.isError && acceptFriend.variables === request.id && acceptFriend.error)
                        || (declineFriend.isError && declineFriend.variables === request.id && declineFriend.error);
                      return <div key={request.id} className="rounded-xl border border-border/80 bg-background/70 p-2.5" data-testid={`friend-request-incoming-${request.id}`}>
                        <div className="flex items-center gap-2.5"><ChatAvatar name={request.name} compact /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{request.name}</span></div>
                        <div className="mt-2 flex gap-1.5">
                          <button onClick={() => acceptFriend.mutate(request.id)} disabled={acceptFriend.isPending || declineFriend.isPending} className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-60" data-testid={`button-accept-request-${request.id}`}>{accepting ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{accepting ? "Accepting" : "Accept"}</button>
                          <button onClick={() => declineFriend.mutate(request.id)} disabled={acceptFriend.isPending || declineFriend.isPending} className="min-h-8 rounded-lg border border-border px-2.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-60" data-testid={`button-decline-request-${request.id}`}>{declining ? "Declining…" : "Decline"}</button>
                        </div>
                        {actionError && <p role="alert" className="mt-1.5 text-[10px] text-destructive">{errMsg(actionError, "Could not update this request.")}</p>}
                      </div>;
                    })}
                  </section>}
                  {outgoingRequests.length > 0 && <section aria-label="Outgoing friend requests" className="space-y-1.5">
                    <span className="block px-2 font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Sent requests</span>
                    {outgoingRequests.map((request) => <div key={request.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2" data-testid={`friend-request-outgoing-${request.id}`}>
                      <ChatAvatar name={request.name} compact /><span className="min-w-0 flex-1 truncate text-xs font-medium">{request.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">Pending</span>
                    </div>)}
                  </section>}
                  <section aria-label="Friends" className="space-y-1.5">
                    <div className="flex items-center justify-between px-2"><span className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Friends</span><span className="font-mono text-[9px] text-muted-foreground">{friends.length}</span></div>
                    {friends.length === 0 ? <p className="px-2 py-1 text-[11px] leading-5 text-muted-foreground">Accepted connections will gather here. Find someone to practice with.</p> : friends.map((friend) => <div key={friend.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-background/75" data-testid={`friend-${friend.id}`}>
                      <ChatAvatar name={friend.name} compact /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{friend.name}</span><button onClick={() => openDirect(friend.id)} disabled={createDirect.isPending} aria-label={`Message ${friend.name}`} className="rounded-lg p-2 text-primary hover:bg-primary/10 disabled:opacity-50" data-testid={`button-message-friend-${friend.id}`}><MessageCircle className="h-4 w-4" /></button>
                    </div>)}
                  </section>
                </>}
              </div>}
              {!roomsQuery.isLoading && !roomsQuery.isError && visibleRooms.length === 0 && <div className="m-2 rounded-2xl border border-dashed border-border bg-background/70 px-4 py-8 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><MessageCircle className="h-4 w-4" /></div><p className="mt-3 text-sm font-semibold">{tab === "channels" ? "No rooms just yet" : "A fresh start"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{tab === "channels" ? "Community rooms will show up here." : "Find a student to start your first conversation."}</p>{tab === "direct" && <button onClick={() => setSearchOpen(true)} className="mt-3 text-xs font-semibold text-primary">Find a student</button>}</div>}
              {visibleRooms.map((room) => {
                const name = room.otherUser?.name ?? room.name;
                return <button key={room.id} onClick={() => selectRoom(room)} className={cn("group mb-1.5 flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors", activeRoomId === room.id ? "bg-background shadow-sm ring-1 ring-border" : "hover:bg-background/75")}>
                  <ChatAvatar name={name} compact />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{name}</span><span className="shrink-0 font-mono text-[9px] text-muted-foreground">{timeLabel(room.lastMessageAt)}</span></span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{room.lastMessage || room.description || (room.isMember ? "Start the conversation" : "Tap to join this room")}</span>
                  </span>
                  {!room.isMember && room.isPublic && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                </button>;
              })}
            </div>
            <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2" />A thoughtful space for candidates, by candidates.</div>
          </aside>
          <section className={cn("min-w-0 flex-1 flex-col", mobileChat ? "flex" : "hidden md:flex")}>
            {activeRoom ? <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 md:px-6">
                <button onClick={() => setMobileChat(false)} aria-label="Back to conversations" className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"><ArrowLeft className="h-4 w-4" /></button>
                <ChatAvatar name={activeTitle} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{activeTitle}</h2>
                  <p className="truncate text-xs text-muted-foreground">{activeSubtitle}</p>
                </div>
                {activeRoom.isPublic && <span className="hidden rounded-full bg-primary/10 px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-primary sm:inline-flex">{activeRoom.isMember ? "Member" : "Open room"}</span>}
                {activeRoom.isPublic && activeRoom.isMember && <Button onClick={leave} disabled={leaveRoom.isPending} variant="ghost" size="icon" aria-label="Leave channel" className="text-muted-foreground"><MoreHorizontal className="h-5 w-5" /></Button>}
              </div>
              <div ref={scrollArea} className="min-h-0 flex-1 overflow-y-auto bg-background/55 px-4 py-5 md:px-7">
                {!activeRoom.isMember ? <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-primary/10 text-primary"><Users className="h-7 w-7" /></div>
                  <h3 className="mt-5 font-display text-2xl">A room worth joining.</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{activeRoom.description || "Join this channel to meet other candidates and share what you’re learning."}</p>
                  <Button onClick={join} disabled={joinRoom.isPending} className="mt-5 rounded-xl">{joinRoom.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Join channel</Button>
                </div> : messagesQuery.isLoading ? <div className="space-y-5">{[0, 1, 2, 3].map((item) => <div key={item} className={cn("flex gap-3", item % 2 && "flex-row-reverse")}><div className="h-9 w-9 animate-pulse rounded-full bg-muted" /><div className="h-16 w-2/5 animate-pulse rounded-2xl bg-muted" /></div>)}</div>
                  : messagesQuery.isError ? <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center"><p className="font-semibold">Messages didn’t load.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try once more.</p><Button onClick={() => void messagesQuery.refetch()} variant="outline" className="mt-4">Retry history</Button></div>
                    : messages.length === 0 ? <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/25 text-primary"><MessageCircle className="h-6 w-6" /></div><p className="mt-4 font-display text-2xl">The first hello is yours.</p><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Share a question, a win, or the thing you wish someone had told you.</p></div>
                      : <div className="mx-auto flex max-w-3xl flex-col gap-5">{messages.map((message, index) => {
                        const mine = message.senderId === user.id;
                        const previous = messages[index - 1];
                        const showSender = !mine && previous?.senderId !== message.senderId;
                         const sticker = STICKERS.find((item) => item.label === message.text);
                        return <article key={message.id} className={cn("flex items-end gap-2.5", mine && "flex-row-reverse")}>
                          {!mine && (showSender ? <ChatAvatar name={message.senderName} compact /> : <span className="w-8 shrink-0" />)}
                          <div className={cn("max-w-[82%] md:max-w-[72%]", mine && "text-right")}>
                            {showSender && <div className="mb-1.5 ml-1 flex items-center gap-2 text-[11px]"><span className="font-semibold">{message.senderName}</span><span className="text-muted-foreground">{timeLabel(message.createdAt)}</span></div>}
                            <div className={cn("inline-block overflow-hidden rounded-2xl px-4 py-2.5 text-left text-sm leading-6", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card")}>
                              {message.imageUrl && <img src={message.imageUrl} alt="Shared attachment" className="mb-2 max-h-72 max-w-full rounded-lg object-contain" />}
                              {message.text && (sticker
                                ? <div role="img" aria-label={sticker.label} className={cn("flex min-h-20 min-w-36 items-center justify-center rounded-xl px-4 py-5 text-center font-mono text-xs font-bold tracking-[.18em]", sticker.tone)}>{sticker.art}</div>
                                : <p className="whitespace-pre-wrap break-words">{message.text}</p>)}
                            </div>
                            <div className={cn("mt-1 font-mono text-[9px] text-muted-foreground", mine && "mr-1")}>{!showSender && !mine ? timeLabel(message.createdAt) : mine ? timeLabel(message.createdAt) : ""}</div>
                          </div>
                        </article>;
                      })}<div ref={messageEnd} /></div>}
              </div>
              {activeRoom.isMember && <div className="border-t border-border bg-card px-3 py-3 md:px-6 md:py-4">
                {sendError && <div role="alert" className="mb-2 flex items-center justify-between rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive"><span>{sendError}</span><button onClick={() => setSendError("")} aria-label="Dismiss error"><X className="h-3.5 w-3.5" /></button></div>}
                {attachmentPreview && <div className="mb-3 inline-flex items-start gap-2 rounded-xl border border-border bg-background p-2"><img src={attachmentPreview} alt="Attachment preview" className="h-20 w-24 rounded-lg object-cover" /><div className="min-w-0 px-1"><p className="max-w-[180px] truncate text-xs font-medium">{attachment?.name}</p><p className="mt-1 text-[10px] text-muted-foreground">Preview before sending</p></div><button onClick={() => changeAttachment()} aria-label="Remove image" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>}
                <div className="relative flex items-end gap-1 rounded-2xl border border-border bg-background p-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
                  <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => changeAttachment(event.target.files?.[0])} />
                  <button onClick={() => fileInput.current?.click()} aria-label="Attach an image" className="mb-0.5 rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"><Paperclip className="h-4 w-4" /></button>
                  <div className="relative mb-0.5">
                    <button onClick={() => setPicker(picker === "emoji" ? null : "emoji")} aria-label="Choose emoji" className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"><Smile className="h-4 w-4" /></button>
                    {picker === "emoji" && <div className="absolute bottom-12 left-0 z-20 overflow-hidden rounded-xl border border-border shadow-xl"><EmojiPicker onEmojiClick={chooseEmoji} height={360} width={320} /></div>}
                    {picker === "sticker" && <div className="absolute bottom-12 left-0 z-20 grid w-[276px] grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 shadow-xl">{STICKERS.map((sticker) => <button key={sticker.label} onClick={() => addSticker(sticker)} className={cn("flex h-20 items-center justify-center rounded-xl px-2 text-center font-mono text-[10px] font-bold tracking-wider transition-transform hover:-translate-y-0.5", sticker.tone)}>{sticker.art}</button>)}</div>}
                  </div>
                   <button onClick={() => setPicker(picker === "sticker" ? null : "sticker")} aria-label="Choose a sticker" className="mb-0.5 rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"><ImagePlus className="h-4 w-4" /></button>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 4000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder="Write a thoughtful note…" rows={1} className="max-h-32 min-h-10 flex-1 resize-y bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground/75" />
                  <span className="hidden self-center pr-2 font-mono text-[9px] text-muted-foreground sm:block">{draft.length > 3800 ? `${4000 - draft.length}` : ""}</span>
                  <Button onClick={() => void handleSend()} disabled={(!draft.trim() && !attachment) || sendMessage.isPending || uploading} size="icon" aria-label="Send message" className="mb-0.5 h-10 w-10 shrink-0 rounded-xl">
                    {sendMessage.isPending || uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="mt-2 flex justify-between px-1 text-[10px] text-muted-foreground"><span>Enter to send · Shift + Enter for a new line</span><span className="font-mono">{draft.length}/4000</span></div>
              </div>}
            </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-accent/25 text-primary"><MessagesSquare className="h-7 w-7" /></div><h2 className="mt-5 font-display text-3xl">Make room for a better answer.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Pick a channel or start a one-to-one conversation with someone on the same path.</p><Button onClick={() => setSearchOpen(true)} variant="outline" className="mt-5 rounded-xl"><Search className="h-4 w-4" /> Find a student</Button></div>}
          </section>
        </div>
      </div>

      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setStudentSearch(""); }}>
        <DialogContent className="gap-0 overflow-hidden rounded-[1.4rem] p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="font-display text-2xl">Find your practice people</DialogTitle>
            <DialogDescription className="mt-1">Message any student, or send a request to keep your practice circle close.</DialogDescription>
          </DialogHeader>
          <div className="p-5">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value.slice(0, 80))} placeholder="Type at least 2 characters…" autoFocus className="h-11 rounded-xl pl-10" /></div>
            <div className="mt-4 max-h-[340px] space-y-1 overflow-y-auto">
              {studentSearch.trim().length < 2 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">A name needs at least two letters to get started.</p>}
              {studentsQuery.isFetching && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Finding students</div>}
              {studentsQuery.isError && <div className="py-6 text-center text-sm text-destructive"><p>Search didn’t work this time.</p><button onClick={() => void studentsQuery.refetch()} className="mt-2 underline underline-offset-4">Try again</button></div>}
              {!studentsQuery.isFetching && !studentsQuery.isError && studentSearch.trim().length >= 2 && studentsQuery.data?.students.length === 0 && <p className="px-3 py-7 text-center text-sm text-muted-foreground">No students found. Try a different name.</p>}
              {studentsQuery.data?.students.map((student) => {
                const isFriend = friends.some((friend) => friend.id === student.id);
                const isIncoming = incomingRequests.some((request) => request.userId === student.id);
                const isOutgoing = outgoingRequests.some((request) => request.userId === student.id);
                const sendingRequest = requestFriend.isPending && requestFriend.variables?.userId === student.id;
                const requestError = requestFriend.isError && requestFriend.variables?.userId === student.id;
                const requestSuccess = requestFriend.isSuccess && requestFriend.variables?.userId === student.id;
                const requestStatus = requestFriend.data?.status;
                return <div key={student.id} className="rounded-xl p-3 transition-colors hover:bg-muted" data-testid={`search-student-${student.id}`}>
                  <div className="flex items-center gap-3">
                    <ChatAvatar name={student.name} compact />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{student.name}</span>
                    <button onClick={() => openDirect(student.id)} disabled={createDirect.isPending} className="rounded-lg border border-border px-2.5 py-2 text-[10px] font-semibold text-primary hover:bg-background disabled:opacity-60" data-testid={`button-message-student-${student.id}`}>{createDirect.isPending ? "Opening…" : "Message"}</button>
                    {isFriend ? <span className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-2 text-[10px] font-semibold text-primary"><Check className="h-3 w-3" /> Friend</span>
                      : isIncoming ? <span className="rounded-lg bg-accent/25 px-2.5 py-2 text-[10px] font-medium text-foreground">Request received</span>
                        : isOutgoing || (requestSuccess && requestStatus === "pending") ? <span role="status" className="rounded-lg bg-muted px-2.5 py-2 text-[10px] font-medium text-muted-foreground">{sendingRequest ? "Sending…" : "Request sent"}</span>
                          : requestSuccess && requestStatus === "incoming" ? <span role="status" className="rounded-lg bg-accent/25 px-2.5 py-2 text-[10px] font-medium">They requested you</span>
                            : <button onClick={() => requestFriend.mutate({ userId: student.id })} disabled={sendingRequest} className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-2 text-[10px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60" data-testid={`button-add-friend-${student.id}`}>{sendingRequest ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}{sendingRequest ? "Sending" : "Add friend"}</button>}
                  </div>
                  {requestError && <p role="alert" className="mt-2 pl-11 text-[10px] text-destructive">{errMsg(requestFriend.error, "Could not send the friend request.")}</p>}
                  {requestSuccess && requestStatus === "friends" && <p role="status" className="mt-2 pl-11 text-[10px] text-primary">You’re now friends.</p>}
                </div>;
              })}
            </div>
            {createDirect.isError && <p role="alert" className="mt-2 text-xs text-destructive">{errMsg(createDirect.error, "Could not start this conversation.")}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
