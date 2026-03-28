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

TBA

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
