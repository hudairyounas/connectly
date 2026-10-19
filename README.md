# Connectly — Full-Stack Real-Time Messaging Platform

Connectly is a modern, full-stack, real-time messaging platform built with **React, TypeScript, Tailwind CSS, Node.js, Express, MongoDB, and Socket.IO**. It delivers secure session-based authentication, instant 1-on-1 and group messaging, explicit delivery and read receipts, multi-tab online presence, binary-verified file and image attachments, and granular privacy controls.

---

## 1. Key Features

- **Authentication & Session Security:**
  - Registration and login with client + server Zod validation and password-strength feedback.
  - `bcryptjs` password hashing (`select: false`, stripped from all JSON responses).
  - Short-lived JWT access tokens paired with rotating `HttpOnly` refresh session tokens stored in MongoDB (`Session` collection).
  - Active session inspection and individual or global session revocation.
  - Email verification and password recovery using SHA-256 hashed, expiring tokens (with a built-in Development Mode Outbox when SMTP is not configured).
  - Rate limiting on authentication and API endpoints.
- **Real-Time 1-on-1 & Group Messaging (Socket.IO):**
  - Deterministic `directPairKey` index preventing duplicate direct conversations.
  - Idempotent message sending (`clientMessageId`) with optimistic UI updates and failed-message retry recovery.
  - Cursor-based message pagination (`limit` + `cursor`).
  - Explicit recipient-acknowledged delivery status (`Sending` → `Sent` → `Delivered` → `Read`).
  - Throttled typing indicators with automatic 5-second server-side expiry.
  - Multi-tab and multi-device online presence tracking (a user is only marked offline when their last active socket disconnects).
- **Rich Message Experience:**
  - Replies with original message preview and click-to-jump navigation.
  - Curated emoji reactions (`👍`, `❤️`, `😂`, `😮`, `😢`, `🎉`, `🔥`, `🙏`) with live counters.
  - Message editing with `(edited)` indicator and deletion (`Delete for me` vs `Delete for everyone`).
  - Authorized in-conversation message search.
- **Groups & Role Permissions:**
  - Group creation with name, description, avatar, and initial members.
  - Server-enforced administrator permissions for updating group metadata, adding/removing members, and promoting/demoting administrators.
  - Automated system messages for group membership and role changes.
- **Secure Attachments & Media:**
  - Binary magic-byte inspection (`PNG`, `JPEG`, `WebP`, `GIF`, `PDF`, `TXT`, `MD`, `CSV`, `JSON`) rejecting disguised executables.
  - Stored outside the public web root (`uploads_storage/`) with UUID storage names.
  - Authorized streaming endpoint (`GET /api/v1/attachments/:attachmentId/file`) verifying conversation membership and setting `X-Content-Type-Options: nosniff`.
- **Product Experience & Accessibility:**
  - Refined light and dark themes (`#F7F8FC` / `#0B0F19` surfaces, `#6C63FF` primary accent) plus reduced-motion support.
  - Pin, mute, and archive conversation controls.
  - Responsive mobile layout (conversation list first, full-screen chat view with back navigation).

---

## 2. Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, React Router v7, Tailwind CSS, TanStack Query v5, Zustand, React Hook Form, Zod, Socket.IO Client, Lucide React, `date-fns` |
| **Backend** | Node.js, Express, TypeScript, MongoDB, Mongoose, Socket.IO, Zod, `bcryptjs`, `jsonwebtoken`, Helmet, `express-rate-limit`, Multer |
| **Testing** | Vitest, Supertest, `socket.io-client`, React Testing Library, JSDOM |

---

## 3. Prerequisites & Installation

### Prerequisites
- **Node.js:** v20+ (tested on Node v24.14.0)
- **MongoDB:** Local or remote MongoDB instance v7+ running on `127.0.0.1:27017` (Docker is not required or used).

### Installation
```bash
# Install backend and frontend dependencies
npm --prefix server install
npm --prefix client install
```

---

## 4. Environment Configuration

Copy `.env.example` to `.env` in both `server/` and `client/`:

### `server/.env.example`
```env
NODE_ENV=development
PORT=5000
APP_NAME=Connectly
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/connectly
ACCESS_TOKEN_SECRET=replace_with_32_byte_cryptographic_random_secret_access
REFRESH_TOKEN_SECRET=replace_with_32_byte_cryptographic_random_secret_refresh
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
COOKIE_DOMAIN=
STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=../uploads_storage
STORAGE_BUCKET=
STORAGE_REGION=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
MAX_MESSAGE_LENGTH=4000
MAX_FILE_SIZE_BYTES=10485760
MAX_GROUP_MEMBERS=100
DEFAULT_PAGE_SIZE=30
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@connectly.local
```

### `client/.env.example`
```env
VITE_APP_NAME=Connectly
VITE_API_BASE_URL=/api/v1
VITE_SOCKET_URL=
```

---

## 5. Development, Testing & Build Commands

From the repository root (`f:\argon_chat`):

```bash
# Start backend development server (port 5000)
npm run dev:server

# Start frontend Vite dev server (port 5173, proxies /api and /socket.io to 5000)
npm run dev:client

# Run TypeScript type checks across server and client
npm run typecheck

# Run backend API, security, Socket.IO & E2E tests
npm run test:server

# Run frontend component & interaction tests
npm run test:client

# Run all test suites
npm test

# Production build (server + client)
npm run build
```

---

## 6. REST API Overview (`/api/v1`)

| Module | Endpoint | Description |
|---|---|---|
| **Health** | `GET /api/v1/health` | Service & database health check |
| **Auth** | `POST /api/v1/auth/register` | Register a new user account |
| | `POST /api/v1/auth/login` | Authenticate with username/email & password |
| | `POST /api/v1/auth/refresh` | Rotate refresh session & issue new access token |
| | `POST /api/v1/auth/logout` | Revoke current session |
| | `POST /api/v1/auth/logout-all` | Revoke all active sessions for current user |
| | `GET /api/v1/auth/sessions` | List active sessions |
| | `DELETE /api/v1/auth/sessions/:sessionId` | Revoke a specific session |
| | `POST /api/v1/auth/forgot-password` | Generate password recovery token |
| | `POST /api/v1/auth/reset-password` | Reset password using token & revoke sessions |
| | `POST /api/v1/auth/verify-email` | Verify email address with token |
| **Users** | `GET /api/v1/users/me` | Get authenticated user's profile & settings |
| | `PATCH /api/v1/users/me` | Update display name, username, bio, status, avatar |
| | `POST /api/v1/users/me/change-password` | Change password |
| | `DELETE /api/v1/users/me` | Delete account & revoke all sessions |
| | `GET /api/v1/users/search?q=` | Search users safely |
| | `GET /api/v1/users/:userId` | View public user profile |
| | `POST /api/v1/users/:userId/block` | Block a user |
| | `DELETE /api/v1/users/:userId/block` | Unblock a user |
| **Conversations** | `GET /api/v1/conversations` | List user's conversations (pinned first, then recent) |
| | `POST /api/v1/conversations` | Get or create a 1-on-1 direct conversation |
| | `GET /api/v1/conversations/:conversationId` | Get authorized conversation details |
| | `PATCH /api/v1/conversations/:conversationId` | Update pin, mute, or archive state |
| | `GET /api/v1/conversations/:conversationId/messages` | Paginated message history (`cursor`, `limit`) |
| | `POST /api/v1/conversations/:conversationId/messages` | Send a message |
| | `POST /api/v1/conversations/:conversationId/read` | Mark conversation messages as read |
| | `GET /api/v1/conversations/:conversationId/search?q=` | Authorized in-conversation message search |
| **Messages** | `PATCH /api/v1/messages/:messageId` | Edit own message |
| | `DELETE /api/v1/messages/:messageId?mode=self\|everyone` | Delete message |
| | `POST /api/v1/messages/:messageId/reactions` | Toggle emoji reaction |
| | `DELETE /api/v1/messages/:messageId/reactions/:reaction` | Remove emoji reaction |
| **Groups** | `POST /api/v1/groups` | Create a group conversation |
| | `PATCH /api/v1/groups/:groupId` | Update group name, description, avatar (Admin) |
| | `GET /api/v1/groups/:groupId/members` | List group members |
| | `POST /api/v1/groups/:groupId/members` | Add participants (Admin) |
| | `DELETE /api/v1/groups/:groupId/members/:userId` | Remove participant (Admin) |
| | `POST /api/v1/groups/:groupId/leave` | Leave group |
| | `PATCH /api/v1/groups/:groupId/members/:userId/role` | Promote/demote group admin (Admin) |
| **Attachments** | `POST /api/v1/attachments/upload` | Upload chat attachment with magic-byte verification |
| | `GET /api/v1/attachments/:attachmentId/file` | Stream attachment after verifying conversation membership |
| **Settings & Notifications** | `GET /api/v1/settings`, `PATCH /api/v1/settings` | Get/update appearance, notification, and privacy settings |
| | `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read` | List and mark notifications read |

---

## 7. Socket.IO Event Contract

### Client-to-Server Events
- `conversation:join` (`{ conversationId }`) — Verifies membership and joins `conversation:<id>`.
- `conversation:leave` (`{ conversationId }`) — Leaves room and clears typing state.
- `message:send` (`{ conversationId, content, clientMessageId, replyTo?, attachmentIds? }`) — Persists message and broadcasts `message:new`.
- `message:delivered` (`{ conversationId, messageId }`) — Explicit recipient delivery confirmation.
- `message:read` (`{ conversationId, messageId? }`) — Marks messages read and emits `message:read`.
- `message:edit` (`{ messageId, content }`) — Edits sender's message.
- `message:delete` (`{ messageId, mode }`) — Deletes message for `self` or `everyone`.
- `reaction:add` / `reaction:remove` (`{ messageId, emoji }`) — Adds or removes reaction.
- `typing:start` / `typing:stop` (`{ conversationId }`) — Broadcasts typing state to conversation participants.

### Server-to-Client Events
- `conversation:joined`, `conversation:updated`, `conversation:removed`
- `message:new`, `message:updated`, `message:deleted`, `message:delivered`, `message:read`
- `typing:updated`, `presence:updated`, `reaction:updated`, `notification:new`, `error:occurred`

---

## 8. Production Deployment & Scaling Notes

1. **HTTPS & Secure Cookies:** Set `NODE_ENV=production` and serve behind TLS/HTTPS so `refreshToken` cookies are transmitted with the `Secure` attribute enabled.
2. **CORS Configuration:** Set `CLIENT_ORIGIN` to the exact production frontend origin(s).
3. **Multi-Instance Socket.IO Scaling:** When horizontally scaling the Node.js server across multiple processes or nodes, attach `@socket.io/redis-adapter` in `server/src/sockets/gateway.ts` so room broadcasts and presence events coordinate across instances.
4. **Object Storage:** For multi-node deployments, configure S3-compatible object storage (`STORAGE_PROVIDER=s3` with `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`). In single-node or local deployments, `STORAGE_PROVIDER=local` stores files outside the web root in `uploads_storage/`.
5. **Email Provider (SMTP):** When `SMTP_HOST` is unconfigured in development, Connectly exposes a clearly labeled Development Mode Outbox on the Forgot Password and Verify Email screens instead of pretending emails were sent.

---

## 9. Troubleshooting

- **MongoDB Connection Refused:** Verify MongoDB is running locally on `127.0.0.1:27017` (`Test-NetConnection -ComputerName 127.0.0.1 -Port 27017`).
- **401 Unauthorized on Socket Connection:** Ensure your session has not been revoked and that the client clock is synchronized.
- **File Upload Rejected:** Connectly inspects actual binary file signatures (magic bytes). Ensure uploaded files are genuine PNG, JPEG, WebP, GIF, PDF, or plain-text documents under 10 MB.
