# DynamoDB Tables Overview

This project uses 4 DynamoDB tables, with one set for each environment.

## Dev Environment
- `midmeet-dev-users`
- `midmeet-dev-friendships`
- `midmeet-dev-events`
- `midmeet-dev-event-members`

## Prod Environment
- `midmeet-prod-users`
- `midmeet-prod-friendships`
- `midmeet-prod-events`
- `midmeet-prod-event-members`

---

# 1. Users Table / 用户信息表

## Table Name
- Dev: `midmeet-dev-users`
- Prod: `midmeet-prod-users`

## Purpose
- **English:** Stores user profile information, including basic user info, location, transport mode, personality tags, and preferences.
- **Chinese:** 保存用户资料信息，包括用户基本信息、位置、出行方式、性格和偏好。

## Primary Key
- Partition Key: `userId` (String)

## Indexes
### GSI: `email-index`
- Partition Key: `email` (String)

## Field Descriptions

| 字段 Field | 类型 Type | 必填 Required | 中文说明 | English Description |
|---|---|---:|---|---|
| `userId` | String | 是 Yes | 用户唯一标识，使用 Cognito User Pool 的 `sub` | Unique user identifier. Uses Cognito User Pool `sub`. |
| `name` | String | 是 Yes | 用户名称 | User display name. |
| `email` | String | 是 Yes | 用户邮箱，同时用于 `email-index` | User email address, also used in `email-index`. |
| `approxArea` | String | 否 No | 模糊位置，例如 `Jurong East` | Approximate area, e.g. `Jurong East`. |
| `exactAddress` | String | 否 No | 精确地址 | Exact address. |
| `transportType` | String | 否 No | 主要出行方式，例如 `WALK` / `MRT` / `BUS` / `CAR` | Main transport mode, e.g. `WALK` / `MRT` / `BUS` / `CAR`. |
| `personality` | List<String> | 否 No | 性格标签列表 | List of personality tags. |
| `preferences` | Map | 否 No | 用户偏好集合 | User preference object. |
| `preferences.sports` | List<String> | 否 No | 偏好的运动 | Preferred sports. |
| `preferences.foodTypes` | List<String> | 否 No | 偏好的食物类型 | Preferred food categories. |
| `preferences.gatheringTypes` | List<String> | 否 No | 偏好的聚会类型 | Preferred gathering types. |
| `preferences.venuePreferences` | List<String> | 否 No | 偏好的场所类型 | Preferred venue types. |
| `preferences.timePreferences` | List<String> | 否 No | 偏好的时间段 | Preferred time slots. |
| `createdAt` | String | 是 Yes | 创建时间，ISO 8601 格式 | Creation timestamp in ISO 8601 format. |
| `updatedAt` | String | 是 Yes | 更新时间，ISO 8601 格式 | Last updated timestamp in ISO 8601 format. |

## Example

```json
{
  "userId": "cognito-sub-123",
  "name": "Alice",
  "email": "alice@example.com",
  "approxArea": "Jurong East",
  "exactAddress": "123 Jurong East Street 21, Singapore",
  "transportType": "MRT",
  "personality": ["introvert", "planner"],
  "preferences": {
    "sports": ["badminton", "running"],
    "foodTypes": ["japanese", "hotpot"],
    "gatheringTypes": ["study", "meal", "project_meeting"],
    "venuePreferences": ["cafe", "library"],
    "timePreferences": ["weekday_evening", "weekend_afternoon"]
  },
  "createdAt": "2026-03-28T12:00:00Z",
  "updatedAt": "2026-03-28T12:00:00Z"
}
```

## Notes
- `userId` uses Cognito sub, not an auto-increment numeric ID.
- `email` should be unique and is used as a GSI query key.
- `exactAddress` is sensitive and should be handled carefully when returned to the frontend.
- `approxArea` is for coarse display/quick selection, while `exactAddress` is for more precise internal logic.

---

# 2. Friendships Table / 好友关系表

## Table Name
- Dev: `midmeet-dev-friendships`
- Prod: `midmeet-prod-friendships`

## Purpose
- **English:** Stores friendship relationships and friend request status.
- **Chinese:** 保存好友关系和好友申请状态。

## Primary Key
- Partition Key: `userId` (String)
- Sort Key: `friendId` (String)

## Indexes
- None

## Field Descriptions

| 字段 Field | 类型 Type | 必填 Required | 中文说明 | English Description |
|---|---|---:|---|---|
| `userId` | String | 是 Yes | 当前记录所属用户 | Owner of this friendship record. |
| `friendId` | String | 是 Yes | 另一方用户 ID | The other user's ID. |
| `status` | String | 是 Yes | 好友关系状态：`PENDING` / `ACCEPTED` | Friendship status: `PENDING` / `ACCEPTED`. |
| `requestedBy` | String | 是 Yes | 发起好友申请的用户 ID | User ID of the requester. |
| `createdAt` | String | 是 Yes | 创建时间，ISO 8601 格式 | Creation timestamp in ISO 8601 format. |
| `updatedAt` | String | 是 Yes | 更新时间，ISO 8601 格式 | Last updated timestamp in ISO 8601 format. |

## Example

```json
{
  "userId": "user-a",
  "friendId": "user-b",
  "status": "PENDING",
  "requestedBy": "user-a",
  "createdAt": "2026-03-28T12:00:00Z",
  "updatedAt": "2026-03-28T12:00:00Z"
}
```

## Notes
- Store two records for each friendship relationship: A -> B and B -> A.
- `requestedBy` must be kept to identify who initiated the request.
- There is no separate index for status, so filtering is done in application logic after querying by user.
- `friendId` must correspond to a valid userId in the Users table.

---

# 3. Events Table / 活动表

## Table Name
- Dev: `midmeet-dev-events`
- Prod: `midmeet-prod-events`

## Purpose
- **English:** Stores event-level information, including creator, title, description, current workflow status, final selected time, and final selected venue.
- **Chinese:** 保存活动本身的信息，包括活动创建者、标题、描述、当前流程状态、最终时间和最终场地。

## Primary Key
- Partition Key: `eventId` (String)

## Indexes
### GSI: `creatorId-createdAt-index`
- Partition Key: `creatorId` (String)
- Sort Key: `createdAt` (String)

## Field Descriptions

| 字段 Field | 类型 Type | 必填 Required | 中文说明 | English Description |
|---|---|---:|---|---|
| `eventId` | String | 是 Yes | 活动唯一标识 | Unique event identifier. |
| `creatorId` | String | 是 Yes | 创建者用户 ID | Creator user ID. |
| `title` | String | 是 Yes | 活动标题 | Event title. |
| `description` | String | 否 No | 活动描述 | Event description. |
| `venueType` | String | 否 No | 场所类型，例如 `cafe` / `library` / `restaurant` | Venue category, e.g. `cafe` / `library` / `restaurant`. |
| `selectedTime` | String | 否 No | 最终选定时间，ISO 8601 格式 | Final selected time in ISO 8601 format. |
| `selectedVenue` | Map/Object | 否 No | 最终选定场地信息 | Final selected venue information. |
| `status` | String | 是 Yes | 活动当前状态 | Current event workflow status. |
| `createdAt` | String | 是 Yes | 创建时间，ISO 8601 格式 | Creation timestamp in ISO 8601 format. |
| `updatedAt` | String | 是 Yes | 更新时间，ISO 8601 格式 | Last updated timestamp in ISO 8601 format. |

## Example

```json
{
  "eventId": "evt-001",
  "creatorId": "user-a",
  "title": "CS5224 Project Meeting",
  "description": "Discuss architecture and task split",
  "venueType": "cafe",
  "selectedTime": "2026-03-30T14:00:00Z",
  "selectedVenue": {
    "name": "Starbucks Utown",
    "address": "Utown, NUS"
  },
  "status": "TIME_SELECTING",
  "createdAt": "2026-03-28T12:00:00Z",
  "updatedAt": "2026-03-28T12:00:00Z"
}
```

## Notes
- `eventId` uses a string ID, not an auto-increment numeric ID.
- `creatorId` must correspond to a `userId` in the Users table.
- `status` represents the current workflow stage.
- Participant membership is not stored here as the main source of truth; it is stored in the EventMembers table.

---

# 4. EventMembers Table / 活动成员表

## Table Name
- Dev: `midmeet-dev-event-members`
- Prod: `midmeet-prod-event-members`

## Purpose
- **English:** Stores per-user participation records for each event, including role, invite status, available time slots, and departure locations.
- **Chinese:** 保存某个活动下每个用户的参与记录，包括角色、邀请状态、可用时间、出发地点。

## Primary Key
- Partition Key: `eventId` (String)
- Sort Key: `userId` (String)

## Indexes
### GSI: `userId-createdAt-index`
- Partition Key: `userId` (String)
- Sort Key: `createdAt` (String)

## Field Descriptions

| 字段 Field | 类型 Type | 必填 Required | 中文说明 | English Description |
|---|---|---:|---|---|
| `eventId` | String | 是 Yes | 活动 ID | Event ID. |
| `userId` | String | 是 Yes | 用户 ID | User ID. |
| `role` | String | 是 Yes | 角色：`CREATOR` / `PARTICIPANT` | Role: `CREATOR` / `PARTICIPANT`. |
| `inviteStatus` | String | 是 Yes | 邀请状态：`PENDING` / `ACCEPTED` / `DECLINED` | Invite status: `PENDING` / `ACCEPTED` / `DECLINED`. |
| `availableTimeSlots` | List | 否 No | 用户可参加的时间列表，ISO 8601 格式 | List of user-available time slots in ISO 8601 format. |
| `departureLocations` | List | 否 No | 该活动下可行的出发地点列表 | List of possible departure locations for this specific event. |
| `createdAt` | String | 是 Yes | 创建时间，ISO 8601 格式 | Creation timestamp in ISO 8601 format. |
| `updatedAt` | String | 是 Yes | 更新时间，ISO 8601 格式 | Last updated timestamp in ISO 8601 format. |

## Example

```json
{
  "eventId": "evt-001",
  "userId": "user-b",
  "role": "PARTICIPANT",
  "inviteStatus": "PENDING",
  "availableTimeSlots": [
    "2026-03-30T14:00:00Z",
    "2026-03-30T16:00:00Z"
  ],
  "departureLocations": [
    "NUS COM3",
    "Jurong East MRT"
  ],
  "createdAt": "2026-03-28T12:00:00Z",
  "updatedAt": "2026-03-28T12:00:00Z"
}
```

## Notes
- One record represents one user’s participation state in one event.
- `departureLocations` is event-specific and is not strongly coupled with `approxArea` in the Users table.
- `approxArea` from the Users table can be used as a quick option, but this field remains independently editable.
- There must be only one record for the same (`eventId`, `userId`) pair.
