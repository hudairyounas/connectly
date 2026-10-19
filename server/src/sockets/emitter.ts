import { Server as SocketIOServer } from 'socket.io';

class SocketManager {
  private io: SocketIOServer | null = null;
  // Map of userId -> Set of active socketIds (handles multiple browser tabs / devices)
  private userSockets = new Map<string, Set<string>>();
  // Map of socketId -> currently open conversationId
  private socketActiveConversation = new Map<string, string>();

  setServer(io: SocketIOServer): void {
    this.io = io;
  }

  getServer(): SocketIOServer | null {
    return this.io;
  }

  registerConnection(userId: string, socketId: string): boolean {
    let sockets = this.userSockets.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    return wasOffline;
  }

  unregisterConnection(userId: string, socketId: string): boolean {
    this.socketActiveConversation.delete(socketId);
    const sockets = this.userSockets.get(userId);
    if (!sockets) return true;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      return true; // user is now completely offline
    }
    return false; // user still has other tabs/sessions open
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  getUserSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size ?? 0;
  }

  setActiveConversation(socketId: string, conversationId: string | null): void {
    if (conversationId) {
      this.socketActiveConversation.set(socketId, conversationId);
    } else {
      this.socketActiveConversation.delete(socketId);
    }
  }

  isUserViewingConversation(userId: string, conversationId: string): boolean {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;
    for (const sid of sockets) {
      if (this.socketActiveConversation.get(sid) === conversationId) {
        return true;
      }
    }
    return false;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`conversation:${conversationId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    if (!this.io) return;
    const unique = Array.from(new Set(userIds.map(String)));
    for (const uid of unique) {
      this.io.to(`user:${uid}`).emit(event, payload);
    }
  }
}

export const socketManager = new SocketManager();
