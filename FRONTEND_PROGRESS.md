# Frontend Progress — Event Workspace, Final Event Details & Auth Page

> **负责人**: Li Junxian
> **分支**: `junxian-frontend`
> **状态**: 前端页面完成，使用 Mock 数据，待后端 API 就绪后对接

---

## 一、本次更新内容

### 新增页面

| 页面 | 路由 | 文件 |
|------|------|------|
| **Auth Page** | 无路由（认证前显示） | `frontend/src/pages/AuthPage.tsx` |
| Event Workspace | `/events/:eventId/workspace` | `frontend/src/pages/EventWorkspace.tsx` |
| Final Event Details | `/events/:eventId/details` | `frontend/src/pages/EventDetails.tsx` |

### 修改文件

| 文件 | 改动说明 |
|------|----------|
| `frontend/src/api/Event.tsx` | 新增 5 个 TypeScript 类型，新增 5 个 Mock API 函数 |
| `frontend/src/App.tsx` | 移除 Amplify `<Authenticator>` 包裹，改用自定义认证状态管理；新增 2 条路由；Navbar 增加用户头像缩写和品牌图标 |
| `frontend/src/pages/EventList.tsx` | 改为卡片式布局，每个事件增加"Open →"链接进入 Workspace |
| `frontend/src/index.css` | 移除 Amplify CSS 覆写，只保留 Tailwind import |

### UI 技术栈

- **样式**: Tailwind CSS（全部页面使用 utility classes）
- **路由**: React Router v7（`useParams`, `useNavigate`, `useLocation`）
- **认证**: AWS Amplify Auth API（`signIn` / `signUp` / `confirmSignUp` / `getCurrentUser` / `Hub.listen`，**不再使用** `@aws-amplify/ui-react` 的 `Authenticator` 组件）

---

## 二、页面与路由一览

```
[未认证] → AuthPage（登录 / 注册 / 验证码）

[已认证]
/                          → EventList（事件列表）
/create                    → CreateEvent（创建事件向导）
/events/:eventId/workspace → EventWorkspace（可用时间 + 场地选择）
/events/:eventId/details   → EventDetails（确认后的只读摘要）
```

### AuthPage 功能说明

自定义认证页，完全脱离 Amplify UI 组件，直接调用 `aws-amplify/auth` 底层 API。

**布局**：左右分栏（桌面端）/ 单列（移动端）

| 区域 | 内容 |
|------|------|
| 左侧品牌面板 | 深靛蓝渐变背景、MidMeet Logo、标题标语、3 个功能亮点、点阵装饰 |
| 右侧表单区域 | 三个状态切换：Sign In / Sign Up / Verify Email |

**状态流转**：
```
Sign In ←→ Sign Up → Verify Email → Sign In（登录）
```

**各状态字段**：
- *Sign In*：Username、Password（可显示/隐藏）
- *Sign Up*：Username、Email、Password、Confirm Password
- *Verify Email*：6 位验证码（由 Cognito 发送到注册邮箱）

**Amplify Auth 函数调用**：
| 操作 | 函数 |
|------|------|
| 登录 | `signIn({ username, password })` |
| 注册 | `signUp({ username, password, options: { userAttributes: { email } } })` |
| 验证 | `confirmSignUp({ username, confirmationCode })` |

### EventWorkspace 功能说明

**Availability Tab**
- 展示 7 天 × 14 小时（8 AM–9 PM）的时间网格
- 用户可以**点击或拖拽**选中自己的空闲时段
- 颜色含义：

  | 颜色 | 含义 |
  |------|------|
  | 白色 | 未选中 |
  | 绿色 (`bg-green-400`) | 我已标记为可用 |
  | 浅靛蓝 (`bg-indigo-100`) | 部分参与者可用 |
  | 深靛蓝 (`bg-indigo-400`) | **全部**参与者可用 |
  | 祖母绿 (`bg-emerald-500`) | 全部参与者可用 + 我也可用（最佳时段）|

- 点击"Submit Availability"提交，调用后端接口保存时段

**Venue Tab**
- 懒加载推荐场地列表（切换到此 Tab 时才请求）
- 每张卡片展示：名称、地址、星级评分、距中心点距离、预计到达时间
- **只有活动创建者**可以点击"Select This Venue"确认场地（当前 isCreator 暂时硬编码为 `true`，见 TODO）
- 选定后跳转到 EventDetails 页面

### EventDetails 功能说明

- 渐变横幅展示活动标题和参与者
- 只读卡片展示：确认时间、场地（含地址/评分/距离）、参与者列表、场地类型
- 按钮：返回首页 / 查看 Workspace

---

## 三、TypeScript 类型参考

所有类型定义在 `frontend/src/api/Event.tsx`：

```typescript
// 事件列表项（轻量）
type Event = {
  eventId: string;
  title?: string;
};

// 单个时间格子
type TimeSlot = {
  date: string;      // "YYYY-MM-DD"
  startHour: number; // 0–23，当前只用 8–21
};

// 参与者
type Participant = {
  userId: string;
  name: string;
};

// 事件完整详情
type EventDetail = {
  eventId: string;
  title: string;
  status: 'COLLECTING_AVAILABILITY' | 'SELECTING_VENUE' | 'FINALIZED';
  creatorId: string;
  participants: Participant[];
  venueType: string;
  dateRange: { start: string; end: string };
  selectedTime?: TimeSlot;    // 仅 FINALIZED 状态有值
  selectedVenue?: Venue;      // 仅 FINALIZED 状态有值
};

// 共同可用时段（后端计算结果）
type CommonTime = {
  date: string;
  startHour: number;
  count: number;              // 在此时段可用的参与者数量
  participantNames: string[]; // 具体哪些人可用
};

// 推荐场地
type Venue = {
  venueId: string;
  name: string;
  address: string;
  rating: number;             // 1–5
  distanceKm: number;         // 距地理中心点的距离（km）
  estimatedMinutes: number;   // 预计所有人到达所需时间（最大值或平均值，由后端定义）
};
```

---

## 四、Mock → 真实 API 对接指南

所有 Mock 函数位于 `frontend/src/api/Event.tsx`。后端就绪后，**逐一替换**以下函数内部实现即可，函数签名保持不变（其他页面无需改动）。

---

### 4.1 `fetchEvents()`

**当前 Mock 行为**
```typescript
// 固定返回 3 条 Mock 事件（500ms 延迟）
resolve([
  { eventId: "event-1", title: "Badminton Meetup" },
  { eventId: "event-2", title: "Lunch at Orchard" },
  { eventId: "event-3", title: "Weekend Hiking Trip" },
]);
```

**目标 API**
```
GET {API_BASE_URL}/events?userId={userId}
Authorization: Bearer {CognitoIdToken}
```

**预期响应格式**
```json
[
  { "eventId": "event-abc", "title": "Badminton Meetup" },
  { "eventId": "event-def", "title": "Lunch at Orchard" }
]
```

**前端适配工作**
- 从 `useAuthenticator` 获取当前用户的 `userId`（或 Cognito sub）作为查询参数
- 从 `import.meta.env.VITE_API_URL` 读取 base URL
- 添加 Authorization header（见第五节）

---

### 4.2 `createEvent(friendIds: string[])`

**当前 Mock 行为**
```typescript
// 只打印 console.log，无实际请求
console.log("Creating event with friends:", friendIds);
```

**目标 API**
```
POST {API_BASE_URL}/events
Authorization: Bearer {CognitoIdToken}
Content-Type: application/json
```

**请求 Body**
```json
{
  "creatorId": "user-alice",
  "participantIds": ["user-bob", "user-charlie"],
  "venueType": "Sports Hall",
  "dateRange": { "start": "2026-03-30", "end": "2026-04-05" }
}
```
> 注：`CreateEvent.tsx` 页面目前只有 `friendIds`，需要同时收集 `venueType` 和 `dateRange`（这是 CreateEvent 页面后续需要补充的字段）

**预期响应格式**
```json
{ "eventId": "event-xyz" }
```

**前端适配工作**
- `CreateEvent.tsx` 需要增加 venueType 选择和日期范围输入（目前缺失）
- 创建成功后跳转到 `/events/{eventId}/workspace`

---

### 4.3 `fetchEventById(eventId: string)`

**当前 Mock 行为**
```typescript
// 固定返回硬编码的 "Badminton Meetup"，日期 2026-03-30 ~ 2026-04-05
```

**目标 API**
```
GET {API_BASE_URL}/events/{eventId}
Authorization: Bearer {CognitoIdToken}
```

**预期响应格式**（与 `EventDetail` 类型对应）
```json
{
  "eventId": "event-xyz",
  "title": "Badminton Meetup",
  "status": "COLLECTING_AVAILABILITY",
  "creatorId": "user-alice",
  "participants": [
    { "userId": "user-alice", "name": "Alice" },
    { "userId": "user-bob", "name": "Bob" }
  ],
  "venueType": "Sports Hall",
  "dateRange": { "start": "2026-03-30", "end": "2026-04-05" }
}
```

> `status` 字段影响页面行为：`FINALIZED` 状态下，应直接跳转到 EventDetails 页面

---

### 4.4 `submitAvailability(eventId, userId, slots[])`

**当前 Mock 行为**
```typescript
// 打印 console.log，600ms 延迟后 resolve
```

**目标 API**
```
PUT {API_BASE_URL}/events/{eventId}/availability
Authorization: Bearer {CognitoIdToken}
Content-Type: application/json
```

**请求 Body**
```json
{
  "userId": "user-alice",
  "availableTimeSlots": [
    { "date": "2026-03-31", "startHour": 14 },
    { "date": "2026-03-31", "startHour": 15 },
    { "date": "2026-04-02", "startHour": 10 }
  ]
}
```

**预期响应**：`200 OK`（空 body 或确认消息）

**前端适配工作**
- `userId` 目前使用 `user?.username`（Cognito username），需与后端约定统一用 **Cognito sub** 还是 **username**
- 提交成功后前端会刷新 `commonTimes`，后端需确保提交后立即能查询到最新数据

---

### 4.5 `fetchCommonTimes(eventId: string)`

**当前 Mock 行为**
```typescript
// 固定返回 9 条硬编码的重叠时段（600ms 延迟）
```

**目标 API**
```
GET {API_BASE_URL}/events/{eventId}/common-times
Authorization: Bearer {CognitoIdToken}
```

**预期响应格式**
```json
[
  {
    "date": "2026-03-31",
    "startHour": 14,
    "count": 3,
    "participantNames": ["Alice", "Bob", "Charlie"]
  }
]
```

**说明**
- 此接口由后端负责计算所有参与者时段的交集
- `count` 为在该时段标记可用的人数；`participantNames` 用于前端 tooltip 展示
- 前端会在**加载 Workspace 时**和**用户提交可用性后**各调用一次

---

### 4.6 `fetchVenues(eventId: string)`

**当前 Mock 行为**
```typescript
// 固定返回 3 个新加坡场地（700ms 延迟）
```

**目标 API**
```
GET {API_BASE_URL}/events/{eventId}/venues
Authorization: Bearer {CognitoIdToken}
```

**预期响应格式**
```json
[
  {
    "venueId": "venue-abc",
    "name": "ActiveSG Bishan Sports Hall",
    "address": "513 Bishan St 13, Singapore 570513",
    "rating": 4.5,
    "distanceKm": 1.2,
    "estimatedMinutes": 18
  }
]
```

**说明**
- 后端通过 Google Distance Matrix API 计算地理中心点和各参与者行程时间
- `distanceKm`：场地距所有参与者地理中心点的距离
- `estimatedMinutes`：建议定义为**所有参与者行程时间的最大值**（保证公平性）
- 前端切换到 Venue Tab 时**懒加载**此接口（避免不必要请求）

---

### 4.7 `finalizeEvent(eventId, slot, venueId)`

**当前 Mock 行为**
```typescript
// 打印 console.log，500ms 延迟后跳转到 EventDetails 页面
```

**目标 API**
```
PUT {API_BASE_URL}/events/{eventId}/finalize
Authorization: Bearer {CognitoIdToken}
Content-Type: application/json
```

**请求 Body**
```json
{
  "selectedTime": { "date": "2026-03-31", "startHour": 14 },
  "selectedVenueId": "venue-abc"
}
```

**预期响应**：`200 OK`

**前端适配工作**
- 调用成功后，`EventDetail.status` 应变为 `FINALIZED`
- 前端随即跳转到 `/events/{eventId}/details`，并通过 React Router `location.state` 传递 `selectedSlot` 和 `selectedVenue` 数据（见第六节）

---

## 五、认证集成注意事项

### 5.1 认证架构（已更新）

**旧方式**（已废弃）：`@aws-amplify/ui-react` 的 `<Authenticator>` + `useAuthenticator()`

**新方式**（当前实现）：自定义 `AuthPage.tsx` + `App.tsx` 中的认证状态机

```typescript
// App.tsx 认证状态管理
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

// 启动时检查会话
const user = await getCurrentUser();
// user.username → Cognito username
// user.userId   → Cognito sub（UUID 格式）

// 监听认证事件
Hub.listen("auth", ({ payload }) => {
  if (payload.event === "signedIn")  { /* 刷新用户信息 */ }
  if (payload.event === "signedOut") { /* 清空状态，显示 AuthPage */ }
});
```

其他页面（如 `EventWorkspace.tsx`）如需获取当前用户，使用：
```typescript
import { getCurrentUser } from "aws-amplify/auth";
const { username, userId } = await getCurrentUser();
```

> **注意**：`@aws-amplify/ui-react` 的 `useAuthenticator()` hook 在当前架构中**不再可用**，因为 `<Authenticator>` Provider 已被移除。

### 5.2 待确认事项（需前后端对齐）

1. **userId 统一用哪个字段**：建议使用 `userId`（即 Cognito sub，UUID 格式），因为 `username` 可能被用户修改
2. **Authorization Header 格式**：使用 Amplify v6 获取 token：
   ```typescript
   import { fetchAuthSession } from "aws-amplify/auth";
   const { tokens } = await fetchAuthSession();
   const idToken = tokens?.idToken?.toString();
   // 在所有 API 请求 header 中加入：Authorization: `Bearer ${idToken}`
   ```
3. **isCreator 判断**（`EventWorkspace.tsx` 中）：
   ```typescript
   // 当前（临时硬编码）：
   const isCreator = true;

   // 对接后改为（先获取当前用户）：
   const { userId } = await getCurrentUser();
   const isCreator = userId === event?.creatorId;
   ```

4. **EventList 中获取当前用户**：`fetchEvents()` 对接时需要传入 `userId`，同样通过 `getCurrentUser()` 获取

---

## 六、已知限制 & TODO

### 高优先级（对接前必须修复）

- [ ] **`isCreator` 硬编码**：`EventWorkspace.tsx` 中 `const isCreator = true`，需替换为真实判断（见第五节）
- [ ] **EventDetails 刷新丢失**：页面数据通过 React Router `location.state` 传递，刷新后丢失。对接后应改为调用 `fetchEventById(eventId)` 从 API 获取 FINALIZED 事件的完整数据
- [ ] **EventList 未按用户过滤**：`fetchEvents()` 目前返回全量 Mock 数据，对接时需传入 `userId` 参数
- [ ] **CreateEvent 缺少字段**：`CreateEvent.tsx` 只收集 `friendIds`，缺少 `venueType` 和 `dateRange`，这些是创建事件 API 的必要参数

### 中优先级

- [ ] **API 错误处理**：目前所有 API 调用无 try/catch，对接后需添加错误提示（Toast 或内联错误信息）
- [ ] **时区处理**：日期使用本地时区字符串（如 `"2026-03-31"`），需与后端约定是否统一用 UTC
- [ ] **EventList 的事件元数据**：`MOCK_VENUE_TYPES` 数组（`EventList.tsx` 第 9 行）是硬编码的展示数据，需从 API 返回的 `EventDetail` 中读取真实 `venueType`
- [ ] **提交可用性后刷新公共时段**：当前提交后不会重新请求 `fetchCommonTimes`，对接后需在 `handleSubmitAvailability` 成功回调中刷新

### 低优先级

- [ ] **触屏拖拽支持**：可用性网格目前只支持鼠标（`onMouseDown/MouseEnter/MouseUp`），移动端需补充 Touch 事件
- [ ] **CreateEvent.tsx 样式迁移**：该页面尚未使用 Tailwind utility classes，风格与其他页面不一致
- [ ] **AuthPage — Forgot Password 流程**：按钮 UI 已存在但功能未实现，需调用 `resetPassword` + `confirmResetPassword`（`aws-amplify/auth`）
- [ ] **AuthPage — Resend Code**：验证码页面的"Resend code"按钮未实现，需调用 `resendSignUpCode({ username })`

---

## 七、本地开发启动

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖（首次）
npm install

# 3. 配置环境变量（复制 .env.example 并填写）
cp .env.example .env
# 编辑 .env，填入：
#   VITE_USER_POOL_ID=your-cognito-user-pool-id
#   VITE_CLIENT_ID=your-cognito-app-client-id
#   VITE_API_URL=https://your-api.execute-api.region.amazonaws.com/prod/

# 4. 启动开发服务器
npm run dev
# 默认地址：http://localhost:5173

# 5. 访问 Mock 测试页面（无需后端）
# http://localhost:5173/events/event-1/workspace
# http://localhost:5173/events/event-2/workspace
```

> **注意**：访问任何页面需要先完成 Cognito 登录。若 User Pool 尚未配置，可在 `App.tsx` 中将 `status === "unauthed"` 的分支临时改为直接渲染 `<AppContent username="dev" onSignOut={() => {}} />`，跳过认证进行 UI 调试。

---

*文档最后更新：2026-03-25*
