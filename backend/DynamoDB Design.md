# MidMeet DynamoDB 单表设计方案

> 本文档描述 MidMeet 项目从多表方案迁移至 DynamoDB 单表设计的完整方案。
> 设计目标：充分利用 DynamoDB 单表特性，覆盖前端所有访问模式，并方便 Lambda 代码实现。

---

## 一、设计概述

### 1.1 为什么采用单表设计

DynamoDB 的单表设计（Single-Table Design）将多个实体类型存入一张表，通过精心设计的键结构实现原本需要跨表 Join 的查询。其核心优势：

- **减少网络往返**：一次 Query 可取回同一 partition 下的多种实体
- **降低运维复杂度**：只需管理一张表，CDK 基础设施更简洁
- **DynamoDB 原生模式**：按访问模式建模，而非按实体关系建模

### 1.2 原多表方案 vs 单表方案对比

| 旧方案（4表） | 新方案（1表） |
|---|---|
| `midmeet-{stage}-users` | `midmeet-{stage}-main` |
| `midmeet-{stage}-friendships` | （合并） |
| `midmeet-{stage}-events` | （合并） |
| `midmeet-{stage}-event-members` | （合并） |

Lambda 环境变量从 4 个表名变为 1 个表名 + GSI 名称。

---

## 二、表结构定义

### 2.1 主表与索引

**表名：** `midmeet-{stage}-main`

| 属性 | 类型 | 说明 |
|---|---|---|
| `PK` | String | 分区键（Partition Key） |
| `SK` | String | 排序键（Sort Key） |
| `GSI1PK` | String | GSI1 分区键（用户维度反向查询） |
| `GSI1SK` | String | GSI1 排序键 |
| `GSI2PK` | String | GSI2 分区键（Email 查用户） |
| `GSI2SK` | String | GSI2 排序键 |

**GSI 定义：**

- **GSI1** (`GSI1PK` → `GSI1SK`)：用于「查询某用户参与的所有活动」
- **GSI2** (`GSI2PK` → `GSI2SK`)：用于「按 email 查找用户」（可选能力，非好友请求必需）

两个 GSI 均使用 `ProjectionType.ALL`，投影全部属性。

### 2.2 CDK Stack 代码示例

```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

// Single main table replacing 4 separate tables
const mainTable = new dynamodb.Table(this, 'MainTable', {
  tableName: `${prefix}-main`,  // e.g., midmeet-dev-main
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  removalPolicy,
});

// GSI1: reverse lookup — query all events a user is a member of
mainTable.addGlobalSecondaryIndex({
  indexName: 'GSI1',
  partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
  sortKey:      { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

// GSI2: email lookup — optional capability for account discovery
mainTable.addGlobalSecondaryIndex({
  indexName: 'GSI2',
  partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
  sortKey:      { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```

**Lambda 环境变量（新）：**

```typescript
environment: {
  STAGE: stage,
  MAIN_TABLE: mainTable.tableName,   // e.g., midmeet-dev-main
  MAIN_TABLE_GSI1: 'GSI1',           // user-centric reverse lookup
  MAIN_TABLE_GSI2: 'GSI2',           // optional email lookup
},
```

---

## 三、Item 类型详细说明

表中混合存放 4 种 Item 类型，每条记录必须包含 `Type` 字段以便 Lambda 区分。

### 键前缀约定（Key Prefix Convention）

| 前缀 | 含义 |
|---|---|
| `USER#<userId>` | 用户相关 |
| `EVENT#<eventId>` | 活动相关 |
| `FRIEND#<friendId>` | 好友关系 SK |
| `EMAIL#<email>` | Email GSI 前缀 |
| `PROFILE` | 用户 profile 的 SK |
| `METADATA` | 活动 metadata 的 SK |

> **命名约定：** 前缀统一大写，ID 部分保持原样（Cognito sub 或 UUID）。
> 禁止混用风格，例如不能用 `User#123` 和 `USER#123` 混存。

---

### 3.1 UserProfile（用户资料）

用于存储用户的个人信息、位置偏好和兴趣标签。

**键设计：**

| 键 | 值 | 说明 |
|---|---|---|
| `PK` | `USER#<userId>` | userId = Cognito sub |
| `SK` | `PROFILE` | 固定值 |
| `GSI2PK` | `EMAIL#<email>` | 用于 email 反向查询 |
| `GSI2SK` | `PROFILE` | 固定值 |

**字段列表：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `PK` | String | 是 | `USER#<userId>` |
| `SK` | String | 是 | `PROFILE` |
| `Type` | String | 是 | 固定值 `"UserProfile"` |
| `userId` | String | 是 | Cognito sub，冗余存储方便读取 |
| `name` | String | 是 | 显示名称 |
| `email` | String | 是 | 邮箱（GSI2 键） |
| `approxArea` | String | 否 | 大致区域，如 `"Jurong East"`（前端 `address` 字段映射至此） |
| `exactAddress` | String | 否 | 精确地址（**敏感字段，仅 GET /users/me 返回，GET /users/:userId 不返回**） |
| `transportType` | String | 否 | 出行方式：`WALK` / `MRT` / `BUS` / `CAR` |
| `interests` | List\<String\> | 否 | 兴趣标签扁平数组（前端契约格式），如 `["badminton", "japanese food"]` |
| `preferences` | Map | 否 | 结构化偏好（可选扩展用） |
| `preferences.sports` | List\<String\> | 否 | 运动偏好 |
| `preferences.foodTypes` | List\<String\> | 否 | 餐饮偏好 |
| `preferences.gatheringTypes` | List\<String\> | 否 | 聚会类型偏好 |
| `preferences.venuePreferences` | List\<String\> | 否 | 场地类型偏好 |
| `preferences.timePreferences` | List\<String\> | 否 | 时间偏好 |
| `GSI2PK` | String | 是 | `EMAIL#<email>` |
| `GSI2SK` | String | 是 | `PROFILE` |
| `createdAt` | String | 是 | ISO 8601，如 `"2026-03-31T10:00:00Z"` |
| `updatedAt` | String | 是 | ISO 8601 |

**JSON 示例：**

```json
{
  "PK": "USER#cognito-sub-abc123",
  "SK": "PROFILE",
  "Type": "UserProfile",
  "userId": "cognito-sub-abc123",
  "name": "Alice",
  "email": "alice@example.com",
  "approxArea": "Jurong East",
  "exactAddress": "123 Jurong East Street 21, #04-01, Singapore 600123",
  "transportType": "MRT",
  "interests": ["badminton", "japanese food", "hiking"],
  "preferences": {
    "sports": ["badminton", "running"],
    "foodTypes": ["japanese", "hotpot"],
    "gatheringTypes": ["study", "meal"],
    "venuePreferences": ["cafe", "library"],
    "timePreferences": ["weekday_evening", "weekend_afternoon"]
  },
  "GSI2PK": "EMAIL#alice@example.com",
  "GSI2SK": "PROFILE",
  "createdAt": "2026-03-31T10:00:00Z",
  "updatedAt": "2026-03-31T10:00:00Z"
}
```

---

### 3.2 Friendship（好友关系）

每对好友关系存储**两条对称记录**（A→B 和 B→A），方便双向查询。好友请求状态也通过此结构管理。

**键设计：**

| 键 | 值 | 说明 |
|---|---|---|
| `PK` | `USER#<userId>` | 关系所属用户 |
| `SK` | `FRIEND#<friendId>` | 对方用户 ID |

**字段列表：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `PK` | String | 是 | `USER#<userId>` |
| `SK` | String | 是 | `FRIEND#<friendId>` |
| `Type` | String | 是 | 固定值 `"Friendship"` |
| `userId` | String | 是 | 关系所属用户 ID（冗余存储） |
| `friendId` | String | 是 | 对方用户 ID（冗余存储） |
| `status` | String | 是 | `PENDING` / `ACCEPTED` |
| `requestedBy` | String | 是 | 发起请求的用户 ID（用于区分谁发送了请求） |
| `createdAt` | String | 是 | ISO 8601 |
| `updatedAt` | String | 是 | ISO 8601 |

**JSON 示例（A 向 B 发送好友请求时写入两条记录）：**

```json
// Record 1: A's perspective (requester)
{
  "PK": "USER#user-alice",
  "SK": "FRIEND#user-bob",
  "Type": "Friendship",
  "userId": "user-alice",
  "friendId": "user-bob",
  "status": "PENDING",
  "requestedBy": "user-alice",
  "createdAt": "2026-03-31T10:00:00Z",
  "updatedAt": "2026-03-31T10:00:00Z"
}

// Record 2: B's perspective (recipient)
{
  "PK": "USER#user-bob",
  "SK": "FRIEND#user-alice",
  "Type": "Friendship",
  "userId": "user-bob",
  "friendId": "user-alice",
  "status": "PENDING",
  "requestedBy": "user-alice",
  "createdAt": "2026-03-31T10:00:00Z",
  "updatedAt": "2026-03-31T10:00:00Z"
}
```

**好友请求推导逻辑（Lambda）：**

- **我的好友列表**：Query `PK=USER#uid, SK begins_with FRIEND#`，过滤 `status=ACCEPTED`
- **我收到的请求**：Query `PK=USER#uid, SK begins_with FRIEND#`，过滤 `status=PENDING AND requestedBy ≠ uid`
- **接受请求**：同时 UpdateItem 两条记录 `status → ACCEPTED`
- **删除好友**：同时 DeleteItem 两条记录

---

### 3.3 EventInfo（活动信息）

存储活动的核心元数据，包括状态、时间范围、最终选定时间和场地。

**键设计：**

| 键 | 值 | 说明 |
|---|---|---|
| `PK` | `EVENT#<eventId>` | eventId = UUID |
| `SK` | `METADATA` | 固定值 |

> EventInfo 不参与 GSI1/GSI2。查询「某用户创建的活动」通过 EventMember（role=CREATOR）实现，无需在 EventInfo 上建额外索引。

**字段列表：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `PK` | String | 是 | `EVENT#<eventId>` |
| `SK` | String | 是 | `METADATA` |
| `Type` | String | 是 | 固定值 `"EventInfo"` |
| `eventId` | String | 是 | UUID，冗余存储 |
| `creatorId` | String | 是 | 创建者 userId（Cognito sub） |
| `title` | String | 是 | 活动标题 |
| `description` | String | 否 | 活动描述 |
| `venueType` | String | 是 | 场地类型：`Cafe` / `Park` / `Restaurant` / `Mall` / `Library` / `Sports Hall` |
| `dateRange` | Map | 是 | `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }` |
| `status` | String | 是 | 见状态机（第五节） |
| `selectedTime` | Map | 否 | 最终选定时间（status ≥ AWAITING_CONFIRMATION 时填写）：`{ "date": "YYYY-MM-DD", "startHour": 14 }` |
| `selectedVenue` | Map | 否 | 最终选定场地（status ≥ AWAITING_CONFIRMATION 时填写） |
| `selectedVenue.venueId` | String | — | 场地 ID |
| `selectedVenue.name` | String | — | 场地名称 |
| `selectedVenue.address` | String | — | 场地地址 |
| `selectedVenue.rating` | Number | — | 评分 0.0–5.0 |
| `selectedVenue.distanceKm` | Number | — | 到中点距离（km） |
| `selectedVenue.estimatedMinutes` | Number | — | 预计出行时间（分钟） |
| `createdAt` | String | 是 | ISO 8601 |
| `updatedAt` | String | 是 | ISO 8601 |

**JSON 示例（活动已定稿）：**

```json
{
  "PK": "EVENT#evt-uuid-001",
  "SK": "METADATA",
  "Type": "EventInfo",
  "eventId": "evt-uuid-001",
  "creatorId": "user-alice",
  "title": "Badminton at Bishan",
  "description": "Casual game, all skill levels welcome",
  "venueType": "Sports Hall",
  "dateRange": { "start": "2026-04-10", "end": "2026-04-20" },
  "status": "FINALIZED",
  "selectedTime": { "date": "2026-04-15", "startHour": 14 },
  "selectedVenue": {
    "venueId": "venue-bishan-cc",
    "name": "Bishan Community Club",
    "address": "51 Bishan Street 13, Singapore 579799",
    "rating": 4.2,
    "distanceKm": 1.8,
    "estimatedMinutes": 12
  },
  "createdAt": "2026-03-31T10:00:00Z",
  "updatedAt": "2026-04-15T09:00:00Z"
}
```

---

### 3.4 EventMember（活动成员）

记录用户与活动的参与关系，包括角色、邀请状态、可用时间段。

这是整个单表设计中**最核心的 Item 类型**：
- 通过 GSI1 支持「查询用户参与的所有活动」
- 通过主表支持「查询活动的所有成员及其状态」
- 聚合后推导 `slotCounts`、`confirmedUserIds` 等前端所需字段

**键设计：**

| 键 | 值 | 说明 |
|---|---|---|
| `PK` | `EVENT#<eventId>` | 活动维度 |
| `SK` | `USER#<userId>` | 成员维度 |
| `GSI1PK` | `USER#<userId>` | 用户维度反向索引 |
| `GSI1SK` | `EVENT#<eventId>` | 支持按活动 ID 查找 |

**字段列表：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `PK` | String | 是 | `EVENT#<eventId>` |
| `SK` | String | 是 | `USER#<userId>` |
| `Type` | String | 是 | 固定值 `"EventMember"` |
| `eventId` | String | 是 | 冗余存储 |
| `userId` | String | 是 | 冗余存储 |
| `role` | String | 是 | `CREATOR` / `PARTICIPANT` |
| `inviteStatus` | String | 是 | `PENDING` / `ACCEPTED` / `DECLINED` |
| `hasSubmittedAvailability` | Boolean | 是 | 是否已提交可用时间（初始值 `false`） |
| `availableTimeSlots` | List\<String\> | 否 | 可用时间段列表，格式 `"YYYY-MM-DD-HH"`，如 `["2026-04-15-14", "2026-04-15-15"]` |
| `GSI1PK` | String | 是 | `USER#<userId>` |
| `GSI1SK` | String | 是 | `EVENT#<eventId>` |
| `createdAt` | String | 是 | ISO 8601 |
| `updatedAt` | String | 是 | ISO 8601 |

> **时间格式说明：** `availableTimeSlots` 使用 `"YYYY-MM-DD-HH"` 格式（隐含 SGT/UTC+8），与前端格式保持一致，避免时区转换复杂度。

**JSON 示例（成员已提交可用时间）：**

```json
{
  "PK": "EVENT#evt-uuid-001",
  "SK": "USER#user-bob",
  "Type": "EventMember",
  "eventId": "evt-uuid-001",
  "userId": "user-bob",
  "role": "PARTICIPANT",
  "inviteStatus": "ACCEPTED",
  "hasSubmittedAvailability": true,
  "availableTimeSlots": [
    "2026-04-15-14",
    "2026-04-15-15",
    "2026-04-16-10"
  ],
  "GSI1PK": "USER#user-bob",
  "GSI1SK": "EVENT#evt-uuid-001",
  "createdAt": "2026-03-31T10:00:00Z",
  "updatedAt": "2026-04-10T08:30:00Z"
}
```

---

## 四、完整访问模式（Access Patterns）

以下列出所有前端 API 对应的 DynamoDB 访问模式：

### 4.1 用户相关

| # | API 端点 | DynamoDB 操作 | 说明 |
|---|---|---|---|
| 1 | `GET /users/me` | `GetItem(PK=USER#uid, SK=PROFILE)` | 返回完整 profile 包含 exactAddress |
| 2 | `PUT /users/me` | `PutItem / UpdateItem(PK=USER#uid, SK=PROFILE)` | 首次写入设 createdAt，后续只更新 updatedAt |
| 3 | `GET /users/:userId` | `GetItem(PK=USER#uid, SK=PROFILE)` | **不返回 exactAddress** |
| 4 | 按 email 查用户（内部可选） | `Query(GSI2, GSI2PK=EMAIL#email, GSI2SK=PROFILE)` | 用于账号发现/检索，不是好友请求必需步骤 |

### 4.2 好友相关

| # | API 端点 | DynamoDB 操作 | 说明 |
|---|---|---|---|
| 5 | `GET /friends` | `Query(PK=USER#uid, SK begins_with FRIEND#)` + filter `status=ACCEPTED`，再 `BatchGetItem` 获取 profile | 获取好友完整 profile |
| 6 | `GET /friends/{userId}` | `Query(PK=USER#uid, SK begins_with FRIEND#)` 后按状态拆分 `friends / incomingRequests / outgoingRequests`，再 `BatchGetItem` 获取 profile | 获取好友图谱快照 |
| 7 | `POST /friends/request` | 直接按 `targetUserId` 写入两条 Friendship 记录（`PutItem` × 2） | 先检查现有关系，冲突返回 409 |
| 8 | `PUT /friends/accept` | `UpdateItem(PK=USER#uid, SK=FRIEND#requesterUserId, status=ACCEPTED)` × 2（双向更新） | 请求体字段为 `requesterUserId` |
| 9 | `GET /friends/suggestions/{userId}` | 读取当前用户 profile + 扫描候选 profile，计算兴趣相似度后排序返回 | 当前用户无 profile 时返回空 suggestions |

> 发送好友请求采用宽松模式：后端不强依赖目标用户已有 `PROFILE` 记录，短期可用性更高，但可能出现 profile 字段尚未完善的关系记录。

### 4.3 活动相关

| # | API 端点 | DynamoDB 操作 | 说明 |
|---|---|---|---|
| 10 | `POST /events` | `PutItem` EventInfo + `PutItem` EventMember（creator） + `PutItem` × N（participants） | 一次创建活动及所有成员记录 |
| 11 | `GET /events` | `Query(GSI1, GSI1PK=USER#uid)` 得到所有 EventMember → `BatchGetItem` EventInfo | 再聚合成员数据构造 EventDetail |
| 12 | `GET /events/:eventId` | `GetItem(PK=EVENT#eid, SK=METADATA)` + `Query(PK=EVENT#eid, SK begins_with USER#)` | 后者获取全部成员及其状态，Lambda 聚合计算 slotCounts 等字段 |
| 13 | `DELETE /events/:eventId` | 验证 `creatorId === uid`；`DeleteItem` EventInfo + `Query` 所有 EventMember → `BatchWriteItem` 删除 | 仅 creator 可删除 |

### 4.4 可用时间提交与状态流转

| # | API 端点 | DynamoDB 操作 | 说明 |
|---|---|---|---|
| 14 | `POST /events/:eventId/availability` | `UpdateItem(PK=EVENT#eid, SK=USER#uid, availableTimeSlots=..., hasSubmittedAvailability=true)` | 更新后检查所有成员是否已提交；若是则 `UpdateItem(PK=EVENT#eid, SK=METADATA, status=SCHEDULING)` |
| 15 | `POST /events/:eventId/finalize` | 验证 creator；`UpdateItem(PK=EVENT#eid, SK=METADATA, selectedTime=..., selectedVenue=..., status=AWAITING_CONFIRMATION)` | 同时将所有非 creator 的 EventMember.inviteStatus 重置为 PENDING |
| 16 | `POST /events/:eventId/confirm` | `UpdateItem(PK=EVENT#eid, SK=USER#uid, inviteStatus=ACCEPTED)` | 更新后 Query 所有成员检查是否全部响应；若是则自动流转至 FINALIZED |
| 17 | `POST /events/:eventId/decline` | `UpdateItem(PK=EVENT#eid, SK=USER#uid, inviteStatus=DECLINED)` | 同上，全部响应后流转至 FINALIZED |
| 18 | `POST /events/:eventId/unfinalize` | 验证 creator；`UpdateItem` EventInfo（清除 selectedTime/selectedVenue，status→SCHEDULING）+ `UpdateItem` × N 重置所有成员 inviteStatus→PENDING | 撤回定稿 |

### 4.5 场地、Dashboard 与通知

| # | API 端点 | DynamoDB 操作 | 说明 |
|---|---|---|---|
| 19 | `GET /events/:eventId/venues` | `Query(PK=EVENT#eid, SK begins_with USER#)` 获取所有成员 + `BatchGetItem` UserProfile 取 approxArea/transportType | Lambda 计算地理中心，返回静态/外部 API 场地列表 |
| 20 | `GET /dashboard` | `Query(GSI1, GSI1PK=USER#uid)` → `BatchGetItem` EventInfo | Lambda 过滤：upcomingEvents（活跃活动取前3）+ pendingInvites（inviteStatus=PENDING 且 status=COLLECTING_AVAILABILITY） |
| 21 | `GET /notifications` | `Query(GSI1, GSI1PK=USER#uid)` → `BatchGetItem` EventInfo + `Query(PK=USER#uid, SK begins_with FRIEND#)` filter PENDING | Lambda 推导通知（见下文），无独立 Notification 表 |

---

## 五、活动状态机

```
                    创建活动
                       │
                       ▼
          COLLECTING_AVAILABILITY
           （收集所有参与者的可用时间）
                       │
          所有参与者均提交后自动流转
                       │
                       ▼
              SCHEDULING
   （创建者查看时间投票结果，同时选定最终时间和场地）
                       │
              创建者调用 finalize API
                       │
                       ▼
          AWAITING_CONFIRMATION
           （等待所有参与者确认/拒绝）
                       │
          所有参与者均响应后自动流转
                       │
                       ▼
               FINALIZED
              （活动已最终确定）
```

**状态说明：**

| 状态 | 触发条件 | 数据变化 |
|---|---|---|
| `COLLECTING_AVAILABILITY` | 创建活动时初始状态 | 所有 EventMember.inviteStatus = PENDING |
| `SCHEDULING` | 所有 EventMember.hasSubmittedAvailability = true | Lambda 检测后自动更新 EventInfo.status |
| `AWAITING_CONFIRMATION` | Creator 调用 finalize API | EventInfo 写入 selectedTime + selectedVenue，status → AWAITING_CONFIRMATION |
| `FINALIZED` | 所有参与者均响应（confirm/decline） | 最终状态，不可再修改（除非 unfinalize） |

---

## 六、通知推导逻辑（Notifications）

**通知不存储为独立 Item**，由 Lambda 在 `GET /notifications` 时实时推导：

```
GET /notifications 的推导步骤：

1. Query GSI1 (GSI1PK=USER#uid) → 获取用户所有 EventMember 记录
2. BatchGetItem 获取对应 EventInfo
3. 遍历每个 (EventMember, EventInfo) 对：

   a. 若 EventInfo.status = SCHEDULING AND EventMember.role = CREATOR
      → 推导 ALL_SUBMITTED 通知（所有人都提交了，创建者该选定时间和场地了）

   b. 若 EventInfo.status = AWAITING_CONFIRMATION
      AND EventMember.role = PARTICIPANT
      AND EventMember.inviteStatus = PENDING
      → 推导 ATTENDANCE_REQUEST 通知（需要确认/拒绝出席）

4. Query 主表 (PK=USER#uid, SK begins_with FRIEND#)
   过滤 status=PENDING AND requestedBy ≠ uid
   → 推导 FRIEND_REQUEST 通知
```

---

## 七、Lambda 代码模式参考

### 7.1 获取用户参与的所有活动（GET /events）

```javascript
// Step 1: get all EventMember items for this user via GSI1
const memberResult = await docClient.query({
  TableName: process.env.MAIN_TABLE,
  IndexName: process.env.MAIN_TABLE_GSI1,   // 'GSI1'
  KeyConditionExpression: 'GSI1PK = :userKey',
  ExpressionAttributeValues: { ':userKey': `USER#${userId}` },
}).promise();

// Step 2: extract unique eventIds
const eventIds = memberResult.Items.map(item => item.eventId);

// Step 3: batch get EventInfo for all events
const eventKeys = eventIds.map(id => ({
  PK: `EVENT#${id}`,
  SK: 'METADATA',
}));
const eventsResult = await docClient.batchGet({
  RequestItems: {
    [process.env.MAIN_TABLE]: { Keys: eventKeys },
  },
}).promise();
```

### 7.2 查询活动所有成员（内部工具函数）

```javascript
// Returns all EventMember items for a given event
async function getEventMembers(eventId) {
  const result = await docClient.query({
    TableName: process.env.MAIN_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `EVENT#${eventId}`,
      ':skPrefix': 'USER#',
    },
  }).promise();
  return result.Items;
}
```

### 7.3 计算 slotCounts（前端所需聚合字段）

```javascript
// Aggregates availableTimeSlots from all members into a count map
// Returns: Record<"YYYY-MM-DD-HH", number>
function computeSlotCounts(members) {
  const counts = {};
  for (const member of members) {
    for (const slot of (member.availableTimeSlots || [])) {
      counts[slot] = (counts[slot] || 0) + 1;
    }
  }
  return counts;
}
```

### 7.4 检查并触发状态流转

```javascript
// Called after a member submits availability
// Auto-transitions event to SCHEDULING when all members have submitted
async function checkAndAdvanceToScheduling(eventId) {
  const members = await getEventMembers(eventId);
  const allSubmitted = members.every(m => m.hasSubmittedAvailability === true);
  if (allSubmitted) {
    await docClient.update({
      TableName: process.env.MAIN_TABLE,
      Key: { PK: `EVENT#${eventId}`, SK: 'METADATA' },
      UpdateExpression: 'SET #s = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':status': 'SCHEDULING',
        ':now': new Date().toISOString(),
      },
    }).promise();
  }
}
```

---

## 八、注意事项与约定

### 8.1 安全规则

- `exactAddress` 是敏感字段，**只能在 `GET /users/me` 中返回**，`GET /users/:userId` 必须过滤掉
- 删除活动前必须验证 `EventInfo.creatorId === 请求方 userId`
- finalize / unfinalize 操作也需要验证 creator 身份

### 8.2 一致性规则

- 好友关系必须**同时写入/删除双向记录**，避免数据不一致
- 使用 `TransactWriteItems`（DynamoDB 事务）可确保双向写入的原子性（课程项目中可选用）

### 8.3 字段命名约定

| 规则 | 例子 |
|---|---|
| Key 前缀全大写 | `USER#`, `EVENT#`, `FRIEND#` |
| 字段名用 camelCase | `createdAt`, `inviteStatus`, `venueType` |
| 状态值全大写下划线 | `COLLECTING_AVAILABILITY`, `AWAITING_CONFIRMATION` |
| 角色值全大写 | `CREATOR`, `PARTICIPANT` |

### 8.4 与前端的字段映射

| 前端字段 | DynamoDB 字段 | 说明 |
|---|---|---|
| `User.address` | `UserProfile.approxArea` | 前端传 address，后端存 approxArea |
| `EventDetail.slotCounts` | 不落库 | Lambda 聚合 availableTimeSlots 实时计算 |
| `EventDetail.availabilitySubmittedBy` | 不落库 | 过滤 hasSubmittedAvailability=true 的成员 |
| `EventDetail.confirmedUserIds` | 不落库 | 过滤 inviteStatus=ACCEPTED 的成员 |
| `EventDetail.declinedUserIds` | 不落库 | 过滤 inviteStatus=DECLINED 的成员 |
| `EventDetail.pendingUserIds` | 不落库 | 过滤 inviteStatus=PENDING 的成员 |
| `EventDetail.participants` | 不落库 | 聚合 EventMember + UserProfile.name |

### 8.5 CDK 变更总结

从多表迁移到单表，CDK stack 的变化：

```diff
- usersTable
- friendshipsTable
- eventsTable
- eventMembersTable
+ mainTable (with GSI1 + GSI2)

Lambda environment variables:
- USERS_TABLE
- FRIENDSHIPS_TABLE
- EVENTS_TABLE
- EVENT_MEMBERS_TABLE
+ MAIN_TABLE
+ MAIN_TABLE_GSI1
+ MAIN_TABLE_GSI2
```
