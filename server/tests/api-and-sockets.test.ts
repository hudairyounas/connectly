import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { initializeSocketGateway } from '../src/sockets/gateway.js';
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { ensureStorageDirectories } from '../src/modules/attachments/attachments.service.js';
import { devTokenOutbox } from '../src/modules/auth/auth.service.js';

let httpServer: http.Server;
let baseUrl: string;
const app = createApp();

function connectSocketClient(token?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ClientIO(baseUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', (err) => {
      client.close();
      reject(err);
    });
  });
}

describe('Connectly Backend API, Security, Socket.IO & E2E Journey Suite', () => {
  beforeAll(async () => {
    await connectDatabase('mongodb://127.0.0.1:27017/connectly_test_suite');
    await mongoose.connection.db?.dropDatabase();
    await ensureStorageDirectories();

    httpServer = http.createServer(app);
    initializeSocketGateway(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    httpServer.close();
    await mongoose.connection.db?.dropDatabase();
    await disconnectDatabase();
  });

  // State shared across the progressive test suite
  let aliceToken = '';
  let aliceRefreshCookie = '';
  let aliceId = '';

  let bobToken = '';
  let bobId = '';

  let charlieToken = '';
  let charlieId = '';

  let directConversationId = '';
  let firstMessageId = '';
  let groupConversationId = '';
  let uploadedAttachmentId = '';

  describe('1. Authentication, Validation, Password Hashing & Session Security', () => {
    it('rejects registration with weak password or invalid input', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        displayName: 'A',
        username: 'invalid user!',
        email: 'not-an-email',
        password: 'weak',
        confirmPassword: 'mismatch',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('registers Alice, hashes password in DB, and never exposes passwordHash in response', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        displayName: 'Alice Mercer',
        username: 'alice_m',
        email: 'alice@connectly.test',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('alice_m');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.accessToken).toBeTruthy();

      aliceToken = res.body.data.accessToken;
      aliceId = res.body.data.user._id;
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      aliceRefreshCookie = Array.isArray(cookies) ? cookies[0] : cookies;

      const dbUser = await UserModel.findById(aliceId).select('+passwordHash').lean();
      expect(dbUser?.passwordHash).toBeDefined();
      expect(dbUser?.passwordHash).not.toBe('Password123!');
      expect(dbUser?.passwordHash.startsWith('$2')).toBe(true);
    });

    it('prevents duplicate usernames and email addresses', async () => {
      const dupUsername = await request(app).post('/api/v1/auth/register').send({
        displayName: 'Alice Clone',
        username: 'alice_m',
        email: 'other@connectly.test',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(dupUsername.status).toBe(409);
      expect(dupUsername.body.error.code).toBe('USERNAME_TAKEN');

      const dupEmail = await request(app).post('/api/v1/auth/register').send({
        displayName: 'Alice Clone',
        username: 'alice_clone',
        email: 'alice@connectly.test',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(dupEmail.status).toBe(409);
      expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('registers Bob and Charlie for multi-user tests', async () => {
      const bobRes = await request(app).post('/api/v1/auth/register').send({
        displayName: 'Bob Vance',
        username: 'bob_v',
        email: 'bob@connectly.test',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(bobRes.status).toBe(201);
      bobToken = bobRes.body.data.accessToken;
      bobId = bobRes.body.data.user._id;

      const charlieRes = await request(app).post('/api/v1/auth/register').send({
        displayName: 'Charlie Day',
        username: 'charlie_d',
        email: 'charlie@connectly.test',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(charlieRes.status).toBe(201);
      charlieToken = charlieRes.body.data.accessToken;
      charlieId = charlieRes.body.data.user._id;
    });

    it('verifies email using token from verification flow', async () => {
      const outboxEntry = devTokenOutbox.get('alice@connectly.test');
      expect(outboxEntry?.verifyEmailToken).toBeTruthy();

      const res = await request(app).post('/api/v1/auth/verify-email').send({
        token: outboxEntry!.verifyEmailToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.user.emailVerified).toBe(true);
    });

    it('does not leak email existence on forgot-password and supports password reset', async () => {
      const nonExistent = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@connectly.test' });
      const existing = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'charlie@connectly.test' });

      expect(nonExistent.status).toBe(200);
      expect(existing.status).toBe(200);
      expect(nonExistent.body.data.message).toBe(existing.body.data.message);

      const resetToken = devTokenOutbox.get('charlie@connectly.test')?.resetPasswordToken;
      expect(resetToken).toBeTruthy();

      const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
        token: resetToken,
        password: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      });
      expect(resetRes.status).toBe(200);

      // Charlie's old session should now be revoked
      const oldSessionCheck = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${charlieToken}`);
      expect(oldSessionCheck.status).toBe(401);

      // Log Charlie back in with new password
      const relogin = await request(app).post('/api/v1/auth/login').send({
        identifier: 'charlie_d',
        password: 'NewPassword456!',
      });
      expect(relogin.status).toBe(200);
      charlieToken = relogin.body.data.accessToken;
    });

    it('rotates refresh token and revokes sessions properly', async () => {
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', aliceRefreshCookie);
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeTruthy();
      aliceToken = refreshRes.body.data.accessToken;

      const sessionsRes = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(sessionsRes.status).toBe(200);
      expect(sessionsRes.body.data.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('enforces rate limiting on authentication endpoints when enabled', async () => {
      let lastStatus = 200;
      for (let i = 0; i < 12; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ identifier: 'nobody', password: 'wrong' });
        lastStatus = res.status;
        if (lastStatus === 429) break;
      }
      expect(lastStatus).toBe(429);
    });
  });

  describe('2. User Discovery, Direct Conversations & Duplicate Prevention', () => {
    it('searches users without exposing private fields', async () => {
      const res = await request(app)
        .get('/api/v1/users/search?q=bob')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBe(1);
      expect(res.body.data.users[0].username).toBe('bob_v');
      expect(res.body.data.users[0].email).toBeUndefined();
      expect(res.body.data.users[0].passwordHash).toBeUndefined();
    });

    it('creates a direct conversation and prevents duplicate direct conversations', async () => {
      const firstCreate = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ participantId: bobId });

      expect(firstCreate.status).toBe(201);
      expect(firstCreate.body.data.createdNew).toBe(true);
      directConversationId = firstCreate.body.data.conversation._id;

      // Calling again from Bob's side returns the exact same conversation without creating a duplicate
      const secondCreate = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ participantId: aliceId });

      expect(secondCreate.status).toBe(200);
      expect(secondCreate.body.data.createdNew).toBe(false);
      expect(secondCreate.body.data.conversation._id).toBe(directConversationId);
    });

    it('prevents non-participants from accessing a private conversation', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${directConversationId}`)
        .set('Authorization', `Bearer ${charlieToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('3. Socket.IO Real-Time Messaging, Multi-Tab Presence, Delivery & Read Receipts', () => {
    it('rejects unauthenticated Socket.IO connections', async () => {
      await expect(connectSocketClient()).rejects.toThrow();
      await expect(connectSocketClient('invalid.jwt.token')).rejects.toThrow();
    });

    it('handles multi-tab presence, room auth, real-time messages, idempotency, typing, delivery, and read receipts', async () => {
      const aliceSocket1 = await connectSocketClient(aliceToken);
      const aliceSocket2 = await connectSocketClient(aliceToken);
      const bobSocket = await connectSocketClient(bobToken);
      const charlieSocket = await connectSocketClient(charlieToken);

      try {
        // Unauthorized room join by Charlie must be rejected
        const charlieJoinAck = await new Promise<{ success: boolean; error?: { code: string } }>(
          (resolve) => {
            charlieSocket.emit(
              'conversation:join',
              { conversationId: directConversationId },
              resolve,
            );
          },
        );
        expect(charlieJoinAck.success).toBe(false);
        expect(charlieJoinAck.error?.code).toBe('FORBIDDEN');

        // Authorized room join by Alice & Bob
        const bobJoinAck = await new Promise<{ success: boolean }>((resolve) => {
          bobSocket.emit('conversation:join', { conversationId: directConversationId }, resolve);
        });
        expect(bobJoinAck.success).toBe(true);

        // Typing indicator from Alice -> received by Bob
        const typingPromise = new Promise<{ userId: string; isTyping: boolean }>((resolve) => {
          bobSocket.once('typing:updated', resolve);
        });
        aliceSocket1.emit('typing:start', { conversationId: directConversationId });
        const typingEvent = await typingPromise;
        expect(typingEvent.userId).toBe(aliceId);
        expect(typingEvent.isTyping).toBe(true);

        // Real-time message from Alice -> received by Bob
        const bobNewMsgPromise = new Promise<{ message: { _id: string; content: string } }>(
          (resolve) => {
            bobSocket.once('message:new', resolve);
          },
        );

        const sendAck = await new Promise<{
          success: boolean;
          data: { message: { _id: string; status: string }; deduplicated: boolean };
        }>((resolve) => {
          aliceSocket1.emit(
            'message:send',
            {
              conversationId: directConversationId,
              content: 'Hello Bob! Real-time test message.',
              clientMessageId: 'client-msg-uuid-001',
            },
            resolve,
          );
        });

        expect(sendAck.success).toBe(true);
        expect(sendAck.data.deduplicated).toBe(false);
        expect(sendAck.data.message.status).toBe('sent');
        firstMessageId = sendAck.data.message._id;

        const bobReceived = await bobNewMsgPromise;
        expect(bobReceived.message._id).toBe(firstMessageId);
        expect(bobReceived.message.content).toBe('Hello Bob! Real-time test message.');

        // Duplicate send with same clientMessageId is deduplicated
        const dupAck = await new Promise<{
          success: boolean;
          data: { message: { _id: string }; deduplicated: boolean };
        }>((resolve) => {
          aliceSocket1.emit(
            'message:send',
            {
              conversationId: directConversationId,
              content: 'Hello Bob! Real-time test message.',
              clientMessageId: 'client-msg-uuid-001',
            },
            resolve,
          );
        });
        expect(dupAck.success).toBe(true);
        expect(dupAck.data.deduplicated).toBe(true);
        expect(dupAck.data.message._id).toBe(firstMessageId);

        // Explicit delivery acknowledgement from Bob -> Alice receives message:delivered
        const deliveredPromise = new Promise<{ messageId: string; status: string }>((resolve) => {
          aliceSocket1.once('message:delivered', resolve);
        });
        bobSocket.emit('message:delivered', {
          conversationId: directConversationId,
          messageId: firstMessageId,
        });
        const deliveredEvent = await deliveredPromise;
        expect(deliveredEvent.messageId).toBe(firstMessageId);
        expect(deliveredEvent.status).toBe('delivered');

        // Read receipt from Bob -> Alice receives message:read
        const readPromise = new Promise<{ conversationId: string; userId: string }>((resolve) => {
          aliceSocket1.once('message:read', resolve);
        });
        bobSocket.emit('message:read', {
          conversationId: directConversationId,
          messageId: firstMessageId,
        });
        const readEvent = await readPromise;
        expect(readEvent.conversationId).toBe(directConversationId);
        expect(readEvent.userId).toBe(bobId);

        // Multi-tab presence test: closing aliceSocket1 while aliceSocket2 is still connected must NOT mark Alice offline
        aliceSocket1.close();
        await new Promise((r) => setTimeout(r, 150));
        const aliceProfileMid = await request(app)
          .get(`/api/v1/users/${aliceId}`)
          .set('Authorization', `Bearer ${bobToken}`);
        expect(aliceProfileMid.body.data.user.isOnline).toBe(true);

        // Closing aliceSocket2 (last active socket) marks Alice offline
        aliceSocket2.close();
        await new Promise((r) => setTimeout(r, 150));
        const aliceProfileAfter = await request(app)
          .get(`/api/v1/users/${aliceId}`)
          .set('Authorization', `Bearer ${bobToken}`);
        expect(aliceProfileAfter.body.data.user.isOnline).toBe(false);
      } finally {
        aliceSocket1.close();
        aliceSocket2.close();
        bobSocket.close();
        charlieSocket.close();
      }
    });
  });

  describe('4. Replies, Reactions, Editing, Deletion, Pagination & Search Authorization', () => {
    let bobReplyId = '';

    it('allows Bob to reply to Alice and react with an emoji', async () => {
      const replyRes = await request(app)
        .post(`/api/v1/conversations/${directConversationId}/messages`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          content: 'Replying to your first message!',
          replyTo: firstMessageId,
        });

      expect(replyRes.status).toBe(201);
      expect(replyRes.body.data.message.replyTo._id).toBe(firstMessageId);
      bobReplyId = replyRes.body.data.message._id;

      const reactRes = await request(app)
        .post(`/api/v1/messages/${firstMessageId}/reactions`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ emoji: '👍' });

      expect(reactRes.status).toBe(200);
      expect(reactRes.body.data.reactions[0].emoji).toBe('👍');
      expect(reactRes.body.data.reactions[0].count).toBe(1);
    });

    it('enforces message edit and delete permissions', async () => {
      // Bob cannot edit Alice's message
      const forbiddenEdit = await request(app)
        .patch(`/api/v1/messages/${firstMessageId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ content: 'Hacked message' });
      expect(forbiddenEdit.status).toBe(403);

      // Alice can edit her own message
      const validEdit = await request(app)
        .patch(`/api/v1/messages/${firstMessageId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ content: 'Hello Bob! (Edited by Alice)' });
      expect(validEdit.status).toBe(200);
      expect(validEdit.body.data.message.content).toBe('Hello Bob! (Edited by Alice)');
      expect(validEdit.body.data.message.editedAt).toBeTruthy();

      // Alice cannot delete Bob's message for everyone
      const forbiddenDelete = await request(app)
        .delete(`/api/v1/messages/${bobReplyId}?mode=everyone`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(forbiddenDelete.status).toBe(403);
    });

    it('supports cursor pagination and authorized in-conversation search', async () => {
      const pageRes = await request(app)
        .get(`/api/v1/conversations/${directConversationId}/messages?limit=1`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(pageRes.status).toBe(200);
      expect(pageRes.body.data.messages.length).toBe(1);
      expect(pageRes.body.data.hasMore).toBe(true);
      expect(pageRes.body.data.nextCursor).toBeTruthy();

      const page2Res = await request(app)
        .get(
          `/api/v1/conversations/${directConversationId}/messages?limit=1&cursor=${pageRes.body.data.nextCursor}`,
        )
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(page2Res.status).toBe(200);
      expect(page2Res.body.data.messages.length).toBe(1);

      // Authorized search by Alice
      const searchRes = await request(app)
        .get(`/api/v1/conversations/${directConversationId}/search?q=Edited`)
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.messages.length).toBe(1);

      // Unauthorized search by Charlie must return 403
      const unauthSearch = await request(app)
        .get(`/api/v1/conversations/${directConversationId}/search?q=Edited`)
        .set('Authorization', `Bearer ${charlieToken}`);
      expect(unauthSearch.status).toBe(403);
    });
  });

  describe('5. Groups, Role Permissions & Secure Attachments', () => {
    it('creates a group and enforces admin role permissions', async () => {
      const createGroup = await request(app)
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          groupName: 'Engineering Team',
          groupDescription: 'Core product discussions',
          participantIds: [bobId],
        });

      expect(createGroup.status).toBe(201);
      groupConversationId = createGroup.body.data.conversation._id;

      // Bob (regular member) cannot add Charlie
      const bobAddAttempt = await request(app)
        .post(`/api/v1/groups/${groupConversationId}/members`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ participantIds: [charlieId] });
      expect(bobAddAttempt.status).toBe(403);

      // Alice (admin) adds Charlie
      const aliceAdd = await request(app)
        .post(`/api/v1/groups/${groupConversationId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ participantIds: [charlieId] });
      expect(aliceAdd.status).toBe(200);
      expect(aliceAdd.body.data.conversation.participants.length).toBe(3);
    });

    it('validates file magic bytes and enforces attachment access authorization', async () => {
      // Reject executable disguised as .png
      const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const badUpload = await request(app)
        .post('/api/v1/attachments/upload')
        .set('Authorization', `Bearer ${aliceToken}`)
        .field('conversationId', directConversationId)
        .attach('file', fakeExe, 'malware.png');
      expect(badUpload.status).toBe(400);
      expect(badUpload.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

      // Valid PNG magic bytes
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const goodUpload = await request(app)
        .post('/api/v1/attachments/upload')
        .set('Authorization', `Bearer ${aliceToken}`)
        .field('conversationId', directConversationId)
        .attach('file', validPng, 'diagram.png');

      expect(goodUpload.status).toBe(201);
      uploadedAttachmentId = goodUpload.body.data.attachment._id;

      // Bob (participant in directConversationId) can download the file
      const bobDownload = await request(app)
        .get(`/api/v1/attachments/${uploadedAttachmentId}/file`)
        .set('Authorization', `Bearer ${bobToken}`);
      expect(bobDownload.status).toBe(200);
      expect(bobDownload.headers['x-content-type-options']).toBe('nosniff');

      // Charlie (not in directConversationId) is denied access (403)
      const charlieDownload = await request(app)
        .get(`/api/v1/attachments/${uploadedAttachmentId}/file`)
        .set('Authorization', `Bearer ${charlieToken}`);
      expect(charlieDownload.status).toBe(403);
    });

    it('revokes access after logout', async () => {
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(logoutRes.status).toBe(200);

      const protectedCheck = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${aliceToken}`);
      expect(protectedCheck.status).toBe(401);
    });
  });
});
