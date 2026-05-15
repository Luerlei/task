# 部门任务管理看板系统 V2.0 — 设计书

基于 Node.js + Express + lowdb 后端和 Vue 3 CDN 单页前端，构建苹果风格的部门任务看板管理系统。V2.0 在 V1.0 基础上新增甘特图视图、任务分类、自定义优先级、可配置列/字段设置等功能。

---

## 一、系统架构

```
task/
├── server.js              # Express 服务入口（全部后端逻辑）
├── package.json           # 项目依赖
├── db.json                # lowdb 数据文件（运行时自动生成）
├── requirement.md         # 需求文档
├── spec.md                # V1.0 设计书
├── spec-v2.md             # V2.0 设计书（本文件）
├── chat.md                # 用户聊天记录
├── README.md              # 项目说明
├── LICENSE                # MIT 许可证
└── public/
    └── index.html         # 单文件前端（Vue 3 + CSS）
```

- **后端**：Node.js + Express + lowdb，RESTful API
- **前端**：单个 `index.html`，CDN 引入 Vue 3 + SortableJS
- **认证**：JWT token（7天有效期），存于 localStorage
- **部署**：局域网内一台电脑 `node server.js`，其他人通过 IP:3000 访问

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 (CDN) | Composition API，无需构建工具 |
| 拖拽 | SortableJS (CDN) | 卡片跨泳道拖拽 + 列设置拖拽排序 |
| 后端框架 | Express | 轻量 Node.js Web 框架 |
| 数据库 | lowdb v5 (ESM) | JSON 文件即数据库，零配置 |
| 认证 | jsonwebtoken | JWT 无状态认证 |
| 密码 | bcryptjs | bcrypt 哈希 |
| ID生成 | uuid | UUID v4 |

---

## 二、数据模型

### users（用户）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| username | string | 登录名，唯一 |
| password | string | 密码（bcrypt哈希） |
| displayName | string | 显示名称 |
| role | "admin" \| "member" | 角色 |
| group | string | 所属分组ID |
| totalPoints | number | 累计积分 |
| mustChangePassword | boolean | 是否需要修改密码 |
| createdAt | string(ISO) | 创建时间 |

### tasks（任务）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| title | string | 任务标题 |
| description | string | 任务描述 |
| creatorId | string | 创建者ID |
| assignees | string[] | 认领者ID列表（支持多人协作） |
| laneId | string | 当前泳道ID |
| rewardPoints | number | 悬赏分值 |
| deadline | string(ISO) | 期望完成时间 |
| startDate | string(ISO)\|null | 开始日期（V2.0新增） |
| endDate | string(ISO)\|null | 结束日期（V2.0新增） |
| category | string | 任务分类ID（V2.0新增） |
| priority | string | 优先级ID（V2.0改为引用） |
| createdAt | string(ISO) | 创建时间 |
| updatedAt | string(ISO) | 更新时间 |
| completedAt | string\|null | 完成时间 |

### lanes（泳道）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| name | string | 泳道名称 |
| order | number | 排序序号 |
| color | string | 标识颜色 |

默认泳道：待认领 → 进行中 → 待验收 → 已完成

### groups（用户分组）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| name | string | 分组名称 |

### categories（任务分类，V2.0新增）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| name | string | 分类名称 |
| color | string | 分类颜色 |

### priorities（自定义优先级，V2.0新增）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| name | string | 优先级名称 |
| color | string | 优先级颜色 |
| order | number | 排序序号 |

默认优先级：天（红）> 地（橙）> 玄（蓝）> 黄（灰）

### comments（评论）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| taskId | string | 任务ID |
| userId | string | 评论者ID |
| content | string | 评论内容 |
| createdAt | string(ISO) | 创建时间 |

### pointsHistory（积分记录）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(uuid) | 主键 |
| userId | string | 用户ID |
| taskId | string | 任务ID |
| points | number | 获得分值 |
| createdAt | string(ISO) | 记录时间 |

### settings（系统设置）
| 字段 | 类型 | 说明 |
|------|------|------|
| systemName | string | 系统名称（可自定义） |
| systemIcon | string | 系统图标 |
| menuNames | object | 各菜单名称自定义 |
| menuIcons | object | 各菜单图标自定义 |
| enableRegister | boolean | 是否开启注册 |
| enableOnlyMyTasks | boolean | 是否只显示我的任务 |

---

## 三、API 设计

### 认证
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 公开 | 登录，返回 JWT |
| POST | /api/auth/register | 公开（可关闭） | 用户注册 |
| GET | /api/auth/me | 登录 | 获取当前用户 |
| PUT | /api/auth/password | 登录 | 修改密码 |

### 用户管理
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/users | 管理员 | 用户列表 |
| POST | /api/users | 管理员 | 创建用户 |
| PUT | /api/users/:id | 管理员 | 编辑用户 |
| DELETE | /api/users/:id | 管理员 | 删除用户 |

### 分组管理
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/groups | 登录 | 分组列表 |
| POST | /api/groups | 管理员 | 创建分组 |
| PUT | /api/groups/:id | 管理员 | 编辑分组 |
| DELETE | /api/groups/:id | 管理员 | 删除分组 |

### 泳道管理
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/lanes | 登录 | 泳道列表 |
| POST | /api/lanes | 管理员 | 创建泳道 |
| PUT | /api/lanes/:id | 管理员 | 编辑泳道 |
| DELETE | /api/lanes/:id | 管理员 | 删除泳道 |
| PUT | /api/lanes/reorder | 管理员 | 调整顺序 |

### 任务管理
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/tasks | 登录 | 任务列表 |
| POST | /api/tasks | 管理员 | 创建任务 |
| PUT | /api/tasks/:id | 管理员 | 编辑任务 |
| DELETE | /api/tasks/:id | 管理员 | 删除任务 |
| POST | /api/tasks/:id/claim | 登录 | 认领任务 |
| POST | /api/tasks/:id/unclaim | 登录 | 取消认领 |
| PUT | /api/tasks/:id/move | 登录 | 拖动到泳道 |
| PUT | /api/tasks/:id/dates | 登录 | 更新开始/结束日期（V2.0） |

### 分类管理（V2.0新增）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/categories | 登录 | 分类列表 |
| POST | /api/categories | 管理员 | 创建分类 |
| PUT | /api/categories/:id | 管理员 | 编辑分类 |
| DELETE | /api/categories/:id | 管理员 | 删除分类 |

### 优先级管理（V2.0新增）
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/priorities | 登录 | 优先级列表 |
| POST | /api/priorities | 管理员 | 创建优先级 |
| PUT | /api/priorities/:id | 管理员 | 编辑优先级 |
| DELETE | /api/priorities/:id | 管理员 | 删除优先级 |

### 评论
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/tasks/:id/comments | 登录 | 获取评论 |
| POST | /api/tasks/:id/comments | 登录 | 添加评论 |

### 排行榜
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/leaderboard | 登录 | 积分排行 |

### 系统设置
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/settings | 公开 | 获取系统设置 |
| PUT | /api/settings | 管理员 | 更新系统设置 |

---

## 四、权限设计

| 功能 | 管理员 | 普通成员 |
|------|--------|----------|
| 查看看板 | ✅ | ✅ |
| 创建/编辑/删除任务 | ✅ | ❌ |
| 认领/取消认领任务 | ✅ | ✅ |
| 拖拽移动任务 | ✅ | ✅ |
| 管理用户/分组 | ✅ | ❌ |
| 管理泳道 | ✅ | ❌ |
| 管理分类/优先级 | ✅ | ❌ |
| 系统设置 | ✅ | ❌ |
| 查看排行榜 | ✅ | ✅ |
| 发表评论 | ✅ | ✅ |

---

## 五、前端页面设计

### 整体布局

```
┌──────────────────────────────────────────────────────────────┐
│  顶栏：系统名称/图标   📋看板  ⚙设置   🌙主题  用户头像/退出  │
├──────────┬───────────────────────────────────────────────────┤
│ 排行榜    │            主内容区                                │
│ 1.张三 🏆 │  [搜索] [优先级▼] [认领者▼] [创建者▼] [分组▼]      │
│ 2.李四    │  [卡片|列表|甘特图]  [横|纵]                       │
│ 3.王五    │                                                   │
│ ...      │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│          │  │待认领 │ │进行中│ │待验收 │ │已完成 │            │
│          │  │ 卡片  │ │ 卡片  │ │ 卡片  │ │ 卡片  │            │
│          │  └──────┘ └──────┘ └──────┘ └──────┘            │
└──────────┴───────────────────────────────────────────────────┘
```

### 三种视图模式

#### 1. 卡片视图
- 泳道列按 order 排列
- 支持横向/纵向切换
- 卡片跨泳道拖拽
- **字段设置**：卡片上显示的字段可配置，设定信息按用户绑定
- 可配置字段：优先级、标题、分值、描述、截止日期、开始日期、结束日期、分类、认领者、创建者

#### 2. 列表视图
- 表格展示所有任务
- **列设置**：展示列可设定，支持拖拽调整顺序
- 列设定信息跟用户绑定，不同用户可应用自己的设定
- 默认展示所有任务属性
- 可选字段：泳道、优先级、标题、描述、分值、截止日期、开始日期、结束日期、分类、认领者、创建者、创建时间

#### 3. 甘特图视图（V2.0新增）
- 按任务分类折叠/展开
- 支持按天、周、月查看
- 时间轴自动匹配任务时间范围
- 节假日底色突出显示
- 今天按钮快速定位

##### 甘特图交互
- 任务条拖动调整开始/结束时间（不实时保存，需点击保存按钮）
- 任务条整体拖动移动到不同日期
- 任务条点击打开详情
- 全部折叠/展开使用单个选择框，放最左侧

##### 甘特图左侧列
- 列字段支持设定展示（范围为任务所有属性）
- 列设置支持拖拽调整顺序
- 列设定信息跟用户绑定

##### 甘特图任务条
- 显示任务标题
- 显示优先级颜色
- 显示分数数字

### 任务卡片内容
- 优先级标签（颜色条 + 左侧边框）
- 标题
- 悬赏分值（右上角 💰）
- 任务描述
- 截止日期（年月日格式）
- 过期标识（醒目）
- 认领者头像列表
- 分类/创建者等（可配置）

### 任务创建/编辑
- 右侧滑出面板（Slide Panel）
- 字段：标题、描述、悬赏分值、期望完成时间、开始日期、结束日期、优先级、分类
- 底部评论列表

### 系统设置（三Tab）
1. **用户管理**：用户 CRUD + 分组管理
2. **字典设置**：分类管理 + 优先级管理
3. **功能设定**：功能开关 + 系统名称/图标 + 菜单名称/图标

### 用户个性化设置（localStorage per user）
- 甘特图列设置（显示哪些列 + 列顺序）
- 列表视图列设置（显示哪些列 + 列顺序）
- 卡片视图字段设置（显示哪些字段）

### 主题系统
- CSS 变量 + `data-theme="light|dark"` 切换
- Light：白底 `#FFFFFF`，卡片 `#F5F5F7`
- Dark：深灰底 `#1D1D1F`，卡片 `#2D2D2F`
- 过渡动画 0.3s

---

## 六、积分规则

- 任务创建时设定悬赏分值
- 任务完成后积分 **均分** 给所有认领者（总分值 ÷ 认领人数）
- 积分排行榜显示在左侧边栏
- 排行榜展示所有成员累计积分排名

---

## 七、泳道布局规则

### 横向模式（水平排列泳道）
- 泳道高度铺满页面窗口高度
- 泳道宽度自动匹配窗口（flex: 1）
- 卡片宽度自动适配泳道宽度
- 不出现横向滚动条

### 纵向模式（垂直排列泳道）
- 泳道宽度固定，内部可展示多行多列卡片
- 卡片使用固定宽度（约 250px）
- 泳道区域自动匹配窗口

---

## 八、功能开关

| 开关 | 说明 |
|------|------|
| enableRegister | 是否开启用户注册 |
| enableOnlyMyTasks | 是否只显示当前用户的任务（待认领泳道始终全部可见） |

---

## 九、设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 前端方案 | 单HTML + Vue 3 CDN | 降低部署复杂度 |
| 认证方案 | JWT（7天） | 无状态 |
| 密码存储 | bcrypt 哈希 | 基本安全保障 |
| 拖拽方案 | SortableJS | 可靠的跨列拖拽 |
| 甘特图 | 自定义 HTML/CSS + Vue | 轻量，无外部甘特库依赖 |
| 用户设置存储 | localStorage (per user key) | 无需后端持久化 |
| 数据库 | lowdb (JSON文件) | 零配置，适合小团队 |
| 初始管理员 | admin / admin123 | 首次登录提示改密 |

---

## 十、V2.0 相较 V1.0 新增内容

| 功能 | 说明 |
|------|------|
| 甘特图视图 | 完整的时间轴视图，支持拖动调整、分类折叠 |
| 任务分类 | 独立于用户分组的任务分类维度 |
| 自定义优先级 | 优先级名称和颜色可管理员自定义 |
| 开始/结束日期 | 任务新增时间范围属性 |
| 列表列设置 | 可选列 + 拖拽排序 + 用户绑定 |
| 卡片字段设置 | 卡片显示字段可配置 + 用户绑定 |
| 甘特图列设置 | 左侧列可选 + 拖拽排序 + 用户绑定 |
| 甘特图保存按钮 | 拖动不实时保存，手动确认 |
| 系统设置重组 | 用户管理、字典设置、功能设定三Tab |
